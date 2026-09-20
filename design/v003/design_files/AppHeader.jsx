const RA_ABOUT_NAV = [
  { href: 'pitch', label: 'Overview' },
  { href: 'journey', label: 'Using it' },
  { href: 'agent-graph', label: 'Agent graph' },
  { href: 'principles', label: 'Principles' },
];

/** One header, two states — 'app' (product) and 'about' (reference page). */
function AppHeader({ mode = 'app', paused, onTogglePaused, onOpenAbout, onReturn }) {
  const { Button } = window.DesignSystem_693deb;
  return (
    <header className="ra-header">
      <strong className="ra-header-title"><span className="ra-mark" aria-hidden="true">RA</span> Recipe Agent{mode === 'about' && <span className="ra-header-sub"> — how it works</span>}</strong>
      <div className="ra-header-actions">
        {mode === 'app' ? (
          <React.Fragment>
            <Toggle checked={paused} onChange={onTogglePaused} label="Pause between stages" />
            <a href="#" className="ra-header-link" onClick={e => e.preventDefault()}>Author</a>
            <a href="#" className="ra-header-link" onClick={e => e.preventDefault()}>Feedback</a>
            <Button variant="secondary" onClick={onOpenAbout}>About This App</Button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <nav className="ra-header-nav" aria-label="Page sections">
              {RA_ABOUT_NAV.map(l => <a key={l.href} href={`#${l.href}`}>{l.label}</a>)}
            </nav>
            <Button variant="primary" onClick={onReturn}>Return to App</Button>
          </React.Fragment>
        )}
      </div>
    </header>
  );
}
window.AppHeader = AppHeader;
