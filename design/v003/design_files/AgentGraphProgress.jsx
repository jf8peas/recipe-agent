const RA_ROWS = [
  { items: [{ id: 'parseIngredients', label: 'parse\ningredients', shape: 'circle' }, { id: 'usable', label: 'usable?', shape: 'diamond' }, { id: 'proposeDirections', label: 'propose\ndirections', shape: 'circle' }, { id: 'selectDirection', label: 'select\ndirection', shape: 'circle' }], reverse: false, branchAfter: 'usable', branchLeaf: { id: 'ingredientError', label: '✕ ingredient\nerror' } },
  { items: [{ id: 'draftRecipe', label: 'draft\nrecipe', shape: 'circle' }, { id: 'critique', label: 'critique', shape: 'circle' }, { id: 'blocking', label: 'blocking?', shape: 'diamond' }, { id: 'finalize', label: 'finalize', shape: 'circle' }], reverse: true, branchAfter: 'blocking', branchLeaf: { id: 'refine', label: 'refine' } },
];
/** Linear demo order used to drive the step-through simulation. */
const RA_STAGES = [
  { id: 'parseIngredients', label: 'parseIngredients' },
  { id: 'proposeDirections', label: 'proposeDirections' },
  { id: 'selectDirection', label: 'selectDirection' },
  { id: 'draftRecipe', label: 'draftRecipe' },
  { id: 'critique', label: 'critique' },
  { id: 'refine', label: 'refine' },
  { id: 'finalize', label: 'finalize' },
];

function RaNode({ node, status }) {
  const isDiamond = node.shape === 'diamond';
  let bg = 'var(--color-surface)', border = '1.5px dashed var(--color-border)', color = 'var(--color-text-muted)';
  if (status === 'done') { bg = 'color-mix(in srgb, var(--color-success) 16%, var(--color-surface))'; border = '2px solid var(--color-success)'; color = 'var(--color-text)'; }
  if (status === 'current') { bg = 'var(--color-accent)'; border = '2px solid var(--color-accent)'; color = 'var(--color-accent-contrast)'; }
  const size = isDiamond ? 'var(--ra-node-diamond)' : 'var(--ra-node-circle)';
  return (
    <div className="ra-node-col">
      <div className="ra-node-slot">
        <div className={'ra-node ' + (isDiamond ? 'ra-node-diamond' : 'ra-node-circle')} style={{ width: size, height: size, background: bg, border, color }}>
          <span className={isDiamond ? 'ra-node-label-rot' : 'ra-node-label'}>{node.label}</span>
        </div>
      </div>
      <span className={'ra-node-caption' + (status === 'done' ? ' is-done' : status === 'current' ? ' is-current' : '')}>
        {status === 'done' ? 'done' : status === 'current' ? 'running' : ''}
      </span>
    </div>
  );
}

function RaEdge({ done, reverse }) {
  return <div className={'ra-edge' + (reverse ? ' ra-edge-reverse' : '')} style={{ '--ra-edge-color': done ? 'var(--color-success)' : 'var(--color-border)' }} />;
}

/**
 * Four-row pipeline diagram, boustrophedon-style (each row runs opposite
 * direction from the last so the join between rows is a short vertical
 * drop, alternating sides). Each row holds exactly two nodes, the edge
 * between them, and — except the last row — a trailing edge/join stub down
 * to the next row, for four elements per row and room to size nodes larger.
 * Both decisions (usable?, blocking?) hang their untaken/rework path below
 * as a dashed dead-end, so "a fork" and "a path not taken" share one motif.
 */
function AgentGraphProgress({ statusOf, onSelect, selectedId }) {
  const st = id => statusOf(id) || 'pending';
  const wrap = (id, children) => (
    <button type="button" className={'ra-node-btn' + (selectedId === id ? ' is-selected' : '')} onClick={() => onSelect && onSelect(id)} aria-label={id}>
      {children}
    </button>
  );
  return (
    <div className="ra-graph">
      {RA_ROWS.map((row, ri) => {
        const visualItems = row.reverse ? [...row.items].slice().reverse() : row.items;
        return (
        <React.Fragment key={ri}>
          <div className={'ra-graph-row' + (row.branchAfter ? ' ra-graph-row-has-branch' : '')}>
            {visualItems.map((node, i) => (
              <React.Fragment key={node.id}>
                {node.id === row.branchAfter ? (
                  <div className="ra-branch-col">
                    {wrap(node.id, <RaNode node={node} status={st(node.id)} />)}
                    <div className="ra-branch-below">
                      <div className="ra-branch-drop" />
                      <div className="ra-branch-leaf">
                        {row.branchLeaf.id === 'refine'
                          ? wrap('refine', <RaNode node={{ label: row.branchLeaf.label, shape: 'circle' }} status={st('refine')} />)
                          : <div className="ra-node ra-node-circle ra-node-deadend"><span className="ra-node-label">{row.branchLeaf.label}</span></div>}
                        <span className="ra-node-caption">{row.branchLeaf.id === 'refine' ? '' : 'not taken'}</span>
                      </div>
                      {row.branchLeaf.id === 'refine' && (
                        <svg className="ra-refine-loop" viewBox="0 0 170 130" preserveAspectRatio="none" aria-hidden="true">
                          <line x1="35" y1="105" x2="120" y2="30" stroke={st('refine') === 'done' ? 'var(--color-success)' : 'var(--color-border)'} strokeWidth="2" markerEnd="url(#ra-refine-arrow)" />
                          <defs>
                            <marker id="ra-refine-arrow" markerWidth="3" markerHeight="4.2" refX="2.4" refY="2.1" orient="auto">
                              <path d="M0,0 L3,2.1 L0,4.2 z" fill={st('refine') === 'done' ? 'var(--color-success)' : 'var(--color-border)'} />
                            </marker>
                          </defs>
                        </svg>
                      )}
                    </div>
                  </div>
                ) : wrap(node.id, <RaNode node={node} status={st(node.id)} />)}
                {i < visualItems.length - 1 && <RaEdge reverse={row.reverse} done={st(visualItems[i + 1].id) !== 'pending'} />}
              </React.Fragment>
            ))}
          </div>
          {ri < RA_ROWS.length - 1 && (
            <div className="ra-graph-joinrow" aria-hidden="true">
              <div className="ra-joinrow-slot" style={{ width: '95px' }} />
              <div className="ra-joinrow-slot" style={{ width: '41px' }} />
              <div className="ra-joinrow-slot" style={{ width: '72px' }} />
              <div className="ra-joinrow-slot" style={{ width: '41px' }} />
              <div className="ra-joinrow-slot" style={{ width: '95px' }} />
              <div className="ra-joinrow-slot" style={{ width: '41px' }} />
              <div className="ra-joinrow-slot" style={{ width: '95px' }}>
                <div className="ra-graph-join-line" style={{ '--ra-edge-color': st(row.items[row.items.length - 1].id) !== 'pending' ? 'var(--color-success)' : 'var(--color-border)' }} />
              </div>
            </div>
          )}
        </React.Fragment>
        );
      })}
    </div>
  );
}
window.AgentGraphProgress = AgentGraphProgress;
window.RA_STAGES = RA_STAGES;
