import type { CSSProperties } from "react";
import {
  DECISION_POINTS,
  GRAPH_EDGES,
  GRAPH_NODES,
  deriveRunPath,
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
        style={{ display: "block", width: "100%", height: "auto", minWidth: "460px" }}
      >
        <defs>
          <marker id="agp-arrow" markerWidth={7} markerHeight={7} refX={5} refY={3.5} orient="auto">
            <path d="M0,0 L7,3.5 L0,7 z" style={{ fill: "var(--color-text-muted)" }} />
          </marker>
        </defs>

        {GRAPH_EDGES.map(({ from, to }) => {
          const start = edgeStart(from, to);
          const end = GRAPH_NODES.find((n) => n.name === to)!;
          const style = shapeStyle(path.edges[`${from}->${to}`]!);
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
              markerEnd="url(#agp-arrow)"
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
