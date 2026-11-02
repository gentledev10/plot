import type { FlowRole } from '@shared/flowchart';

export interface Point {
  x: number;
  y: number;
}
export interface SymbolBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const FLOW_FONT_SIZE = 14;
export const FLOW_LINE_HEIGHT = 18;

export function flowDimensions(role: FlowRole, lines: readonly string[]) {
  const textWidth =
    Math.max(
      ...lines.map((line) =>
        [...line].reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 1 : 0.55), 0),
      ),
    ) * FLOW_FONT_SIZE;
  const textHeight = Math.max(1, lines.length) * FLOW_LINE_HEIGHT;
  // The central half-width/half-height rectangle is entirely inside a rhombus.
  // Reserve that rectangle for text, rather than fitting text to its outer bounds.
  if (role === 'decision')
    return { width: Math.max(260, textWidth * 2 + 40), height: Math.max(112, textHeight * 2 + 32) };
  return {
    width: Math.max(
      role === 'start' || role === 'end' ? 176 : 224,
      textWidth + (role === 'input' || role === 'output' ? 80 : 56),
    ),
    height: Math.max(role === 'start' || role === 'end' ? 52 : 60, textHeight + 28),
  };
}

function polygon(role: FlowRole, box: SymbolBox): Point[] | undefined {
  const { x, y, width: w, height: h } = box;
  if (role === 'decision')
    return [
      { x: x + w / 2, y },
      { x: x + w, y: y + h / 2 },
      { x: x + w / 2, y: y + h },
      { x, y: y + h / 2 },
    ];
  if (role === 'input' || role === 'output') {
    const slant = Math.min(24, w / 8);
    return [
      { x: x + slant, y },
      { x: x + w, y },
      { x: x + w - slant, y: y + h },
      { x, y: y + h },
    ];
  }
  return;
}
export function flowSymbolPath(role: FlowRole, box: SymbolBox): string | undefined {
  const vertices = polygon(role, box);
  return vertices
    ? `${vertices.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} Z`
    : undefined;
}

export function attachToFlowSymbol(
  role: FlowRole,
  box: SymbolBox,
  anchor: Point,
  adjacent: Point,
): Point {
  const vertices = polygon(role, box);
  if (!vertices) return anchor;
  const d = { x: adjacent.x - anchor.x, y: adjacent.y - anchor.y };
  const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  let best = -Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (!a || !b) continue;
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const denominator = cross(d, edge);
    if (Math.abs(denominator) < 1e-8) continue;
    const offset = { x: a.x - anchor.x, y: a.y - anchor.y };
    const t = cross(offset, edge) / denominator;
    const u = cross(offset, d) / denominator;
    if (t <= 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
  }
  return Number.isFinite(best) ? { x: anchor.x + best * d.x, y: anchor.y + best * d.y } : anchor;
}
