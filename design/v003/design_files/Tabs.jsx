function Tabs({ tabs, activeId, onChange }) {
  return (
    <div className="ra-tabs" role="tablist" aria-label="Stage outputs">
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === activeId} className={'ra-tab' + (t.id === activeId ? ' active' : '')} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
window.Tabs = Tabs;
