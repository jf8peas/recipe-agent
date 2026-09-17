/**
 * A deterministic stand-in for `createChatModel`, used only in e2e tests
 * (gated by `RECIPE_AGENT_FAKE_MODEL=1` — never set in production). Real
 * `ChatOpenAI` + OpenRouter would make e2e specs slow, flaky, and dependent
 * on a paid API key; this reproduces the same `withStructuredOutput(...).
 * invoke(prompt)` shape the nodes call, reading test fixtures out of the
 * rendered prompt text (the nodes don't expose raw state to this layer, and
 * duplicating that plumbing isn't worth it for a test-only fixture).
 *
 * The entry form only collects ingredients (no constraints UI yet), so
 * fixture sentinels are embedded as an ingredient line instead — it's
 * classified usable (unless it's the literal ingredient-error sentinel
 * below), so its text also appears in every later stage's prompt (they all
 * list the usable ingredients), not just `parseIngredients`':
 * - `"e2e-trigger-failure-<nodeName>-<nonce>"` — that specific node throws
 *   once for that nonce (so a subsequent Retry succeeds), simulating a real
 *   stage failure. Keyed by node name so a spec can fail exactly one stage
 *   of its choosing without also failing `parseIngredients` during `/start`
 *   (which has no retry UI); the nonce (any unique string, e.g. a random
 *   id) keeps specs that run in parallel against this one shared server
 *   process from tripping each other's "already failed once" state.
 * - `"e2e-slow"` — every call sleeps ~2s first, giving Cancel time to fire
 *   before the fake "model" resolves.
 * An ingredient line of exactly `"rock"` (case-insensitive) is classified
 * unusable, to exercise the ingredient-error path.
 */

const failedOnce = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractNumberedLines(prompt: string): string[] {
  const matches = [...prompt.matchAll(/^\d+\.\s+(.+)$/gm)];
  return matches.map((m) => m[1]!.trim());
}

const FIXED_DIRECTIONS = [
  {
    title: "Spinach Frittata",
    summary: "A simple baked egg dish.",
    whyItFits: "Uses the eggs and greens.",
  },
  {
    title: "Veggie Omelet",
    summary: "A folded stovetop omelet.",
    whyItFits: "Quick and uses what's on hand.",
  },
];

const FIXED_DIRECTION_SELECTION = {
  selectedIndex: 0,
  explanation: "Spinach Frittata makes the best use of the ingredients.",
  clearFavorite: true,
};

const FIXED_DRAFT = {
  title: "Spinach Frittata",
  servings: 2,
  steps: [
    { order: 1, text: "Whisk the eggs.", minutes: 2, technique: null },
    { order: 2, text: "Cook until set.", minutes: 8, technique: "bake" },
  ],
  toBuy: [],
};

const FIXED_CRITIQUE = {
  feasibility: "Straightforward.",
  flavorBalance: "Balanced.",
  missingOrUnclear: [],
  blocking: false,
};

const FIXED_FINAL_RECIPE = {
  ...FIXED_DRAFT,
  scaledServings: 2,
  nutrition: { calories: 220, protein: 16, carbs: 4, fat: 15, note: "approximate" as const },
};

function fakeResponseFor(nodeName: string, prompt: string): unknown {
  switch (nodeName) {
    case "parseIngredients": {
      const lines = extractNumberedLines(prompt);
      return {
        ingredients: lines.map((raw) => {
          const isRock = raw.trim().toLowerCase() === "rock";
          return {
            raw,
            name: isRock ? null : raw,
            quantity: null,
            pantryStaple: false,
            usable: !isRock,
            reason: isRock ? ("not-food" as const) : null,
          };
        }),
      };
    }
    case "proposeDirections":
      return { directions: FIXED_DIRECTIONS };
    case "selectDirection":
      return { directionSelection: FIXED_DIRECTION_SELECTION };
    case "draftRecipe": {
      // Reflects whichever direction was actually selected (not always
      // FIXED_DIRECTIONS[0]) — draftRecipePrompt renders "Dish direction:
      // <title> — ...", so this stays "Spinach Frittata" whenever the
      // default candidate was picked (every existing fixture) and only
      // changes for a test that edits the selection to a different one.
      const directionMatch = prompt.match(/^Dish direction: (.+?) —/m);
      return { recipeDraft: { ...FIXED_DRAFT, title: directionMatch?.[1] ?? FIXED_DRAFT.title } };
    }
    case "critique":
      return { critique: FIXED_CRITIQUE };
    case "refine":
      return { recipeDraft: FIXED_DRAFT };
    case "finalize":
      return { finalRecipe: FIXED_FINAL_RECIPE };
    default:
      throw new Error(`fake-model: no fixture for node "${nodeName}"`);
  }
}

export function createFakeChatModel() {
  return {
    withStructuredOutput(_schema: unknown, opts: { name: string }) {
      return {
        async invoke(prompt: string, _config?: unknown) {
          if (prompt.includes("e2e-slow")) await sleep(2000);

          const failureMatch = prompt.match(new RegExp(`e2e-trigger-failure-${opts.name}-\\S+`));
          if (failureMatch && !failedOnce.has(failureMatch[0])) {
            failedOnce.add(failureMatch[0]);
            throw new Error("Simulated failure (e2e fixture)");
          }

          return fakeResponseFor(opts.name, prompt);
        },
      };
    },
  };
}
