import type { CSSProperties } from "react";
import {
  DECISION_POINTS,
  GRAPH_EDGES,
  GRAPH_NODES,
  deriveRunPath,
  type GraphNodeLayout,
  type GraphNodeName,
  type NodeVisualState,
} from "@/lib/graph-progress";
import type { TimelineEntry } from "@/lib/tree";
import type { State } from "@/lib/agent/state";

export interface AgentGraphProgressProps {
  timeline: TimelineEntry[];
  branchId: string;
  next: string[];
  outcome: State["outcome"];
  /** Whichever checkpoint is currently displayed — the live tip, or a
   * historical one from the History panel. */
  checkpointId: string;
  /** Called with a node's name when it's clicked (spec 006 US3) — a
   * mouse-only shortcut to select that stage's tab; equivalent
   * functionality is fully keyboard/screen-reader accessible via the
   * `Tabs` strip itself, so this graph stays a decorative (`aria-hidden`)
   * illustration rather than a second, redundant set of focusable
   * controls for the same action. */
  onSelectNode?: (node: GraphNodeName) => void;
  /** Which node reads as "linked to the active tab" — a highlight ring,
   * never a color-only signal (combines with, but is distinct from, the
   * node's own taken/current/not-yet-reached/untaken state). */
  selectedNode?: GraphNodeName | null;
}

const NODE_LABELS: Record<GraphNodeName, string> = {
  parseIngredients: "parse\nIngredients",
  proposeDirections: "propose\nDirections",
  selectDirection: "select\nDirection",
  draftRecipe: "draft\nRecipe",
  critique: "critique",
  refine: "refine",
  finalize: "finalize",
  ingredientError: "ingredient\nError",
};

const DIAMOND_LABELS: Record<(typeof DECISION_POINTS)[number]["id"], string> = {
  usable: "usable?",
  blockingAndBudget: "blocking?",
};

const NODE_RADIUS = 26;
const TERMINAL_WIDTH = 64;
const TERMINAL_HEIGHT = 32;
const DIAMOND_HALF = 17;
const SELECTED_RING_GAP = 6;

/** Matches `StageProgress.tsx`/`AboutSlideshow.tsx`'s own visually-hidden
 * style object (research R5) — kept as a separate literal here rather than
 * a shared import, matching how those two components each define their own
 * copy today. */
const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity?: number;
}

function shapeStyle(state: NodeVisualState): ShapeStyle {
  switch (state) {
    case "taken":
      return {
        fill: "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))",
        stroke: "var(--color-accent)",
        strokeWidth: 2,
      };
    case "current":
      return { fill: "var(--color-accent)", stroke: "var(--color-accent)", strokeWidth: 3 };
    case "untaken":
      return {
        fill: "var(--color-surface)",
        stroke: "var(--color-border)",
        strokeWidth: 1.5,
        strokeDasharray: "3,3",
        opacity: 0.6,
      };
    case "not-yet-reached":
    default:
      return { fill: "var(--color-surface)", stroke: "var(--color-border)", strokeWidth: 1.5 };
  }
}

/** Which arrowhead marker an edge segment uses, matching its own line
 * color exactly — "taken" and "current" get their own two distinct marker
 * defs (a completed edge's border+light-fill echoing the completed node's
 * own look, an in-progress edge's solid fill echoing the current node's),
 * so a viewer can tell at a glance which single edge is the next step
 * versus which are already behind it; not-yet-reached/untaken edges share
 * the existing plain muted marker. */
function arrowMarkerId(state: NodeVisualState): string {
  if (state === "taken") return "agp-arrow-taken";
  if (state === "current") return "agp-arrow-current";
  return "agp-arrow-muted";
}

function textFill(state: NodeVisualState): string {
  if (state === "current") return "var(--color-accent-contrast)";
  if (state === "not-yet-reached" || state === "untaken") return "var(--color-text-muted)";
  return "var(--color-text)";
}

const STAGE_PREFIX: Record<NodeVisualState, string> = {
  taken: "✓ ",
  current: "▶ ",
  "not-yet-reached": "",
  untaken: "✕ ",
};

/** The edge from a decision's `after` node into its *alternate* (non-main)
 * side is drawn from the diamond's own coordinates, not the node's —
 * `usable?`/`blockingAndBudget?` both share their alternate side's x with
 * the diamond (the two-row layout's shared column, `lib/graph-progress.ts`),
 * so this reads as a clean branch downward from the diamond rather than a
 * line that merely passes near it. Every other edge (including the
 * selectDirection→draftRecipe join connector and the refine→critique
 * loop-back) is a plain straight line between its two nodes' own
 * coordinates — the two-row layout's column alignment means no edge needs
 * curved/multi-segment routing. */
function edgeStart(from: GraphNodeName, to: GraphNodeName): { x: number; y: number } {
  const dp = DECISION_POINTS.find((d) => d.after === from && d.routesTo[1] === to);
  if (dp) return { x: dp.x, y: dp.y };
  const node = GRAPH_NODES.find((n) => n.name === from)!;
  return { x: node.x, y: node.y };
}

/** The decision point whose *main* (first) route this edge is, if any — an
 * edge like `critique -> finalize` visually passes straight through its
 * diamond, so it's rendered as two segments (source -> diamond, diamond ->
 * target) rather than one, both so an arrowhead can land at the diamond and
 * so the first segment can be highlighted as "current" while sitting at the
 * source node deciding (e.g. critique, about to resolve blocking & budget?). */
function mainPathDecision(from: GraphNodeName, to: GraphNodeName) {
  return DECISION_POINTS.find((d) => d.after === from && d.routesTo[0] === to) ?? null;
}

const ARROW_GAP = 4;
const DIAMOND_CLEARANCE = DIAMOND_HALF + ARROW_GAP;

/** Pulls `to` back toward `from` by `distance`, along the line between them
 * — otherwise the arrowhead marker (placed exactly at the line's end)
 * lands at the target shape's own center and renders fully hidden under
 * it, since shapes are drawn after edges. */
function shortenEndpoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  distance: number,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: to.x - (dx / len) * distance, y: to.y - (dy / len) * distance };
}

/** How far back from a node's own center an incoming arrow must stop to
 * clear its shape — a terminal's clearance depends on whether the edge
 * approaches it horizontally or vertically (this grid-aligned layout never
 * approaches a terminal diagonally). */
function nodeClearance(node: GraphNodeLayout, dx: number, dy: number): number {
  if (node.kind === "terminal") {
    return (Math.abs(dx) >= Math.abs(dy) ? TERMINAL_WIDTH / 2 : TERMINAL_HEIGHT / 2) + ARROW_GAP;
  }
  return NODE_RADIUS + ARROW_GAP;
}

function describeRunPath(
  nodes: Record<GraphNodeName, NodeVisualState>,
  takenInOrder: GraphNodeName[],
  current: GraphNodeName | null,
): string {
  const parts: string[] = [];
  if (takenInOrder.length > 0) {
    parts.push(`Progress: ${takenInOrder.join(", ")} ${takenInOrder.length === 1 ? "is" : "are"} done.`);
  }
  parts.push(current ? `${current} is the current stage.` : "The run has finished.");

  const notReached = GRAPH_NODES.map((n) => n.name).filter((n) => nodes[n] === "not-yet-reached");
  if (notReached.length > 0) {
    parts.push(`${notReached.join(", ")} ${notReached.length === 1 ? "is" : "are"} not yet reached.`);
  }

  if (nodes.ingredientError === "untaken") {
    parts.push("The ingredient-error path was not taken.");
  } else if (nodes.proposeDirections === "untaken") {
    parts.push("The main path was not taken — the run ended at the ingredient-error stage.");
  }

  if (nodes.refine === "untaken") {
    parts.push("The recipe was never revised.");
  } else if (takenInOrder.includes("refine")) {
    parts.push("The recipe was revised at least once.");
  }

  return parts.join(" ");
}

/**
 * Two-row rebuild (spec 006 US2) of `StageProgress.tsx`'s original
 * replacement (spec 005) — same diagram of the agent graph's true topology
 * and the currently-displayed run's real path (taken / current /
 * not-yet-reached / untaken, research R4 in spec 005), just laid out as a
 * "boustrophedon" (row 1 left-to-right, row 2 directly below reading
 * right-to-left) instead of one long row, per `lib/graph-progress.ts`'s
 * new coordinates. All run-state derivation (`deriveRunPath`) and the
 * accessible text summary are unchanged.
 */
export function AgentGraphProgress({
  timeline,
  branchId,
  next,
  outcome,
  checkpointId,
  onSelectNode,
  selectedNode,
}: AgentGraphProgressProps) {
  const path = deriveRunPath(timeline, branchId, next, outcome, checkpointId);
  const summary = describeRunPath(path.nodes, path.takenInOrder, path.current);

  return (
    // No `minWidth` on the svg below (by explicit request) — it always
    // scales to fill whatever width this container has via `viewBox`, so
    // it never needs to actually scroll; `overflowX: auto` stays only as a
    // defensive fallback for a pathologically narrow container, not the
    // primary fit strategy feature 005/006 originally used.
    <div
      data-testid="agent-graph-progress-scroll"
      role="group"
      aria-label="Agent progress diagram (scrollable)"
      tabIndex={0}
      style={{ overflowX: "auto" }}
    >
      <p data-testid="agent-graph-summary" style={visuallyHiddenStyle}>
        {summary}
      </p>
      <svg
        viewBox="0 0 510 370"
        aria-hidden="true"
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <defs>
          <marker id="agp-arrow-muted" markerWidth={6.3} markerHeight={6.3} refX={4.5} refY={3.15} orient="auto">
            <path d="M0,0 L6.3,3.15 L0,6.3 z" style={{ fill: "var(--color-text-muted)" }} />
          </marker>
          <marker id="agp-arrow-current" markerWidth={6.3} markerHeight={6.3} refX={4.5} refY={3.15} orient="auto">
            <path d="M0,0 L6.3,3.15 L0,6.3 z" style={{ fill: "var(--color-accent)" }} />
          </marker>
          <marker id="agp-arrow-taken" markerWidth={8.1} markerHeight={8.1} refX={6.3} refY={4.05} orient="auto">
            <path
              d="M0.9,0.9 L7.2,4.05 L0.9,7.2 z"
              style={{
                fill: "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))",
                stroke: "var(--color-accent)",
                strokeWidth: 0.9,
                strokeLinejoin: "round",
              }}
            />
          </marker>
        </defs>

        {GRAPH_EDGES.map(({ from, to }) => {
          const toNode = GRAPH_NODES.find((n) => n.name === to)!;
          const dp = mainPathDecision(from, to);

          if (dp) {
            // Split at the diamond: source -> diamond reflects the source
            // node's own state (so it reads as "current" — the selected,
            // highlighted arrow — exactly while sitting at that node
            // deciding); diamond -> target reflects the target's state, as
            // every other edge does.
            const fromNode = GRAPH_NODES.find((n) => n.name === from)!;
            const sourceState = path.nodes[from];
            const targetState = path.edges[`${from}->${to}`]!;
            const sourceStyle = shapeStyle(sourceState);
            const targetStyle = shapeStyle(targetState);
            const seg1End = shortenEndpoint(fromNode, dp, DIAMOND_CLEARANCE);
            const seg2End = shortenEndpoint(dp, toNode, nodeClearance(toNode, toNode.x - dp.x, toNode.y - dp.y));
            return (
              <g key={`${from}->${to}`}>
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={seg1End.x}
                  y2={seg1End.y}
                  style={{
                    stroke: sourceStyle.stroke,
                    strokeWidth: sourceStyle.strokeWidth,
                    strokeDasharray: sourceStyle.strokeDasharray,
                    opacity: sourceStyle.opacity,
                  }}
                  markerEnd={`url(#${arrowMarkerId(sourceState)})`}
                />
                <line
                  x1={dp.x}
                  y1={dp.y}
                  x2={seg2End.x}
                  y2={seg2End.y}
                  style={{
                    stroke: targetStyle.stroke,
                    strokeWidth: targetStyle.strokeWidth,
                    strokeDasharray: targetStyle.strokeDasharray,
                    opacity: targetStyle.opacity,
                  }}
                  markerEnd={`url(#${arrowMarkerId(targetState)})`}
                />
              </g>
            );
          }

          const start = edgeStart(from, to);
          const edgeState = path.edges[`${from}->${to}`]!;
          const style = shapeStyle(edgeState);
          const end = shortenEndpoint(start, toNode, nodeClearance(toNode, toNode.x - start.x, toNode.y - start.y));
          return (
            <line
              key={`${from}->${to}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              style={{
                stroke: style.stroke,
                strokeWidth: style.strokeWidth,
                strokeDasharray: style.strokeDasharray,
                opacity: style.opacity,
              }}
              markerEnd={`url(#${arrowMarkerId(edgeState)})`}
            />
          );
        })}

        {DECISION_POINTS.map((dp) => {
          const resolved = path.nodes[dp.after] === "taken";
          const style = shapeStyle(resolved ? "taken" : "not-yet-reached");
          const half = DIAMOND_HALF;
          const points = `${dp.x},${dp.y - half} ${dp.x + half},${dp.y} ${dp.x},${dp.y + half} ${dp.x - half},${dp.y}`;
          return (
            <g key={dp.id}>
              <polygon
                points={points}
                style={{ fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth }}
              />
              <text
                x={dp.x}
                y={dp.y - half - 6}
                textAnchor="middle"
                style={{ font: "600 7.5px var(--font-sans)", fill: "var(--color-text-muted)" }}
              >
                {DIAMOND_LABELS[dp.id]}
              </text>
            </g>
          );
        })}

        {GRAPH_NODES.map((node) => {
          const state = path.nodes[node.name];
          const style = shapeStyle(state);
          const lines = (STAGE_PREFIX[state] + NODE_LABELS[node.name]).split("\n");
          const isSelected = selectedNode === node.name;
          return (
            <g
              key={node.name}
              data-testid={`agent-graph-node-${node.name}`}
              data-node-state={state}
              data-selected={isSelected ? "true" : "false"}
              style={{ opacity: style.opacity ?? 1, cursor: onSelectNode ? "pointer" : undefined }}
              onClick={onSelectNode ? () => onSelectNode(node.name) : undefined}
            >
              {isSelected &&
                (node.kind === "terminal" ? (
                  <rect
                    x={node.x - TERMINAL_WIDTH / 2 - SELECTED_RING_GAP}
                    y={node.y - TERMINAL_HEIGHT / 2 - SELECTED_RING_GAP}
                    width={TERMINAL_WIDTH + SELECTED_RING_GAP * 2}
                    height={TERMINAL_HEIGHT + SELECTED_RING_GAP * 2}
                    rx={(TERMINAL_HEIGHT + SELECTED_RING_GAP * 2) / 2}
                    style={{ fill: "none", stroke: "var(--color-text)", strokeWidth: 1.5, strokeDasharray: "4,3" }}
                  />
                ) : (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + SELECTED_RING_GAP}
                    style={{ fill: "none", stroke: "var(--color-text)", strokeWidth: 1.5, strokeDasharray: "4,3" }}
                  />
                ))}
              {node.kind === "terminal" ? (
                <rect
                  x={node.x - TERMINAL_WIDTH / 2}
                  y={node.y - TERMINAL_HEIGHT / 2}
                  width={TERMINAL_WIDTH}
                  height={TERMINAL_HEIGHT}
                  rx={TERMINAL_HEIGHT / 2}
                  style={{
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    strokeDasharray: style.strokeDasharray,
                  }}
                />
              ) : (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS}
                  style={{
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    strokeDasharray: style.strokeDasharray,
                  }}
                />
              )}
              {lines.map((line, i) => (
                <text
                  key={line + i}
                  x={node.x}
                  y={node.y + (i - (lines.length - 1) / 2) * 9.5 + 3}
                  textAnchor="middle"
                  style={{ font: "600 8px var(--font-mono)", fill: textFill(state) }}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
