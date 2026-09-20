import { Button } from "@/components/ui/Button";

interface UnsavedResultBannerProps {
  loading: boolean;
  onRetrySave: () => void;
}

/** Shown when a stage computed a result but the checkpoint write failed after
 * retries (spec FR-080–FR-082) — the node is never re-run, only the save. */
export function UnsavedResultBanner({ loading, onRetrySave }: UnsavedResultBannerProps) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        border: `1px solid var(--color-warning)`,
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface)",
      }}
    >
      <span style={{ fontSize: "var(--text-sm)" }}>
        This step finished, but saving it failed. Your progress isn&apos;t lost — retry saving below.
      </span>
      <Button variant="primary" onClick={onRetrySave} disabled={loading} style={{ marginLeft: "auto" }}>
        {loading ? "Retrying…" : "Retry save"}
      </Button>
    </div>
  );
}
