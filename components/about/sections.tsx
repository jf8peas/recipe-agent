import type { CSSProperties } from "react";
import {
  AGENT_GRAPH_EDGES,
  AGENT_GRAPH_NOTE,
  API_GUARDRAILS,
  API_NOTE,
  API_ROUTES,
  ARCHITECTURE_HOPS,
  ARCHITECTURE_NOTES,
  AUTHOR_BIO,
  AUTHOR_LINKEDIN_URL,
  TESTER_BIO,
  TESTER_LINKEDIN_URL,
  BRANCHING_CALLOUTS,
  BRANCHING_INTRO,
  BRANCHING_STEPS,
  CLOSING_POINTERS,
  COVER_KICKER,
  COVER_LEDE,
  COVER_TITLE,
  DATA_MODEL_TABLES,
  DATA_MODEL_TREE_EXPLANATION,
  JOURNEY_CALLOUT,
  JOURNEY_STEPS,
  PITCH_FLOW_STEPS,
  PITCH_HEADLINE,
  PITCH_HIGHLIGHTS,
  PRINCIPLES,
  PROMPT_ROUTING_NOTE,
  PROMPT_ROUTING_TABLE,
  REPO_AREAS,
  REPO_NOTE,
  REPO_URL,
  STATE_CHANNELS,
  STATE_NOTES,
  TIME_TRAVEL_EXPLANATION,
  TIME_TRAVEL_TITLE,
} from "@/lib/about-content";
import {
  AgentGraphDiagram,
  StatePersistenceDiagram,
  TimeTravelDiagram,
} from "@/components/about/diagrams";
import {
  accentRowCellStyle,
  badgeStyle,
  bodyTextStyle,
  calloutStyle,
  cardStyle,
  gridStyle,
  h2Style,
  h3Style,
  kickerStyle,
  ledeStyle,
  legendStyle,
  monoCellStyle,
  pillLinkStyle,
  plainListItemStyle,
  plainListStyle,
  sectionStyle,
  stepNumStyle,
  tableCellStyle,
  tableHeadStyle,
  tableStyle,
} from "@/components/about/shared";

const bodySmallStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "var(--text-sm)",
  margin: 0,
};

// ---- Cover ----

export function CoverSection() {
  return (
    <section
      id="cover"
      tabIndex={-1}
      style={{ ...sectionStyle, borderBottom: "none", paddingTop: "var(--space-6)" }}
    >
      <p style={kickerStyle}>{COVER_KICKER}</p>
      <h1
        style={{
          fontSize: "var(--text-3xl)",
          fontWeight: 700,
          lineHeight: 1.15,
          marginBottom: "var(--space-3)",
          marginTop: 0,
        }}
      >
        {COVER_TITLE}
      </h1>
      <p style={ledeStyle}>{COVER_LEDE}</p>
    </section>
  );
}

// ---- Author ----

export function AuthorSection() {
  return (
    <section id="author" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>Who built this</p>
      <h2 style={h2Style}>John Fong</h2>
      <p style={bodyTextStyle}>{AUTHOR_BIO}</p>
      <a href={AUTHOR_LINKEDIN_URL} target="_blank" rel="noopener noreferrer" style={pillLinkStyle}>
        View LinkedIn profile →
      </a>

      <div style={{ ...cardStyle(), marginTop: "var(--space-6)" }}>
        <p style={kickerStyle}>Who&apos;s testing it</p>
        <h3 style={h3Style}>Alesja Tanabe</h3>
        <p style={bodyTextStyle}>{TESTER_BIO}</p>
        <a href={TESTER_LINKEDIN_URL} target="_blank" rel="noopener noreferrer" style={pillLinkStyle}>
          View LinkedIn profile →
        </a>
      </div>
    </section>
  );
}

// ---- Pitch ----

export function PitchSection() {
  return (
    <section id="pitch" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>In one sentence</p>
      <h2 style={h2Style}>{PITCH_HEADLINE}</h2>
      <div style={{ ...gridStyle(200), alignItems: "center" }}>
        {PITCH_FLOW_STEPS.map((step, i) => (
          <div
            key={step.label}
            style={cardStyle(
              i === 1
                ? { textAlign: "center", background: "var(--color-text)", borderColor: "var(--color-text)" }
                : { textAlign: "center" },
            )}
          >
            <h3 style={{ ...h3Style, color: i === 1 ? "var(--color-bg)" : undefined }}>{step.label}</h3>
            <p style={i === 1 ? { ...bodySmallStyle, color: "var(--color-bg)", opacity: 0.75 } : bodySmallStyle}>
              {step.detail}
            </p>
          </div>
        ))}
      </div>
      <div style={gridStyle(200)}>
        {PITCH_HIGHLIGHTS.map((h) => (
          <div key={h.title} style={cardStyle({ borderTop: "3px solid var(--color-accent)" })}>
            <h3 style={h3Style}>{h.title}</h3>
            <p style={bodySmallStyle}>{h.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Time travel ----

export function TimeTravelSection() {
  return (
    <section id="time-travel" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>The core idea</p>
      <h2 style={h2Style}>{TIME_TRAVEL_TITLE}</h2>
      <p style={bodyTextStyle}>{TIME_TRAVEL_EXPLANATION}</p>
      <TimeTravelDiagram />
    </section>
  );
}

// ---- Journey ----

export function JourneySection() {
  return (
    <section id="journey" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>Using the app</p>
      <h2 style={h2Style}>What it feels like to use, start to finish</h2>
      <div style={gridStyle(180)}>
        {JOURNEY_STEPS.map((s) => (
          <div key={s.step} style={cardStyle()}>
            <span style={stepNumStyle}>{s.step}</span>
            <h3 style={h3Style}>{s.title}</h3>
            <p style={bodySmallStyle}>{s.body}</p>
          </div>
        ))}
      </div>
      <div style={calloutStyle()}>
        <h3 style={{ ...h3Style, color: "inherit" }}>{JOURNEY_CALLOUT.title}</h3>
        <p style={{ color: "inherit", opacity: 0.75, margin: 0 }}>{JOURNEY_CALLOUT.body}</p>
      </div>
    </section>
  );
}

// ---- Under the hood (divider) ----

export function UnderTheHoodDivider() {
  return (
    <section
      id="under-the-hood"
      tabIndex={-1}
      style={{
        background: "var(--color-text)",
        color: "var(--color-bg)",
        padding: "var(--space-8) var(--space-4)",
        margin: "0 calc(-1 * var(--space-4))",
      }}
    >
      {/* --color-accent / --color-text-muted are tuned for light
          backgrounds; on this forced-dark divider, --color-bg (optionally
          dimmed via opacity, matching the callout pattern used elsewhere on
          this page) keeps contrast well above the WCAG AA threshold. */}
      <p style={{ ...kickerStyle, color: "var(--color-bg)" }}>Part two</p>
      <h2 style={{ ...h2Style, color: "var(--color-bg)" }}>Under the hood</h2>
      <p style={{ ...ledeStyle, color: "var(--color-bg)", opacity: 0.75 }}>
        The same app, from an engineer&apos;s chair: the stack, the agent graph, how state is
        validated, and how a run&apos;s whole history is stored and rebuilt.
      </p>
    </section>
  );
}

// ---- Architecture ----

export function ArchitectureSection() {
  return (
    <section id="architecture" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>Architecture</p>
      <h2 style={h2Style}>Six steps, browser to graph and back</h2>
      <div style={gridStyle(220)}>
        {ARCHITECTURE_HOPS.map((hop) => (
          <div
            key={hop.hop}
            style={cardStyle(
              hop.hop === "4"
                ? { border: "2px solid var(--color-accent)" }
                : hop.highlighted
                  ? { borderColor: "var(--color-accent)" }
                  : undefined,
            )}
          >
            <span style={badgeStyle(hop.highlighted ? "node" : "edge")}>
              {hop.hop} · {hop.label}
            </span>
            <h3 style={{ ...h3Style, marginTop: "var(--space-2)", color: hop.hop === "4" ? "var(--color-accent)" : undefined }}>
              {hop.title}
            </h3>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", margin: "var(--space-2) 0" }}>
              {hop.code}
            </p>
            <p
              style={
                hop.hop === "4"
                  ? { color: "var(--color-accent)", fontWeight: 600, fontSize: "var(--text-sm)", margin: 0 }
                  : bodySmallStyle
              }
            >
              {hop.body}
            </p>
          </div>
        ))}
      </div>
      {ARCHITECTURE_NOTES.map((note) => (
        <p key={note.slice(0, 24)} style={{ ...bodyTextStyle, marginTop: "var(--space-4)", fontStyle: "italic" }}>
          {note}
        </p>
      ))}
    </section>
  );
}

// ---- Agent graph ----

const legendSampleSolid: CSSProperties = {
  borderBottom: "2px solid var(--color-text-muted)",
  display: "inline-block",
  width: 20,
  margin: "0 4px -2px",
};
const legendSampleDashed: CSSProperties = {
  borderBottom: "2px dashed var(--color-text-muted)",
  display: "inline-block",
  width: 20,
  margin: "0 4px -2px",
};

export function AgentGraphSection() {
  return (
    <section id="agent-graph" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>The agent graph</p>
      <h2 style={h2Style}>Nodes do the work, edges decide where the state goes next</h2>
      <p style={bodyTextStyle}>
        A graph view of the agentic process itself — step 5 (<strong>Invoke</strong>) from the
        architecture section, unpacked. Every dashed arrow is its own six-step round trip, not a
        direct call.
      </p>

      {/* Full-bleed: undoes the page's own horizontal padding just for the
          diagram, so it gets the whole viewport width to scale into on
          narrow screens (matching AgentGraphProgress's own treatment in
          app/page.tsx) instead of losing 2*var(--space-4) to padding a
          diagram doesn't need the way prose does. */}
      <div style={{ marginLeft: "calc(-1 * var(--space-4))", marginRight: "calc(-1 * var(--space-4))", padding: "0 var(--space-2)" }}>
        <div
          data-testid="agent-graph-scroll"
          role="group"
          aria-label="Agent graph diagram (scrollable)"
          tabIndex={0}
          style={{ overflowX: "auto" }}
        >
          <AgentGraphDiagram />
        </div>
      </div>

      <p style={legendStyle}>
        — solid: same request, no round trip (a node evaluating its own edge){" "}
        <span style={legendSampleSolid} aria-hidden="true" /> dashed: a new request —
        graph.invoke() already stopped, Step/Auto-run resumes it{" "}
        <span style={legendSampleDashed} aria-hidden="true" />
      </p>

      <table style={tableStyle} className="about-responsive-table">
        <colgroup>
          <col style={{ width: "28%" }} />
          <col style={{ width: "72%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...tableCellStyle, ...tableHeadStyle }}>Edge</th>
            <th style={{ ...tableCellStyle, ...tableHeadStyle }}>Means</th>
          </tr>
        </thead>
        <tbody>
          {AGENT_GRAPH_EDGES.map((edge) => (
            <tr key={edge.condition}>
              <td data-label="Edge" style={{ ...tableCellStyle, ...monoCellStyle }}>
                {edge.condition}
              </td>
              <td data-label="Means" style={tableCellStyle}>
                {edge.explanation}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ ...bodyTextStyle, marginTop: "var(--space-4)" }}>{AGENT_GRAPH_NOTE}</p>
    </section>
  );
}

// ---- Prompts & model routing ----

export function PromptsSection() {
  return (
    <section id="prompts" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>Prompts &amp; model routing</p>
      <h2 style={h2Style}>What each stage asks a model to do</h2>
      <table style={tableStyle} className="about-responsive-table">
        <colgroup>
          <col style={{ width: "27%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "35%" }} />
          <col style={{ width: "26%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...tableCellStyle, ...tableHeadStyle }}>Stage</th>
            <th style={{ ...tableCellStyle, ...tableHeadStyle }}>Model</th>
            <th style={{ ...tableCellStyle, ...tableHeadStyle }}>Asks the model to…</th>
            <th style={{ ...tableCellStyle, ...tableHeadStyle }}>Routes to</th>
          </tr>
        </thead>
        <tbody>
          {PROMPT_ROUTING_TABLE.map((row) => (
            <tr key={row.stage}>
              <td
                data-label="Stage"
                style={row.model === "stronger" ? { ...tableCellStyle, ...accentRowCellStyle, ...monoCellStyle } : { ...tableCellStyle, ...monoCellStyle }}
              >
                {row.stage}
              </td>
              <td data-label="Model" style={row.model === "stronger" ? { ...tableCellStyle, ...accentRowCellStyle } : tableCellStyle}>
                {row.model}
              </td>
              <td data-label="Asks the model to…" style={row.model === "stronger" ? { ...tableCellStyle, ...accentRowCellStyle } : tableCellStyle}>
                {row.asks}
              </td>
              <td data-label="Routes to" style={row.model === "stronger" ? { ...tableCellStyle, ...accentRowCellStyle } : tableCellStyle}>
                {row.routesTo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ ...bodyTextStyle, marginTop: "var(--space-4)" }}>{PROMPT_ROUTING_NOTE}</p>
    </section>
  );
}

// ---- State, validation & persistence ----

export function StateSection() {
  const [firstHalf, secondHalf] = [STATE_CHANNELS.slice(0, 5), STATE_CHANNELS.slice(5)];
  return (
    <section id="state" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>State, validation &amp; persistence</p>
      <h2 style={h2Style}>One state object, replaced whole, checkpointed in Postgres</h2>
      {STATE_NOTES.map((note, i) => (
        <p key={note.slice(0, 24)} style={i === 0 ? bodyTextStyle : { ...bodyTextStyle, marginTop: "var(--space-3)" }}>
          {note}
        </p>
      ))}

      <div style={cardStyle({ marginTop: "var(--space-4)" })}>
        <h3 style={{ ...h3Style, marginBottom: "var(--space-3)" }}>The ten state channels</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-4)" }}>
          <ul style={plainListStyle}>
            {firstHalf.map((c) => (
              <li key={c} style={plainListItemStyle}>
                {c}
              </li>
            ))}
          </ul>
          <ul style={plainListStyle}>
            {secondHalf.map((c) => (
              <li key={c} style={plainListItemStyle}>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <StatePersistenceDiagram />
    </section>
  );
}

// ---- Branching ----

export function BranchingSection() {
  return (
    <section id="branching" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>Branching mechanics</p>
      <h2 style={h2Style}>A fork never edits history — it replays a new one</h2>
      <p style={bodyTextStyle}>{BRANCHING_INTRO}</p>
      <div style={gridStyle(180)}>
        {BRANCHING_STEPS.map((s) => (
          <div key={s.step} style={cardStyle()}>
            <span style={stepNumStyle}>{s.step}</span>
            <p style={bodySmallStyle}>{s.body}</p>
          </div>
        ))}
      </div>
      <div style={gridStyle(260)}>
        {BRANCHING_CALLOUTS.map((c) => (
          <div key={c.title} style={calloutStyle({ marginTop: 0 })}>
            <h3 style={{ ...h3Style, color: "inherit" }}>{c.title}</h3>
            <p style={{ color: "inherit", opacity: 0.75, margin: 0 }}>{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Data model ----

export function DataModelSection() {
  return (
    <section id="data-model" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>Data model</p>
      <h2 style={h2Style}>Three small tables that track sessions, branch lineage, and usage limits</h2>
      <div style={gridStyle(200)}>
        {DATA_MODEL_TABLES.map((t) => (
          <div key={t.name} style={cardStyle()}>
            <h3 style={{ ...h3Style, color: "var(--color-accent)" }}>{t.name}</h3>
            <ul style={{ ...plainListStyle, margin: "var(--space-2) 0" }}>
              {t.fields.map((f) => (
                <li key={f} style={plainListItemStyle}>
                  {f}
                </li>
              ))}
            </ul>
            <p style={bodySmallStyle}>{t.note}</p>
          </div>
        ))}
      </div>
      <div style={calloutStyle()}>
        <h3 style={{ ...h3Style, color: "inherit" }}>How the browsable tree gets rebuilt</h3>
        <p style={{ color: "inherit", opacity: 0.75, margin: 0 }}>{DATA_MODEL_TREE_EXPLANATION}</p>
      </div>
    </section>
  );
}

// ---- Repo ----

export function RepoSection() {
  return (
    <section id="repo" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>Repository structure</p>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <h2 style={{ ...h2Style, marginBottom: 0 }}>Where to look, mapped to what it&apos;s responsible for</h2>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--color-accent)", fontWeight: 600, textDecoration: "none" }}
        >
          github.com/jf8peas/recipe-agent →
        </a>
      </div>
      <div style={gridStyle(220)}>
        {REPO_AREAS.map((area) => (
          <div key={area.path} style={cardStyle()}>
            <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)", fontSize: "var(--text-base)", fontWeight: 600, margin: 0, marginBottom: "var(--space-2)" }}>
              {area.path}
            </h3>
            <p style={bodySmallStyle}>{area.note}</p>
          </div>
        ))}
      </div>
      <p style={{ ...bodyTextStyle, marginTop: "var(--space-4)", fontSize: "var(--text-sm)" }}>{REPO_NOTE}</p>
    </section>
  );
}

// ---- API ----

export function ApiSection() {
  return (
    <section id="api" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>API contract &amp; guardrails</p>
      <h2 style={h2Style}>No login — just an anonymous ID and honest limits</h2>
      <div style={gridStyle(220)}>
        {API_GUARDRAILS.map((g) => (
          <div key={g.title} style={cardStyle()}>
            <h3 style={h3Style}>{g.title}</h3>
            <p style={bodySmallStyle}>{g.body}</p>
          </div>
        ))}
      </div>
      <div style={calloutStyle()}>
        <h3 style={{ ...h3Style, color: "inherit" }}>The routes, at a glance</h3>
        <div style={{ ...gridStyle(150), marginTop: "var(--space-3)" }}>
          <ul style={{ ...plainListStyle, color: "inherit" }}>
            {API_ROUTES.slice(0, 3).map((r) => (
              <li key={r} style={{ ...plainListItemStyle, color: "inherit", opacity: 0.85 }}>
                {r}
              </li>
            ))}
          </ul>
          <ul style={{ ...plainListStyle, color: "inherit" }}>
            {API_ROUTES.slice(3, 6).map((r) => (
              <li key={r} style={{ ...plainListItemStyle, color: "inherit", opacity: 0.85 }}>
                {r}
              </li>
            ))}
          </ul>
          <ul style={{ ...plainListStyle, color: "inherit" }}>
            {API_ROUTES.slice(6, 9).map((r) => (
              <li key={r} style={{ ...plainListItemStyle, color: "inherit", opacity: 0.85 }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
        <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-xs)", color: "inherit", opacity: 0.85 }}>{API_NOTE}</p>
      </div>
    </section>
  );
}

// ---- Principles ----

export function PrinciplesSection() {
  return (
    <section id="principles" tabIndex={-1} style={sectionStyle}>
      <p style={kickerStyle}>Engineering principles</p>
      <h2 style={h2Style}>Six non-negotiables from the project&apos;s own constitution</h2>
      <div style={gridStyle(220)}>
        {PRINCIPLES.map((p) => (
          <div key={p.title} style={cardStyle()}>
            <h3 style={{ ...h3Style, color: "var(--color-accent)" }}>{p.title}</h3>
            <p style={bodySmallStyle}>{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Closing ----

export function ClosingSection() {
  return (
    <section id="closing" tabIndex={-1} style={{ ...sectionStyle, borderBottom: "none" }}>
      <p style={kickerStyle}>Where to look next</p>
      <h2 style={h2Style}>The specs are the source of truth — this page is a map of them</h2>
      <div style={gridStyle(180)}>
        {CLOSING_POINTERS.map((p) => (
          <div key={p.path} style={cardStyle()}>
            <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)", fontSize: "var(--text-sm)", margin: 0, marginBottom: "var(--space-2)" }}>
              {p.path}
            </h3>
            <p style={bodySmallStyle}>{p.note}</p>
          </div>
        ))}
      </div>
      <div style={{ ...calloutStyle(), display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <p style={{ fontWeight: 600, color: "inherit", margin: 0 }}>Built by John Fong</p>
          <a href={AUTHOR_LINKEDIN_URL} target="_blank" rel="noopener noreferrer" style={pillLinkStyle}>
            View LinkedIn profile →
          </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <p style={{ fontWeight: 600, color: "inherit", margin: 0 }}>Tested by Alesja Tanabe</p>
          <a href={TESTER_LINKEDIN_URL} target="_blank" rel="noopener noreferrer" style={pillLinkStyle}>
            View LinkedIn profile →
          </a>
        </div>
      </div>
    </section>
  );
}
