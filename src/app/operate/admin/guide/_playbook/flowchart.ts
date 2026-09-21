/**
 * The playbook's flowcharts, as data and one renderer — LAN-399.
 *
 * Brian's decision of 21 September 2026 is that the flowcharts are committed
 * SVG files, drawn by hand, with no diagram library and no change to the
 * Content Security Policy. "Drawn by hand" is not the same as "typed by hand":
 * a file of eight hundred absolute coordinates is unreviewable and unmaintainable,
 * and the first edit to it puts a box on top of an arrow. So each diagram is a
 * grid of nodes and a list of edges, and this module turns that into the file.
 *
 * The committed files under `public/guide/` are the artefact the pages load.
 * They are held to the specs below by `flowchart.test.ts`, which renders every
 * spec and compares it to the file with `toMatchFileSnapshot` — so editing a
 * spec without regenerating fails, and regenerating is `vitest -u`.
 *
 * Colours are `src/theme-tokens.ts`, not new values: an SVG loaded through
 * `<img>` cannot read a CSS custom property, so the hex is written into the
 * file and imported from the token module here so it cannot drift.
 */
import { CLUB, SEMANTIC } from "@/theme-tokens";

/**
 * The five shapes, which are the diagram's whole vocabulary.
 *
 * `operator` and `automatic` are both *things that happen*; they are separate
 * shapes because the single question an operator asks a flowchart is "is this
 * one mine, or does the app do it".
 */
export type FlowShape = "state" | "operator" | "automatic" | "decision" | "message" | "exit";

interface FlowNode {
  readonly id: string;
  readonly shape: FlowShape;
  /** One entry per rendered line. No wrapping engine: the line breaks are a drawing decision. */
  readonly label: readonly string[];
  readonly col: number;
  readonly row: number;
}

/**
 * How an edge gets from one node to the other.
 *
 * Omitted, it is inferred: straight down within a column, straight across
 * within a row, and otherwise down-then-across. The named routes exist for the
 * cases the inference draws through another box.
 */
type FlowRoute =
  | "down"
  | "up"
  | "across"
  | "down-across"
  | "across-down"
  | "across-return"
  | "around-right"
  | "around-left";

interface FlowEdge {
  readonly from: string;
  readonly to: string;
  /** The operator's action, or the app's automatic step. One entry per line. */
  readonly label?: readonly string[];
  readonly route?: FlowRoute;
}

export interface FlowDiagram {
  /** The `<title>` element — the accessible name of the drawing itself. */
  readonly title: string;
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
}

/** What each shape means, rendered as a legend on every diagram. */
export const SHAPE_LEGEND: readonly { readonly shape: FlowShape; readonly meaning: string }[] =
  Object.freeze([
    Object.freeze({ shape: "state" as const, meaning: "State" }),
    Object.freeze({ shape: "operator" as const, meaning: "Operator acts" }),
    Object.freeze({ shape: "automatic" as const, meaning: "App acts" }),
    Object.freeze({ shape: "decision" as const, meaning: "Decision" }),
    Object.freeze({ shape: "message" as const, meaning: "Message sent" }),
    Object.freeze({ shape: "exit" as const, meaning: "End" }),
  ]);

const COL_WIDTH = 320;
const ROW_HEIGHT = 128;
const NODE_WIDTH = 204;
const NODE_HEIGHT = 58;
const DECISION_HEIGHT = 78;
const MARGIN = 20;
const LEGEND_HEIGHT = 46;
/** Wide enough for the legend row, whatever the diagram does. */
const MIN_WIDTH = 812;
const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Breathing room on a side an `around-*` edge uses as a lane. */
const LANE_MARGIN = 124;
/** How far outside the outermost box that lane runs. */
const LANE_OFFSET = 62;

interface Box {
  readonly node: FlowNode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cx: number;
  readonly cy: number;
}

interface ShapeStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

/** Every value here is a `theme-tokens.ts` token. No colour is invented for the drawings. */
const SHAPE_STYLES: Readonly<Record<FlowShape, ShapeStyle>> = Object.freeze({
  state: { fill: CLUB.white, stroke: CLUB.oxfordBlue, text: CLUB.charcoal },
  operator: { fill: CLUB.skyBlue, stroke: CLUB.oxfordBlue, text: CLUB.oxfordBlue },
  automatic: { fill: SEMANTIC.info.light, stroke: CLUB.royalBlue, text: CLUB.oxfordBlue },
  decision: { fill: CLUB.ground, stroke: CLUB.gold, text: CLUB.charcoal },
  message: { fill: CLUB.ochre, stroke: CLUB.oldGold, text: CLUB.charcoal },
  exit: { fill: SEMANTIC.neutral.light, stroke: CLUB.charcoal70, text: CLUB.charcoal },
});

function heightOf(node: FlowNode): number {
  return node.shape === "decision" ? DECISION_HEIGHT : NODE_HEIGHT;
}

/**
 * Places every box on the grid, and reserves a lane on either side for the
 * `around-left` / `around-right` edges that need one.
 *
 * The lanes are the reason this is not two lines of arithmetic. A loop drawn
 * outside the leftmost column runs at a negative x unless the whole grid is
 * pushed right first, and one drawn outside the rightmost column runs off the
 * end of the canvas unless the canvas is widened — in both cases the arrow is
 * simply not in the file, which is a failure nothing else here would catch.
 */
function layout(diagram: FlowDiagram): { boxes: Map<string, Box>; width: number; height: number } {
  const boxes = new Map<string, Box>();
  let maxCol = 0;
  let maxRow = 0;

  const leftLane = diagram.edges.some((edge) => edge.route === "around-left") ? LANE_MARGIN : 0;
  const rightLane = diagram.edges.some((edge) => edge.route === "around-right") ? LANE_MARGIN : 0;

  for (const node of diagram.nodes) {
    const width = NODE_WIDTH;
    const height = heightOf(node);
    const x = MARGIN + leftLane + node.col * COL_WIDTH;
    // Rows are a constant pitch; a shorter shape sits centred in its row.
    const y = MARGIN + LEGEND_HEIGHT + node.row * ROW_HEIGHT + (DECISION_HEIGHT - height) / 2;
    boxes.set(node.id, { node, x, y, width, height, cx: x + width / 2, cy: y + height / 2 });
    maxCol = Math.max(maxCol, node.col);
    maxRow = Math.max(maxRow, node.row);
  }

  const width = Math.max(
    MIN_WIDTH,
    MARGIN * 2 + leftLane + rightLane + maxCol * COL_WIDTH + NODE_WIDTH,
  );
  const height = MARGIN * 2 + LEGEND_HEIGHT + maxRow * ROW_HEIGHT + DECISION_HEIGHT;
  return { boxes, width, height };
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function inferRoute(from: Box, to: Box): FlowRoute {
  if (from.node.col === to.node.col) return to.node.row > from.node.row ? "down" : "up";
  if (from.node.row === to.node.row) return "across";
  return "down-across";
}

/** The outermost x of every box, so a lane clears the whole drawing and not just its own two boxes. */
interface Extents {
  readonly left: number;
  readonly right: number;
}

/** The polyline an edge follows, first point on the source's edge and last on the target's. */
function routePoints(from: Box, to: Box, route: FlowRoute, extents: Extents): readonly Point[] {
  // Not the middle of the gap: a straight-down arrow from the same box carries
  // its own label at the middle, and the two would sit on top of each other.
  const gapBelow = (box: Box) => box.y + box.height + (ROW_HEIGHT - box.height) * 0.7;

  switch (route) {
    case "down":
      return [
        { x: from.cx, y: from.y + from.height },
        { x: to.cx, y: to.y },
      ];
    case "up":
      return [
        { x: from.cx, y: from.y },
        { x: to.cx, y: to.y + to.height },
      ];
    case "across": {
      const rightwards = to.cx > from.cx;
      return [
        { x: rightwards ? from.x + from.width : from.x, y: from.cy },
        { x: rightwards ? to.x : to.x + to.width, y: to.cy },
      ];
    }
    case "down-across": {
      const midY = gapBelow(from);
      return [
        { x: from.cx, y: from.y + from.height },
        { x: from.cx, y: midY },
        { x: to.cx, y: midY },
        { x: to.cx, y: to.y },
      ];
    }
    case "across-down": {
      const rightwards = to.cx > from.cx;
      return [
        { x: rightwards ? from.x + from.width : from.x, y: from.cy },
        { x: to.cx, y: from.cy },
        { x: to.cx, y: to.y },
      ];
    }
    case "across-return": {
      const rightwards = to.cx > from.cx;
      const lane = Math.max(from.y + from.height, to.y + to.height) + LANE_OFFSET / 2;
      const nudge = rightwards ? 34 : -34;
      return [
        { x: from.cx + nudge, y: from.y + from.height },
        { x: from.cx + nudge, y: lane },
        { x: to.cx - nudge, y: lane },
        { x: to.cx - nudge, y: to.y + to.height },
      ];
    }
    case "around-right": {
      const lane = extents.right + LANE_OFFSET;
      return [
        { x: from.x + from.width, y: from.cy },
        { x: lane, y: from.cy },
        { x: lane, y: to.cy },
        { x: to.x + to.width, y: to.cy },
      ];
    }
    case "around-left": {
      const lane = extents.left - LANE_OFFSET;
      return [
        { x: from.x, y: from.cy },
        { x: lane, y: from.cy },
        { x: lane, y: to.cy },
        { x: to.x, y: to.cy },
      ];
    }
  }
}

/** The midpoint of the longest segment, which is where a label has room. */
function labelAnchor(points: readonly Point[]): Point {
  let best = 0;
  let bestLength = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(
      points[index + 1].x - points[index].x,
      points[index + 1].y - points[index].y,
    );
    if (length > bestLength) {
      bestLength = length;
      best = index;
    }
  }
  return {
    x: (points[best].x + points[best + 1].x) / 2,
    y: (points[best].y + points[best + 1].y) / 2,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shapeMarkup(box: Box, style: ShapeStyle): string {
  const x = round(box.x);
  const y = round(box.y);
  const { width, height } = box;
  const cx = round(box.cx);
  const cy = round(box.cy);
  const common = `fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5"`;

  switch (box.node.shape) {
    case "decision":
      return `<polygon points="${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}" ${common} />`;
    case "message": {
      // A parallelogram: the one shape on the page that leaves the club.
      const slant = Math.min(14, width * 0.12);
      return `<polygon points="${x + slant},${y} ${x + width},${y} ${x + width - slant},${y + height} ${x},${y + height}" ${common} />`;
    }
    case "exit":
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${round(height / 2)}" ${common} />`;
    default:
      // Scaled, so the legend's 14px glyph is a rounded rectangle rather than
      // the same pill the `exit` glyph beside it is.
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${round(Math.min(8, height / 4))}" ${common} />`;
  }
}

function textMarkup(
  lines: readonly string[],
  cx: number,
  cy: number,
  fill: string,
  fontSize: number,
  weight: number,
  knockout?: string,
): string {
  const lineHeight = fontSize + 3;
  const top = cy - ((lines.length - 1) * lineHeight) / 2;
  const paint = knockout
    ? ` stroke="${knockout}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"`
    : "";
  return lines
    .map(
      (line, index) =>
        `<text x="${round(cx)}" y="${round(top + index * lineHeight)}" text-anchor="middle" ` +
        `dominant-baseline="central" font-size="${fontSize}" font-weight="${weight}" ` +
        `fill="${fill}"${paint}>${escapeXml(line)}</text>`,
    )
    .join("\n    ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function legendMarkup(width: number): string {
  const step = Math.round(Math.min(132, (width - MARGIN * 2) / SHAPE_LEGEND.length));
  const glyphWidth = 26;
  const glyphHeight = 14;
  const y = MARGIN;

  return SHAPE_LEGEND.map((entry, index) => {
    const style = SHAPE_STYLES[entry.shape];
    const x = MARGIN + index * step;
    const box: Box = {
      node: { id: entry.shape, shape: entry.shape, label: [], col: 0, row: 0 },
      x,
      y,
      width: glyphWidth,
      height: glyphHeight,
      cx: x + glyphWidth / 2,
      cy: y + glyphHeight / 2,
    };
    return (
      `${shapeMarkup(box, style)}\n    ` +
      `<text x="${x + glyphWidth + 6}" y="${y + glyphHeight / 2}" dominant-baseline="central" ` +
      `font-size="11" fill="${CLUB.charcoal70}">${escapeXml(entry.meaning)}</text>`
    );
  }).join("\n    ");
}

/**
 * The SVG file for one diagram.
 *
 * `role="img"` plus `<title>` is the accessible name of the drawing when it is
 * inlined; the pages load it through `<img alt>` instead, and carry a full text
 * description beneath it, so neither reading depends on the other.
 */
export function renderFlowchart(diagram: FlowDiagram): string {
  const { boxes, width, height } = layout(diagram);

  const placed = [...boxes.values()];
  const extents: Extents = {
    left: Math.min(...placed.map((box) => box.x)),
    right: Math.max(...placed.map((box) => box.x + box.width)),
  };

  const edges = diagram.edges.map((edge) => {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (!from || !to) throw new Error(`edge names an unknown node: ${edge.from} -> ${edge.to}`);

    const points = routePoints(from, to, edge.route ?? inferRoute(from, to), extents);
    const path = points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
    const line =
      `<polyline points="${path}" fill="none" stroke="${CLUB.charcoal70}" ` +
      `stroke-width="1.5" marker-end="url(#arrow)" />`;
    if (!edge.label || edge.label.length === 0) return line;

    const anchor = labelAnchor(points);
    return `${line}\n    ${textMarkup(edge.label, round(anchor.x), round(anchor.y), CLUB.charcoal70, 11, 500, CLUB.ground)}`;
  });

  const nodes = diagram.nodes.map((node) => {
    const box = boxes.get(node.id);
    if (!box) throw new Error(`unlaid node: ${node.id}`);
    const style = SHAPE_STYLES[node.shape];
    return `${shapeMarkup(box, style)}\n    ${textMarkup(node.label, round(box.cx), round(box.cy), style.text, 13, 600)}`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="diagram-title" font-family="${FONT_STACK}">`,
    `  <title id="diagram-title">${escapeXml(diagram.title)}</title>`,
    `  <defs>`,
    `    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`,
    `      <path d="M 0 0 L 10 5 L 0 10 z" fill="${CLUB.charcoal70}" />`,
    `    </marker>`,
    `  </defs>`,
    `  <rect width="${width}" height="${height}" fill="${CLUB.ground}" />`,
    `  <g>`,
    `    ${legendMarkup(width)}`,
    `  </g>`,
    `  <g>`,
    `    ${edges.join("\n    ")}`,
    `  </g>`,
    `  <g>`,
    `    ${nodes.join("\n    ")}`,
    `  </g>`,
    `</svg>`,
    ``,
  ].join("\n");
}
