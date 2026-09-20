const RA_SAMPLE = {
  ingredients: [
    { raw: '2 eggs', name: '2 eggs', usable: true },
    { raw: 'spinach', name: 'spinach', usable: true },
    { raw: 'feta cheese', name: 'feta cheese', usable: true },
    { raw: 'sourdough', name: 'sourdough', usable: true },
  ],
  directions: [
    { title: 'Spinach & feta scramble on sourdough toast', summary: 'Soft-scrambled eggs folded with wilted spinach and feta, piled onto toasted sourdough.', whyItFits: 'Uses every ingredient directly, minimal technique.' },
    { title: 'Open-faced sourdough egg & feta melt', summary: 'Sourdough topped with spinach, feta, and a fried egg, run under the broiler.', whyItFits: 'Leans on the bread as a base rather than a side.' },
  ],
  directionSelection: { selectedIndex: 0, explanation: 'The scramble keeps the egg texture soft and distributes the feta more evenly than a melt.', clearFavorite: true },
  draft: { title: 'Spinach & Feta Scramble on Sourdough Toast', servings: 1, steps: ['Toast the sourdough.', 'Wilt the spinach in a pan.', 'Soft-scramble the eggs with the spinach.', 'Fold in feta off the heat.', 'Serve over the toast.'] },
  critique: { cycle: 1, feasibility: 'mostly feasible', flavorBalance: 'balanced', missingOrUnclear: ['no salt or pepper called out'], blocking: true },
  finalRecipe: {
    title: 'Spinach & Feta Scramble on Sourdough Toast',
    scaledServings: 1,
    steps: [
      { order: 1, text: 'Toast the sourdough.', minutes: 3 },
      { order: 2, text: 'Wilt the spinach in a lightly oiled pan.', minutes: 2 },
      { order: 3, text: 'Add the eggs, season with salt and pepper, and soft-scramble.', minutes: 3 },
      { order: 4, text: 'Fold in the feta off the heat.', minutes: 1 },
      { order: 5, text: 'Serve over the toast.', minutes: 1 },
    ],
    nutrition: { calories: 410, protein: 24, carbs: 28, fat: 22 },
  },
};

const RA_TAB_DEFS = [
  { id: 'ingredients', label: 'Ingredients', readyAt: 0 },
  { id: 'directions', label: 'Dish directions', readyAt: 1 },
  { id: 'selection', label: 'Direction selection', readyAt: 2 },
  { id: 'draft', label: 'Recipe draft', readyAt: 3 },
  { id: 'critique', label: 'Critique', readyAt: 4 },
  { id: 'final', label: 'Final recipe', readyAt: 6 },
];

function RA_nodeStatus(stageIndex, done) {
  const idx = id => RA_STAGES.findIndex(s => s.id === id);
  return id => {
    // Decisions are instantaneous forks, not stages that run — they read
    // 'done' as soon as their source node has finished, never 'current'.
    if (id === 'usable') return (done || stageIndex > idx('parseIngredients')) ? 'done' : 'pending';
    if (id === 'blocking') return (done || stageIndex > idx('critique')) ? 'done' : 'pending';
    const i = idx(id);
    if (i < 0) return 'pending';
    if (done) return 'done';
    if (i < stageIndex) return 'done';
    if (i === stageIndex) return 'current';
    return 'pending';
  };
}

function AutoFitGraph({ children }) {
  const outerRef = React.useRef(null);
  const innerRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);
  const [height, setHeight] = React.useState(null);

  React.useEffect(() => {
    const fit = () => {
      if (!outerRef.current || !innerRef.current) return;
      const containerW = outerRef.current.clientWidth;
      const naturalW = innerRef.current.scrollWidth;
      const naturalH = innerRef.current.scrollHeight;
      const s = naturalW > containerW ? containerW / naturalW : 1;
      setScale(s);
      setHeight(naturalH * s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={outerRef} style={{ overflow: 'hidden', height: height || 'auto' }}>
      <div ref={innerRef} style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 'max-content', margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}
window.AutoFitGraph = AutoFitGraph;

function SectionCard({ heading, children, editable }) {
  const { Card, Button } = window.DesignSystem_693deb;
  return (
    <Card heading={heading} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {children}
      {editable && <Button variant="link" style={{ alignSelf: 'flex-start' }}>Edit this stage</Button>}
    </Card>
  );
}

function RunningSessionScreen({ onNewSession }) {
  const { Button, Spinner } = window.DesignSystem_693deb;
  const [stageIndex, setStageIndex] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('ingredients');
  const done = stageIndex >= RA_STAGES.length;
  const current = !done ? RA_STAGES[stageIndex].id : null;

  React.useEffect(() => {
    if (!running || done) return;
    const t = setTimeout(() => setStageIndex(i => i + 1), 1100);
    return () => clearTimeout(t);
  }, [running, stageIndex, done]);

  const statusOf = RA_nodeStatus(stageIndex, done);
  const visibleTabs = RA_TAB_DEFS.filter(t => stageIndex > t.readyAt || (done && t.readyAt <= 6));

  React.useEffect(() => {
    if (!visibleTabs.find(t => t.id === activeTab) && visibleTabs.length) setActiveTab(visibleTabs[visibleTabs.length - 1].id);
  }, [stageIndex]);

  const nodeToTab = { parseIngredients: 'ingredients', usable: 'ingredients', proposeDirections: 'directions', selectDirection: 'selection', draftRecipe: 'draft', critique: 'critique', blocking: 'critique', refine: 'critique', finalize: 'final' };
  const handleSelectNode = id => { const tab = nodeToTab[id]; if (tab && visibleTabs.find(t => t.id === tab)) setActiveTab(tab); };

  return (
    <div className="ra-run">
      <details open={showHistory} onToggle={e => setShowHistory(e.target.open)} className="ra-history">
        <summary>History</summary>
        <ul className="ra-history-list">
          {RA_STAGES.slice(0, Math.max(stageIndex, 1)).map((s, i) => (
            <li key={s.id} className={i === stageIndex ? 'is-current' : ''}>{s.id} <span className="ra-history-kind">[{i < stageIndex ? 'normal' : 'in progress'}]</span></li>
          ))}
        </ul>
      </details>

      <div className="ra-run-body">
        <div className="ra-run-graph">
          <AutoFitGraph>
            <AgentGraphProgress statusOf={statusOf} onSelect={handleSelectNode} selectedId={nodeToTab && Object.keys(nodeToTab).find(k => nodeToTab[k] === activeTab)} />
          </AutoFitGraph>
        </div>

        <div className="ra-run-panel">
          {visibleTabs.length > 0 && <Tabs tabs={visibleTabs} activeId={activeTab} onChange={setActiveTab} />}

          <div className="ra-tab-content">
            {activeTab === 'ingredients' && (
              <SectionCard heading="Ingredients" editable>
                <ul className="ra-plain-list">{RA_SAMPLE.ingredients.map((ing, i) => <li key={i}>{ing.name}</li>)}</ul>
              </SectionCard>
            )}
            {activeTab === 'directions' && (
              <SectionCard heading="Dish directions" editable>
                <ul className="ra-plain-list">
                  {RA_SAMPLE.directions.map((d, i) => (
                    <li key={i}><strong>{d.title}</strong> — {d.summary}<div className="ra-muted-sm">{d.whyItFits}</div></li>
                  ))}
                </ul>
              </SectionCard>
            )}
            {activeTab === 'selection' && (
              <SectionCard heading="Direction selected" editable>
                <p className="ra-p-strong">{RA_SAMPLE.directions[RA_SAMPLE.directionSelection.selectedIndex].title}</p>
                <p>{RA_SAMPLE.directionSelection.explanation}</p>
                <p className="ra-muted-sm">{RA_SAMPLE.directionSelection.clearFavorite ? 'Clear favorite' : 'Default pick among equivalent options'}</p>
              </SectionCard>
            )}
            {activeTab === 'draft' && (
              <SectionCard heading="Recipe draft" editable>
                <p className="ra-p-strong">{RA_SAMPLE.draft.title}</p>
                <ol className="ra-plain-list">{RA_SAMPLE.draft.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </SectionCard>
            )}
            {activeTab === 'critique' && (
              <SectionCard heading="Critique">
                <ul className="ra-plain-list">
                  <li>Cycle {RA_SAMPLE.critique.cycle}: {RA_SAMPLE.critique.feasibility} / {RA_SAMPLE.critique.flavorBalance} — missing: {RA_SAMPLE.critique.missingOrUnclear.join(', ')}
                    {RA_SAMPLE.critique.blocking && <span className="ra-blocking-flag"> (blocking)</span>}
                  </li>
                </ul>
              </SectionCard>
            )}
            {activeTab === 'final' && (
              <SectionCard heading="Final recipe">
                <p className="ra-p-strong">{RA_SAMPLE.finalRecipe.title}</p>
                <p className="ra-muted-sm">Serves {RA_SAMPLE.finalRecipe.scaledServings}</p>
                <ol className="ra-plain-list">
                  {RA_SAMPLE.finalRecipe.steps.map(s => <li key={s.order}>{s.text}{s.minutes ? ` (${s.minutes} min)` : ''}</li>)}
                </ol>
                <p className="ra-muted-sm">~{RA_SAMPLE.finalRecipe.nutrition.calories} kcal, {RA_SAMPLE.finalRecipe.nutrition.protein}g protein, {RA_SAMPLE.finalRecipe.nutrition.carbs}g carbs, {RA_SAMPLE.finalRecipe.nutrition.fat}g fat per serving (approximate)</p>
              </SectionCard>
            )}
          </div>
        </div>
      </div>

      <div className="ra-action-row">
        {!done ? (
          running ? (
            <React.Fragment>
              <Spinner />
              <span className="ra-action-status">Running <strong>{current}</strong>… (7.6s)</span>
              <Button variant="secondary" onClick={() => setRunning(false)} style={{ marginLeft: 'auto' }}>Cancel</Button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Button variant="primary" onClick={() => setStageIndex(i => Math.min(i + 1, RA_STAGES.length))}>{`Step (${current})`}</Button>
              <Button variant="secondary" onClick={() => setRunning(true)}>Play</Button>
              <Button variant="secondary">Edit</Button>
            </React.Fragment>
          )
        ) : (
          <Button variant="primary" onClick={onNewSession}>Start a new session</Button>
        )}
      </div>
    </div>
  );
}
window.RunningSessionScreen = RunningSessionScreen;
