"use client";

import { useSession } from "@/hooks/useSession";
import { EntryForm } from "@/components/EntryForm";
import { StageProgress } from "@/components/StageProgress";
import { StatePanel } from "@/components/StatePanel";
import { ActionToolbar } from "@/components/ActionToolbar";

export default function HomePage() {
  const { clientId, snapshot, loading, error, restoring, start, step, reset } = useSession();

  if (!clientId || restoring) {
    return (
      <main style={{ padding: "var(--space-6)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "var(--space-6)", maxWidth: "720px", margin: "0 auto" }}>
      {!snapshot ? (
        <>
          <h1 style={{ fontSize: "var(--text-xl)", marginTop: 0 }}>What&apos;s in your kitchen?</h1>
          <EntryForm onSubmit={(ingredients) => start(ingredients)} disabled={loading} />
          {error && (
            <p role="alert" style={{ marginTop: "var(--space-3)", color: "var(--color-danger)" }}>
              {error.message}
            </p>
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <StageProgress next={snapshot.next} outcome={snapshot.state.outcome} />
          <StatePanel state={snapshot.state} />
          <ActionToolbar
            next={snapshot.next}
            outcome={snapshot.state.outcome}
            loading={loading}
            error={error}
            onStep={() => step("step")}
            onRetry={() => step("retry")}
            onNewSession={reset}
          />
        </div>
      )}
    </main>
  );
}
