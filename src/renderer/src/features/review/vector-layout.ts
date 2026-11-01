import type { Architecture } from '@shared/review';
import type { ElkNode } from 'elkjs/lib/elk-api';

export function labelLines(label: string): string[] {
  const lines: string[] = [];
  let line = '';
  let width = 0;
  for (const character of label.slice(0, 100)) {
    const units = character.charCodeAt(0) > 127 ? 1 : 0.55;
    if (width + units > 10.5 && line) {
      lines.push(line.trim());
      line = '';
      width = 0;
    }
    line += character;
    width += units;
  }
  if (line) lines.push(line.trim());
  return lines.length ? lines : [''];
}

export interface VectorLayout {
  width: number;
  height: number;
  nodes: { index: number; x: number; y: number; width: number; height: number; lines: string[] }[];
  groups: { id: string; label: string; x: number; y: number; width: number; height: number }[];
  edges: {
    index: number;
    path: string;
    labels: { text: string; x: number; y: number; width: number; height: number }[];
  }[];
}

export async function layoutVectorGraph(graph: Architecture, flow = false): Promise<VectorLayout> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]));
  const children: ElkNode[] = graph.nodes.map((node, index) => ({
    id: `n${index}`,
    width: 164,
    height: Math.max(56, labelLines(node.label).length * 17 + 24),
  }));
  const grouped = new Set<string>();
  const areas = (graph.groups ?? []).flatMap((group, index) => {
    const members = children.filter((_, nodeIndex) => graph.nodes[nodeIndex]?.group === group.id);
    if (!members.length) return [];
    for (const node of members) grouped.add(node.id);
    return [
      {
        id: `g${index}`,
        children: members,
        layoutOptions: { 'elk.padding': '[top=38,left=18,bottom=18,right=18]' },
      },
    ];
  });
  const result = await new ELK().layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': flow ? 'RIGHT' : 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      'elk.padding': '[top=16,left=16,bottom=16,right=16]',
    },
    children: [...areas, ...children.filter((node) => !grouped.has(node.id))],
    edges: graph.edges.flatMap((edge, index) => {
      const from = ids.get(edge.from);
      const to = ids.get(edge.to);
      if (!from || !to) return [];
      const text = edge.label?.slice(0, 48);
      return [
        {
          id: `e${index}`,
          sources: [from],
          targets: [to],
          ...(text
            ? { labels: [{ text, width: Math.min(160, text.length * 8), height: 18 }] }
            : {}),
        },
      ];
    }),
  });
  const nodes: VectorLayout['nodes'] = [];
  const groups: VectorLayout['groups'] = [];
  const origins = new Map<string, { x: number; y: number }>();
  const collect = (node: ElkNode, x = 0, y = 0) => {
    const left = x + (node.x ?? 0);
    const top = y + (node.y ?? 0);
    origins.set(node.id, { x: left, y: top });
    if (/^n\d+$/.test(node.id)) {
      const index = Number(node.id.slice(1));
      nodes.push({
        index,
        x: left,
        y: top,
        width: node.width ?? 164,
        height: node.height ?? 56,
        lines: labelLines(graph.nodes[index]?.label ?? ''),
      });
    } else if (/^g\d+$/.test(node.id)) {
      groups.push({
        id: node.id,
        label: graph.groups?.[Number(node.id.slice(1))]?.label ?? '',
        x: left,
        y: top,
        width: node.width ?? 0,
        height: node.height ?? 0,
      });
    }
    for (const child of node.children ?? []) collect(child, left, top);
  };
  collect(result);
  return {
    width: result.width ?? 200,
    height: result.height ?? 100,
    nodes,
    groups,
    edges: (result.edges ?? []).map((edge) => {
      const container = (edge as typeof edge & { container?: string }).container ?? 'root';
      const offset = origins.get(container) ?? { x: 0, y: 0 };
      return {
        index: Number(edge.id.slice(1)),
        path: (edge.sections ?? [])
          .map((section) => {
            const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
            return points
              .map(
                (point, index) => `${index ? 'L' : 'M'}${point.x + offset.x},${point.y + offset.y}`,
              )
              .join(' ');
          })
          .join(' '),
        labels: (edge.labels ?? []).map((label) => ({
          text: label.text ?? '',
          x: (label.x ?? 0) + offset.x,
          y: (label.y ?? 0) + offset.y,
          width: label.width ?? 0,
          height: label.height ?? 18,
        })),
      };
    }),
  };
}
