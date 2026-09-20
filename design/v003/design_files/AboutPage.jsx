function AboutPage({ onReturn }) {
  const mainRef = React.useRef(null);
  return (
    <div className="ra-about" role="region" aria-label="About This App">
      <AppHeader mode="about" onReturn={onReturn} />
      <main className="ra-about-main" ref={mainRef} tabIndex={-1}>
        <div className="ra-content">
          <section id="cover" className="ra-about-section ra-about-cover">
            <p className="ra-kicker">Recipe Agent</p>
            <h1 className="ra-h1">How it works</h1>
            <p className="ra-lede">An ingredient list becomes a finished recipe, one agent stage at a time — with full time-travel over every step it took to get there. This page works for a non-technical reader and an engineer alike.</p>
          </section>

          <section id="pitch" className="ra-about-section">
            <h2 className="ra-h2">Turn a list of ingredients into a finished recipe — and never lose a version of it</h2>
            <div className="ra-card-grid ra-card-grid-3">
              {[['Paced, not instant', 'The agent pauses after every stage instead of racing to the end, so you can watch it think.'],
                ['Nothing is thrown away', "Every stage's output is saved, so the whole run's history is always there to look back on."],
                ['Edit the past, not just the present', 'Change an earlier answer and replay from there — that\'s "time travel," next.']].map(([t, b]) => (
                <div key={t} className="ra-card ra-card-accent-top">
                  <h3 className="ra-h3">{t}</h3>
                  <p className="ra-muted">{b}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="journey" className="ra-about-section">
            <h2 className="ra-h2">What it feels like to use, start to finish</h2>
            <div className="ra-card-grid ra-card-grid-2">
              {[['01', 'Type in what you have', 'List your ingredients and, optionally, a cuisine, a time limit, servings, or a diet to respect.'],
                ['02', 'Watch it think, one stage at a time', 'The agent pauses after every stage. Step through manually, or let it run and cancel anytime.'],
                ['03', 'Inspect, edit, or fork any step', 'Disagree with a direction the agent chose? Edit that step and replay from there as a new branch.'],
                ['04', 'Cook from the finished recipe', 'Scaled to your servings, with steps, timing, and an approximate nutrition estimate.']].map(([n, t, b]) => (
                <div key={n} className="ra-card">
                  <span className="ra-eyebrow-num">{n}</span>
                  <h3 className="ra-h3">{t}</h3>
                  <p className="ra-muted">{b}</p>
                </div>
              ))}
            </div>
            <div className="ra-callout">
              <h3>No accounts, no login</h3>
              <p>A random id stored in your browser is the only "credential." Sessions are private to your device.</p>
            </div>
          </section>

          <section id="agent-graph" className="ra-about-section">
            <h2 className="ra-h2">Nodes do the work, edges decide where the state goes next</h2>
            <p className="ra-muted">The live diagram below the app bar during a run — parse, decide if usable, propose directions, select, draft, critique, decide if blocking, refine or finalize.</p>
            <div className="ra-about-graph-demo">
              <AgentGraphProgress statusOf={id => ({ parseIngredients: 'done', usable: 'done', proposeDirections: 'done', selectDirection: 'current' }[id])} />
            </div>
          </section>

          <section id="principles" className="ra-about-section">
            <h2 className="ra-h2">Six non-negotiables from the project's own constitution</h2>
            <div className="ra-card-grid ra-card-grid-3">
              {[['Stack is fixed', 'Next.js on Vercel, LangGraph.js in Route Handlers, OpenRouter for every model call, Neon + Zod.'],
                ['Singletons, always', 'One pool, one compiled graph, cached in module scope.'],
                ['One thread per branch', 'Never a second child of an already-branched checkpoint in one thread.'],
                ['Model IDs, one place', 'Only lib/agent/models.ts resolves a model id.'],
                ['One super-step per request', 'interruptAfter on every node; auto-run is a client-side loop.'],
                ['Device-private, always', 'No login, no session id in a URL, no sharing across devices.']].map(([t, b]) => (
                <div key={t} className="ra-card">
                  <h3 className="ra-h3 ra-h3-accent">{t}</h3>
                  <p className="ra-muted">{b}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="closing" className="ra-about-section ra-closing">
            <div className="ra-callout ra-closing-row">
              <p className="ra-closing-name">Built by John Fong</p>
              <a className="ra-pill-link" href="https://www.linkedin.com/in/john-fong-04b7a120/" target="_blank" rel="noopener noreferrer">View LinkedIn profile →</a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
window.AboutPage = AboutPage;
