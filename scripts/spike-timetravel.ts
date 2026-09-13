/**
 * Time-travel spike (research R3) — FINDINGS, confirmed against a real
 * Postgres wire protocol (PGlite via @electric-sql/pglite-socket) with
 * `@langchain/langgraph@1.4.15` + `@langchain/langgraph-checkpoint-postgres`
 * (tested 1.0.0 through 1.0.5 — identical behavior on every published 1.0.x
 * release, so this is not a version-specific regression).
 *
 * ── CONFIRMED BEHAVIOR ──────────────────────────────────────────────────
 *
 * 1. `updateState(config, values, asNode)` only applies `values` correctly
 *    when `asNode` is one of the names in that checkpoint's OWN `next` array.
 *    It never re-invokes a node's real logic — it always means "asNode just
 *    returned `values`", and advances `next` to whatever follows asNode along
 *    the graph's edges.
 *
 * 2. BUG: with `@langchain/langgraph-checkpoint-postgres` (all 1.0.x),
 *    calling `updateState` on a checkpoint that ALREADY HAS a child in the
 *    same thread (i.e. you are asking it to create a SECOND child / a true
 *    branch within one thread) silently drops the new `values` — the
 *    resulting checkpoint instead reflects whatever the *existing* sibling
 *    checkpoint holds. Confirmed root cause shape: a channel-version
 *    collision in the Postgres blob-versioning scheme between sibling
 *    checkpoints. `MemorySaver` does NOT have this bug (verified side by
 *    side) — it is specific to the Postgres checkpointer's storage scheme.
 *
 * 3. Plain `invoke(null, { configurable: { thread_id, checkpoint_id } })`
 *    (real execution, NOT updateState) targeting a HISTORICAL checkpoint
 *    works CORRECTLY and safely creates a proper sibling checkpoint
 *    (`metadata.source === "fork"`) — no version collision. This is the
 *    well-trodden "resume from an old checkpoint" path and is safe to rely
 *    on for RETRY (re-run the same stage from its parent — spec FR-052).
 *
 * 4. `updateState(config, values, asNode)` on a checkpoint that has NO
 *    existing child yet (in particular: the genesis checkpoint of a BRAND
 *    NEW, never-invoked `thread_id`, using `asNode = START`) works
 *    correctly every time — no collision is possible because nothing else
 *    has ever branched from it.
 *
 * ── DESIGN IMPACT (see the constitution/spec/plan discussion this spike
 *    triggered) ───────────────────────────────────────────────────────────
 *
 * A branch that needs EDITED values (Edit & Fork) MUST NOT be created via
 * `updateState` on a checkpoint in the same thread that already has (or may
 * later gain) a sibling. The only version of `updateState`-based forking
 * that is safe is seeding a brand-new LangGraph `thread_id`'s genesis
 * checkpoint. Retry (no edits, same input) can safely use plain `invoke`
 * from a historical checkpoint_id in the SAME thread.
 *
 * This script is a throwaway diagnostic, not part of the app. Run with
 * `npm run spike`.
 */
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { startTestDb } from "../tests/helpers/test-db";

const SpikeState = Annotation.Root({ value: Annotation<string>() });

async function main() {
  const testDb = await startTestDb();
  await testDb.migrate();
  const checkpointer = PostgresSaver.fromConnString(testDb.connectionString);
  await checkpointer.setup();

  try {
    const graph = new StateGraph(SpikeState)
      .addNode("nodeA", async (state) => ({ value: `${state.value}-A` }))
      .addNode("nodeB", async (state) => ({ value: `${state.value}-B` }))
      .addEdge(START, "nodeA")
      .addEdge("nodeA", "nodeB")
      .addEdge("nodeB", END);
    const app = graph.compile({ checkpointer, interruptAfter: ["nodeA", "nodeB"] });

    // --- Confirms finding 3: plain invoke() re-fork from a historical checkpoint ---
    const config = { configurable: { thread_id: "confirm-plain-refork" } };
    await app.invoke({ value: "start" }, config);
    const c0 = await app.getState(config);
    await app.invoke(null, config); // C0 now historical
    const refork = await app.invoke(null, c0.config);
    console.log("[3] plain invoke from historical checkpoint =>", refork, "(expect value: 'start-A-B')");

    // --- Confirms finding 4: updateState(asNode=START) on a fresh, never-invoked thread ---
    const freshConfig = { configurable: { thread_id: "confirm-fresh-seed" } };
    const seeded = await app.updateState(freshConfig, { value: "SEEDED" }, START);
    const seededResult = await app.invoke(null, seeded);
    console.log("[4] fresh-thread seed + real execution =>", seededResult, "(expect value: 'SEEDED-A')");
  } finally {
    await checkpointer.end();
    await testDb.stop();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("SPIKE FAILED:", err);
    process.exit(1);
  });
