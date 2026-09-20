const RA_SAMPLE_SESSIONS = [
  { id: 's1', title: 'Miso-glazed salmon bowl', lastOpened: 'Sep 12, 3:40 PM' },
  { id: 's2', title: 'Untitled session', lastOpened: 'Sep 10, 9:02 AM' },
];

function SessionListScreen({ onOpen, onNewSession }) {
  const { Button, ListRow } = window.DesignSystem_693deb;
  return (
    <div className="ra-content ra-screen">
      <h1 className="ra-h1-screen">Your sessions</h1>
      <Button variant="primary" onClick={onNewSession} style={{ alignSelf: 'flex-start' }}>Start a new session</Button>
      <ul className="ra-list">
        {RA_SAMPLE_SESSIONS.map(s => (
          <ListRow key={s.id} title={s.title} subtitle={s.lastOpened} onOpen={() => onOpen(s)} onDelete={() => {}} />
        ))}
      </ul>
    </div>
  );
}

function EntryScreen({ onSubmit, onBack }) {
  const { Button, TextArea } = window.DesignSystem_693deb;
  const [raw, setRaw] = React.useState('2 eggs\nspinach\nfeta cheese\nsourdough');
  return (
    <div className="ra-content ra-screen">
      <h1 className="ra-h1-screen">What&apos;s in your kitchen?</h1>
      <TextArea label="Ingredients (one per line)" rows={6} value={raw} onChange={e => setRaw(e.target.value)} />
      <Button variant="primary" onClick={() => onSubmit(raw)} style={{ alignSelf: 'flex-start' }}>Start</Button>
      <Button variant="link" onClick={onBack}>Back to your sessions</Button>
    </div>
  );
}
window.SessionListScreen = SessionListScreen;
window.EntryScreen = EntryScreen;
