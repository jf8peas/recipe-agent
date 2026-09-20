export interface TabDef {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabDef[];
  activeId: string | null;
  onChange: (id: string) => void;
}

/** Generic `role="tablist"` control (spec 006 US3) — `RunTabs.tsx` supplies
 * the run-specific `TabId`/`STAGE_TO_TAB` semantics on top of this. */
export function Tabs({ tabs, activeId, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Stage outputs"
      style={{
        display: "flex",
        gap: "var(--space-1)",
        overflowX: "auto",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            style={{
              font: "inherit",
              fontSize: "var(--text-sm)",
              padding: "var(--space-2) var(--space-3)",
              background: "none",
              border: "none",
              borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
              color: active ? "var(--color-text)" : "var(--color-text-muted)",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
