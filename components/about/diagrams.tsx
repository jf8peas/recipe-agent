import type { ReactNode } from "react";

/**
 * The three inline-SVG diagrams (research R6) — each a single
 * `<svg viewBox>` containing every shape, connector, and text label, ported
 * from design/v002/about.html's own markup rather than re-derived, reusing
 * the technique `components/AboutSlideshow.tsx`'s `ArchitectureDiagram`
 * already established for this codebase. Every color is a design token used
 * directly as an SVG `fill`/`stroke` value (FR-022).
 */

const muted = "var(--color-text-muted)";
const accent = "var(--color-accent)";
const accentContrast = "var(--color-accent-contrast)";
const warning = "var(--color-warning)";
const danger = "var(--color-danger)";
const surface = "var(--color-surface)";
const text = "var(--color-text)";
const bg = "var(--color-bg)";

function responsiveSvgWrap(maxWidth: string | undefined, children: ReactNode) {
  return (
    <div style={{ marginTop: "var(--space-5)", ...(maxWidth ? { maxWidth } : {}) }}>{children}</div>
  );
}

export function TimeTravelDiagram() {
  return responsiveSvgWrap(
    "640px",
    <svg
      viewBox="0 0 700 260"
      role="img"
      aria-label="Five checkpoints in the original branch. A new branch forks at checkpoint 3, replaying checkpoints 3 through 5 with the edit applied."
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <marker id="tt-arrow" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: muted }} />
        </marker>
        <marker id="tt-arrow-accent" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: accent }} />
        </marker>
      </defs>

      <text x={40} y={18} style={{ font: "600 12px var(--font-sans)", fill: muted }}>
        Original branch
      </text>
      <text x={352} y={122} style={{ font: "12px var(--font-sans)", fill: accent }}>
        edit + replay
      </text>
      <text x={330} y={162} style={{ font: "600 12px var(--font-sans)", fill: accent }}>
        New branch — forked at checkpoint 3
      </text>

      <line x1={66} y1={50} x2={164} y2={50} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#tt-arrow)" />
      <line x1={216} y1={50} x2={314} y2={50} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#tt-arrow)" />
      <line x1={366} y1={50} x2={464} y2={50} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#tt-arrow)" />
      <line x1={516} y1={50} x2={614} y2={50} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#tt-arrow)" />
      <line
        x1={340}
        y1={76}
        x2={340}
        y2={104}
        style={{ stroke: accent, strokeWidth: 2, strokeDasharray: "5,5" }}
        markerEnd="url(#tt-arrow-accent)"
      />
      <line x1={406} y1={200} x2={464} y2={200} style={{ stroke: accent, strokeWidth: 2 }} markerEnd="url(#tt-arrow-accent)" />
      <line x1={516} y1={200} x2={614} y2={200} style={{ stroke: accent, strokeWidth: 2 }} markerEnd="url(#tt-arrow-accent)" />

      {[
        { cx: 40, n: "1" },
        { cx: 190, n: "2" },
        { cx: 340, n: "3", strong: true },
        { cx: 490, n: "4" },
        { cx: 640, n: "5" },
      ].map(({ cx, n, strong }) => (
        <g key={n}>
          <circle
            cx={cx}
            cy={50}
            r={26}
            style={{
              fill: `color-mix(in srgb, ${accent} 10%, ${surface})`,
              stroke: strong ? accent : muted,
              strokeWidth: strong ? 3 : 2,
            }}
          />
          <text
            x={cx}
            y={57}
            textAnchor="middle"
            style={{ font: "700 18px var(--font-mono)", fill: strong ? accent : text }}
          >
            {n}
          </text>
        </g>
      ))}

      {[
        { cx: 380, n: "3'" },
        { cx: 490, n: "4'" },
        { cx: 640, n: "5'" },
      ].map(({ cx, n }) => (
        <g key={n}>
          <circle cx={cx} cy={200} r={26} style={{ fill: accent, stroke: accent, strokeWidth: 2 }} />
          <text x={cx} y={207} textAnchor="middle" style={{ font: "700 16px var(--font-mono)", fill: accentContrast }}>
            {n}
          </text>
        </g>
      ))}
    </svg>,
  );
}

export function AgentGraphDiagram() {
  return responsiveSvgWrap(
    undefined,
    <svg
      viewBox="0 0 950 230"
      role="img"
      aria-label="Seven agent nodes — parseIngredients, proposeDirections, selectDirection, draftRecipe, critique, refine, finalize — connected by two conditional edges (usable?, blocking and budget?) that route to an error End, a refine loop, or the main End."
      style={{ display: "block", width: "100%", height: "auto", minWidth: "700px" }}
    >
      <defs>
        <marker id="g-arrow" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: muted }} />
        </marker>
        <marker id="g-arrow-danger" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: danger }} />
        </marker>
      </defs>

      <line x1={84} y1={70} x2={133} y2={70} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#g-arrow)" />
      <line x1={167} y1={70} x2={226} y2={70} style={{ stroke: muted, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow)" />
      <line x1={294} y1={70} x2={336} y2={70} style={{ stroke: muted, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow)" />
      <line x1={404} y1={70} x2={446} y2={70} style={{ stroke: muted, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow)" />
      <line x1={514} y1={70} x2={556} y2={70} style={{ stroke: muted, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow)" />
      <line x1={624} y1={70} x2={673} y2={70} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#g-arrow)" />
      <line x1={707} y1={70} x2={766} y2={70} style={{ stroke: muted, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow)" />
      <line x1={834} y1={70} x2={870} y2={70} style={{ stroke: muted, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow)" />

      <line x1={150} y1={87} x2={150} y2={155} style={{ stroke: danger, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow-danger)" />
      <line x1={683} y1={86} x2={640} y2={138} style={{ stroke: danger, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow-danger)" />
      <line x1={617} y1={138} x2={603} y2={102} style={{ stroke: danger, strokeWidth: 2, strokeDasharray: "4,4" }} markerEnd="url(#g-arrow-danger)" />

      <circle cx={50} cy={70} r={34} style={{ fill: `color-mix(in srgb, ${accent} 10%, ${surface})`, stroke: accent, strokeWidth: 2 }} />
      <text x={50} y={66} textAnchor="middle" style={{ font: "700 10px var(--font-mono)", fill: text }}>parse</text>
      <text x={50} y={78} textAnchor="middle" style={{ font: "700 10px var(--font-mono)", fill: text }}>Ingredients</text>

      <polygon points="150,53 167,70 150,87 133,70" style={{ fill: `color-mix(in srgb, ${warning} 20%, ${surface})`, stroke: warning, strokeWidth: 2 }} />
      <text x={150} y={112} textAnchor="middle" style={{ font: "700 10px var(--font-sans)", fill: warning }}>usable?</text>

      <circle cx={260} cy={70} r={34} style={{ fill: `color-mix(in srgb, ${accent} 10%, ${surface})`, stroke: accent, strokeWidth: 2 }} />
      <text x={260} y={66} textAnchor="middle" style={{ font: "700 10px var(--font-mono)", fill: text }}>propose</text>
      <text x={260} y={78} textAnchor="middle" style={{ font: "700 10px var(--font-mono)", fill: text }}>Directions</text>

      <circle cx={370} cy={70} r={34} style={{ fill: `color-mix(in srgb, ${accent} 10%, ${surface})`, stroke: accent, strokeWidth: 2 }} />
      <text x={370} y={66} textAnchor="middle" style={{ font: "700 10px var(--font-mono)", fill: text }}>select</text>
      <text x={370} y={78} textAnchor="middle" style={{ font: "700 10px var(--font-mono)", fill: text }}>Direction</text>

      <circle cx={480} cy={70} r={34} style={{ fill: `color-mix(in srgb, ${accent} 10%, ${surface})`, stroke: accent, strokeWidth: 2 }} />
      <text x={480} y={66} textAnchor="middle" style={{ font: "700 10px var(--font-mono)", fill: text }}>draft</text>
      <text x={480} y={78} textAnchor="middle" style={{ font: "700 10px var(--font-mono)", fill: text }}>Recipe</text>

      <circle cx={590} cy={70} r={34} style={{ fill: `color-mix(in srgb, ${danger} 10%, ${surface})`, stroke: danger, strokeWidth: 2 }} />
      <text x={590} y={74} textAnchor="middle" style={{ font: "700 11px var(--font-mono)", fill: text }}>critique</text>

      <polygon points="690,53 707,70 690,87 673,70" style={{ fill: `color-mix(in srgb, ${warning} 20%, ${surface})`, stroke: warning, strokeWidth: 2 }} />
      <text x={690} y={112} textAnchor="middle" style={{ font: "700 10px var(--font-sans)", fill: warning }}>blocking &amp; budget?</text>

      <circle cx={800} cy={70} r={34} style={{ fill: `color-mix(in srgb, ${accent} 10%, ${surface})`, stroke: accent, strokeWidth: 2 }} />
      <text x={800} y={74} textAnchor="middle" style={{ font: "700 11px var(--font-mono)", fill: text }}>finalize</text>

      <rect x={870} y={55} width={60} height={30} rx={15} style={{ fill: text }} />
      <text x={900} y={75} textAnchor="middle" style={{ font: "600 12px var(--font-sans)", fill: bg }}>End</text>

      <circle cx={630} cy={170} r={34} style={{ fill: `color-mix(in srgb, ${danger} 10%, ${surface})`, stroke: danger, strokeWidth: 2 }} />
      <text x={630} y={174} textAnchor="middle" style={{ font: "700 11px var(--font-mono)", fill: text }}>refine</text>

      <rect x={120} y={155} width={60} height={30} rx={15} style={{ fill: danger }} />
      <text x={150} y={175} textAnchor="middle" style={{ font: "600 12px var(--font-sans)", fill: "#fff" }}>End</text>
    </svg>,
  );
}

export function StatePersistenceDiagram() {
  return responsiveSvgWrap(
    "600px",
    <svg
      viewBox="0 0 640 270"
      role="img"
      aria-label="GraphState schema defines the shape of a single State object, which is written to Postgres via PostgresSaver after every node and read back on the next request. Two Zod gates — on a model's structured output and on a /fork edit patch — check any new value before it reaches the state object."
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <marker id="st-arrow" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: muted }} />
        </marker>
        <marker id="st-arrow-warn" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: warning }} />
        </marker>
      </defs>

      <line x1={182} y1={130} x2={248} y2={118} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#st-arrow)" />
      <text x={188} y={106} style={{ font: "italic 10px var(--font-sans)", fill: muted }}>defines shape</text>

      <line x1={238} y1={40} x2={298} y2={58} style={{ stroke: warning, strokeWidth: 2 }} markerEnd="url(#st-arrow-warn)" />
      <line x1={300} y1={82} x2={270} y2={100} style={{ stroke: warning, strokeWidth: 2 }} markerEnd="url(#st-arrow-warn)" />
      <line x1={500} y1={40} x2={420} y2={58} style={{ stroke: warning, strokeWidth: 2 }} markerEnd="url(#st-arrow-warn)" />
      <line x1={418} y1={82} x2={410} y2={100} style={{ stroke: warning, strokeWidth: 2 }} markerEnd="url(#st-arrow-warn)" />
      <text x={335} y={100} textAnchor="middle" style={{ font: "italic 9.5px var(--font-sans)", fill: warning }}>
        passes, or the run enters stage-failure
      </text>

      <line x1={300} y1={170} x2={300} y2={200} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#st-arrow)" />
      <line x1={370} y1={200} x2={370} y2={170} style={{ stroke: muted, strokeWidth: 2 }} markerEnd="url(#st-arrow)" />
      <text x={430} y={180} style={{ font: "10px var(--font-sans)", fill: muted }}>checkpoints after every node ·</text>
      <text x={430} y={194} style={{ font: "10px var(--font-sans)", fill: muted }}>resumes on the next request</text>

      <rect x={10} y={95} width={170} height={70} rx={10} style={{ fill: surface, stroke: "var(--color-border)", strokeWidth: 1 }} />
      <text x={95} y={126} textAnchor="middle" style={{ font: "600 13px var(--font-sans)", fill: text }}>GraphState schema</text>
      <text x={95} y={144} textAnchor="middle" style={{ font: "9.5px var(--font-mono)", fill: muted }}>lib/agent/graph.ts</text>

      <rect x={250} y={55} width={170} height={110} rx={14} style={{ fill: `color-mix(in srgb, ${accent} 10%, ${surface})`, stroke: accent, strokeWidth: 3 }} />
      <text x={335} y={105} textAnchor="middle" style={{ font: "700 16px var(--font-sans)", fill: accent }}>State object</text>
      <text x={335} y={124} textAnchor="middle" style={{ font: "10px var(--font-sans)", fill: muted }}>10 channels</text>
      <text x={335} y={138} textAnchor="middle" style={{ font: "10px var(--font-sans)", fill: muted }}>last-value-wins</text>

      <rect x={165} y={0} width={140} height={40} rx={8} style={{ fill: surface, stroke: "var(--color-border)", strokeWidth: 1 }} />
      <text x={235} y={18} textAnchor="middle" style={{ font: "10px var(--font-sans)", fill: text }}>Model structured</text>
      <text x={235} y={31} textAnchor="middle" style={{ font: "10px var(--font-sans)", fill: text }}>output</text>

      <rect x={430} y={0} width={140} height={40} rx={8} style={{ fill: surface, stroke: "var(--color-border)", strokeWidth: 1 }} />
      <text x={500} y={24} textAnchor="middle" style={{ font: "10px var(--font-sans)", fill: text }}>/fork edit patch</text>

      <polygon points="315,52 335,72 315,92 295,72" style={{ fill: `color-mix(in srgb, ${warning} 20%, ${surface})`, stroke: warning, strokeWidth: 2 }} />
      <text x={315} y={76} textAnchor="middle" style={{ font: "700 9px var(--font-mono)", fill: warning }}>ZOD</text>
      <polygon points="405,52 425,72 405,92 385,72" style={{ fill: `color-mix(in srgb, ${warning} 20%, ${surface})`, stroke: warning, strokeWidth: 2 }} />
      <text x={405} y={76} textAnchor="middle" style={{ font: "700 9px var(--font-mono)", fill: warning }}>ZOD</text>

      <rect x={250} y={200} width={170} height={60} rx={12} style={{ fill: text }} />
      <text x={335} y={226} textAnchor="middle" style={{ font: "600 13px var(--font-sans)", fill: bg }}>Postgres (Neon)</text>
      <text x={335} y={244} textAnchor="middle" style={{ font: "9.5px var(--font-mono)", fill: bg, opacity: 0.7 }}>via PostgresSaver</text>
    </svg>,
  );
}
