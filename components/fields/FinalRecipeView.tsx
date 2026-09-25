import { useEffect, useState } from "react";
import type { Critique, DishImage as DishImageData, FinalRecipe } from "@/lib/agent/state";
import { DishImage } from "@/components/ui/DishImage";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export interface FinalRecipeViewProps {
  finalRecipe: FinalRecipe;
  /** True when `finalize` was reached with the critique still flagging a
   * blocking problem — the refine-cycle cap was hit before it passed clean
   * (`lib/agent/edges.ts`'s `finalizedAtRefineLimit`). */
  finalizedAtRefineLimit: boolean;
  refineCount: number;
  latestCritique: Critique | null;
  /** `null` covers every "no photo" cause uniformly (FR-004) — never
   * attempted, failed, timed out, or predates this feature. */
  dishImage: DishImageData | null;
  /** The signed `<img src>` for `dishImage`, or `null` alongside it — always
   * resolved server-side (feature 007, data-model.md §6), never here. */
  dishImageUrl: string | null;
  /** Regenerates just the photo, reusing this same recipe (feature 007) —
   * omitted (not just disabled) whenever it isn't meaningful; this
   * component additionally never shows the button while a photo already
   * exists, regardless of what the caller passes. */
  onRegenerateImage?: () => void;
  /** True while a `retry-image` request triggered by this same button is in
   * flight — disables the button (so a slow response can't be double-fired)
   * and swaps its label for the same spinner + elapsed-seconds indicator
   * `RunningStage.tsx` uses for the main Step/Play action, so a photo
   * regenerate reads as "the server is working" instead of looking inert. */
  regeneratingImage?: boolean;
}

/** Mirrors `RunningStage.tsx`'s own elapsed-time ticker — restarts from zero
 * each time `active` turns true, holds at 0 while inactive. */
function useElapsedSeconds(active: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => clearInterval(interval);
  }, [active]);
  return elapsedMs;
}

/** Read-only final recipe view (spec FR-022, FR-016) — includes the approximate nutrition estimate. */
export function FinalRecipeView({
  finalRecipe,
  finalizedAtRefineLimit,
  refineCount,
  latestCritique,
  dishImage,
  dishImageUrl,
  onRegenerateImage,
  regeneratingImage = false,
}: FinalRecipeViewProps) {
  const elapsedMs = useElapsedSeconds(regeneratingImage);
  return (
    <>
      <DishImage
        src={dishImageUrl}
        alt={dishImage?.alt ?? `Photo of ${finalRecipe.title}`}
        focalX={dishImage?.focalX}
        focalY={dishImage?.focalY}
        zoom={dishImage?.zoom}
        style={{ width: "100%", aspectRatio: "4 / 3", marginBottom: dishImageUrl ? "var(--space-4)" : "var(--space-2)" }}
      />

      {/* Only when there's genuinely no photo yet — never shown once one
          exists, regardless of what the caller passes (belt and suspenders
          on top of the caller's own visibility gating in app/page.tsx). */}
      {!dishImageUrl && onRegenerateImage && (
        <Button
          variant="secondary"
          onClick={onRegenerateImage}
          disabled={regeneratingImage}
          style={{
            marginBottom: "var(--space-4)",
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          {regeneratingImage ? (
            <>
              <Spinner />
              Generating photo… ({(elapsedMs / 1000).toFixed(1)}s)
            </>
          ) : (
            "Generate photo"
          )}
        </Button>
      )}

      {finalizedAtRefineLimit ? (
        <div
          role="status"
          style={{
            margin: "0 0 var(--space-4) 0",
            padding: "var(--space-3) var(--space-4)",
            border: "1px solid var(--color-warning)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
          }}
        >
          <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600, color: "var(--color-warning)" }}>
            Finalized at the refinement limit, not because it passed critique
          </p>
          <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--text-sm)" }}>
            After {refineCount} refinement cycle{refineCount === 1 ? "" : "s"}, the critique stage still flagged
            a blocking issue below, but the cycle cap was reached, so the recipe was finalized as-is instead of
            revising again. This cap exists to limit token usage — a recipe can otherwise keep going back and
            forth between critique and refine indefinitely.
          </p>
          {latestCritique && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              <strong>Last critique:</strong> {latestCritique.feasibility}
              {latestCritique.flavorBalance ? ` ${latestCritique.flavorBalance}` : ""}
            </p>
          )}
        </div>
      ) : (
        // The other, equally possible way `finalize` is reached — surfaced
        // just as explicitly as the limit-hit case above, so the final tab
        // never leaves it ambiguous which of the two actually happened.
        <div
          role="status"
          style={{
            margin: "0 0 var(--space-4) 0",
            padding: "var(--space-3) var(--space-4)",
            border: "1px solid var(--color-success)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: "var(--color-success)" }}>
            Passed critique — no blocking issues found
          </p>
          <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--text-sm)" }}>
            {refineCount > 0
              ? `The critique stage found no remaining blocking problems after ${refineCount} refinement cycle${refineCount === 1 ? "" : "s"}.`
              : "The critique stage found no blocking problems with feasibility or flavor on the first pass — no revisions were needed."}
          </p>
        </div>
      )}

      <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600 }}>{finalRecipe.title}</p>
      <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--text-sm)" }}>
        Serves {finalRecipe.scaledServings}
      </p>
      {/* `ingredients` was added to this schema after some already-finalized
          checkpoints were recorded — `StateSchema` is never actually parsed
          at runtime (data-model.md's own note re: `dishImage`), so an older
          checkpoint's stored JSON simply lacks the key and this reads as
          `undefined`, not `[]`. Same treatment for `toBuy`/`steps`, cheap
          insurance against the same class of gap. */}
      {(finalRecipe.ingredients?.length ?? 0) > 0 && (
        <ul style={{ margin: "0 0 var(--space-3) 0", paddingLeft: "var(--space-5)" }}>
          {finalRecipe.ingredients.map((ing, i) => (
            <li key={i}>
              {ing.quantity ? `${ing.quantity} ` : ""}
              {ing.name}
            </li>
          ))}
        </ul>
      )}
      <ol style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
        {(finalRecipe.steps ?? []).map((s) => (
          <li key={s.order}>
            {s.text}
            {s.minutes ? ` (${s.minutes} min)` : ""}
            {s.technique ? ` — ${s.technique}` : ""}
          </li>
        ))}
      </ol>
      {(finalRecipe.toBuy?.length ?? 0) > 0 && (
        <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          To buy: {finalRecipe.toBuy.join(", ")}
        </p>
      )}
      <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
        ~{finalRecipe.nutrition.calories} kcal, {finalRecipe.nutrition.protein}g protein,{" "}
        {finalRecipe.nutrition.carbs}g carbs, {finalRecipe.nutrition.fat}g fat per serving (approximate)
      </p>
    </>
  );
}
