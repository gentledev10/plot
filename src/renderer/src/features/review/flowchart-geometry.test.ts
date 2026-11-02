import type { Architecture } from '@shared/review';
import { describe, expect, it } from 'vitest';
import { attachToFlowSymbol, flowDimensions, flowSymbolPath } from './flowchart-geometry';
import { layoutVectorGraph } from './vector-layout';

describe('conventional flowchart geometry', () => {
  const box = { x: 20, y: 30, width: 300, height: 140 };
  it('uses four rhombus vertices and attaches off-centre arrows to the sloping outline', () => {
    expect(flowSymbolPath('decision', box)).toBe('M170,30 L320,100 L170,170 L20,100 Z');
    const anchor = attachToFlowSymbol('decision', box, { x: 245, y: 30 }, { x: 245, y: 0 });
    expect(anchor).toEqual({ x: 245, y: 65 });
    const side = attachToFlowSymbol('decision', box, { x: 320, y: 65 }, { x: 350, y: 65 });
    expect(side).toEqual({ x: 245, y: 65 });
    for (const point of [anchor, side])
      expect(Math.abs(point.x - 170) / 150 + Math.abs(point.y - 100) / 70).toBeCloseTo(1);
  });
  it('uses a parallelogram for I/O and attaches arrows to its slanted sides', () => {
    const point = attachToFlowSymbol('input', box, { x: 320, y: 100 }, { x: 350, y: 100 });
    expect(point).toEqual({ x: 308, y: 100 });
    expect(flowSymbolPath('output', box)).toBe(flowSymbolPath('input', box));
    expect(flowSymbolPath('process', box)).toBeUndefined();
  });
  it('reserves a central text rectangle inside diamonds for multi-line Korean labels', () => {
    const lines = ['50,000 이상인가?', '금액 기준 확인'];
    const dimensions = flowDimensions('decision', lines);
    const width =
      Math.max(
        ...lines.map((line) =>
          [...line].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 1 : 0.55), 0),
        ),
      ) * 14;
    expect(
      width / (dimensions.width / 2) + (lines.length * 18) / (dimensions.height / 2),
    ).toBeLessThan(2);
    // The whole text rectangle, including its extreme corners, fits the rhombus.
    expect(width / dimensions.width + (lines.length * 18) / dimensions.height).toBeLessThan(1);
  });
  it('keeps a filtered condition a diamond and routes the rendered wire to its true boundary', async () => {
    const graph: Architecture = {
      nodes: [
        { id: 'condition', label: '유한한 숫자인가?', status: 'unchanged', flowRole: 'decision' },
        { id: 'exit', label: '종료', status: 'unchanged', flowRole: 'end' },
      ],
      edges: [{ from: 'condition', to: 'exit', label: '아니요' }],
    };
    const layout = await layoutVectorGraph(graph, true);
    expect(layout.nodes.map((n) => n.flowRole)).toEqual(['decision', 'end']);
    const node = layout.nodes[0];
    const edge = layout.edges[0];
    expect(node).toBeDefined();
    expect(edge).toBeDefined();
    if (!node || !edge) return;
    const first = /^M([\d.]+),([\d.]+)/.exec(edge.path);
    if (!first) throw new Error('Missing rendered wire');
    expect(
      Math.abs(Number(first[1]) - (node.x + node.width / 2)) / (node.width / 2) +
        Math.abs(Number(first[2]) - (node.y + node.height / 2)) / (node.height / 2),
    ).toBeCloseTo(1);
  });
});
