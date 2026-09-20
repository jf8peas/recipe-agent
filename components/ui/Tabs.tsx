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
 * the run-specific `TabId`/`STAGE_TO_TAB` semantics on top of this. Wraps
 * onto multiple rows rather than scrolling horizontally once tabs stop
 * fitting on one line (a run with several critique/draft-revision cycles
 * can produce many tabs) — every tab stays reachable without a scroll
 * gesture. Each tab reads as its own clickable pill (a full border, not
 * just an underline) so a longer, wrapped row still looks like a set of
 * buttons rather than plain text; the active one is filled, never
 * distinguished by color alone (fill + border + bold together). */
export function Tabs({ tabs, activeId, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Stage outputs"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-2)",
        paddingBottom: "var(--space-2)",
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
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-md)",
              border: active ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
              background: active ? "var(--color-accent)" : "var(--color-surface)",
              color: active ? "var(--color-accent-contrast)" : "var(--color-text)",
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
