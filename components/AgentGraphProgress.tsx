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
 * the diamond (research R3's layout), so this reads as a clean branch
 * downward from the diamond rather than a line that merely passes near it. */
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
 * Replaces `StageProgress.tsx`'s flat stepper (spec 005) with a diagram of
 * the agent graph's true topology, reflecting the currently-displayed run's
 * real path — taken / current / not-yet-reached / untaken (research R4) —
 * rather than inferring progress from `next`/`outcome` alone. Visual
 * vocabulary adapted from `components/about/diagrams.tsx`'s
 * `AgentGraphDiagram` (research R3) at a compact, inline-appropriate size.
 */
export function AgentGraphProgress({
  timeline,
  branchId,
  next,
  outcome,
  checkpointId,
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
        viewBox="0 0 560 190"
        aria-hidden="true"
        style={{ display: "block", width: "100%", height: "auto", minWidth: "420px" }}
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
          const half = 13;
          const points = `${dp.x},${dp.y - half} ${dp.x + half},${dp.y} ${dp.x},${dp.y + half} ${dp.x - half},${dp.y}`;
          return (
            <g key={dp.id}>
              <polygon
                points={points}
                style={{ fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth }}
              />
              <text
                x={dp.x}
                y={dp.y - half - 5}
                textAnchor="middle"
                style={{ font: "600 7px var(--font-sans)", fill: "var(--color-text-muted)" }}
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
          return (
            <g key={node.name} style={{ opacity: style.opacity ?? 1 }}>
              {node.kind === "terminal" ? (
                <rect
                  x={node.x - 27}
                  y={node.y - 13}
                  width={54}
                  height={26}
                  rx={13}
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
                  r={20}
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
                  y={node.y + (i - (lines.length - 1) / 2) * 9 + 3}
                  textAnchor="middle"
                  style={{ font: "600 7.5px var(--font-mono)", fill: textFill(state) }}
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
