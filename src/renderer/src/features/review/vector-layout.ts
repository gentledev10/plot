import type { Architecture } from '@shared/review';
import type { ElkNode } from 'elkjs/lib/elk-api';
import {
  type DiagramPalette,
  type DiagramRole,
  diagramPalette,
  diagramRole,
  nodeRole,
  roundedConnection,
} from './diagram-design';

export function labelLines(label: string, capacity = 10.5): string[] {
  const lines: string[] = [];
  let line = '';
  const units = (text: string) =>
    [...text].reduce((total, character) => total + (character.charCodeAt(0) > 127 ? 1 : 0.55), 0);
  const append = (part: string) => {
    if (line && units(line + part) > capacity) {
      lines.push(line.trim());
      line = '';
    }
    if (units(part) <= capacity) {
      line += part;
      return;
    }
    for (const character of part) {
      if (line && units(line + character) > capacity) {
        lines.push(line.trim());
        line = '';
      }
      line += character;
    }
  };
  for (const part of label.slice(0, 100).split(/(?<=[\s·/])/u)) {
    if (units(part) <= capacity) append(part);
    else for (const identifierPart of part.split(/(?<=[a-z])(?=[A-Z])/u)) append(identifierPart);
  }
  if (line) lines.push(line.trim());
  return lines.length ? lines : [''];
}

export interface VectorLayout {
  width: number;
  height: number;
  nodes: {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    lines: string[];
    role: DiagramRole;
    palette: DiagramPalette;
  }[];
  groups: {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    role: DiagramRole;
    palette: DiagramPalette;
  }[];
  edges: {
    index: number;
    path: string;
    labels: {
      text: string;
      lines: string[];
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
  }[];
}

export async function layoutVectorGraph(
  graph: Architecture,
  flow = false,
  direction?: 'DOWN' | 'RIGHT',
  nodeRoles?: ReadonlyMap<string, DiagramRole>,
): Promise<VectorLayout> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]));
  const roles = graph.nodes.map(
    (node, index) => nodeRoles?.get(node.id) ?? nodeRole(graph, index, flow),
  );
  const lines = (label: string) => labelLines(label, flow ? 13 : 10.5);
  const children: ElkNode[] = graph.nodes.map((node, index) => ({
    id: `n${index}`,
    width: 244,
    height: Math.max(
      roles[index] === 'decision' ? (flow ? 84 : 100) : flow ? 64 : 80,
      lines(node.label).length * 19 + 32,
    ),
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
        layoutOptions: { 'elk.padding': '[top=60,left=24,bottom=20,right=24]' },
      },
    ];
  });
  const result = await new ELK().layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction ?? (flow ? 'RIGHT' : 'DOWN'),
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '24',
      'elk.layered.spacing.edgeNodeBetweenLayers': '12',
      'elk.padding': '[top=28,left=28,bottom=28,right=28]',
    },
    children: [...areas, ...children.filter((node) => !grouped.has(node.id))],
    edges: graph.edges.flatMap((edge, index) => {
      const from = ids.get(edge.from);
      const to = ids.get(edge.to);
      if (!from || !to) return [];
      const text = edge.label?.slice(0, 48);
      const lines = text ? labelLines(text, 16) : [];
      return [
        {
          id: `e${index}`,
          sources: [from],
          targets: [to],
          ...(text
            ? {
                labels: [
                  {
                    text,
                    width:
                      Math.max(
                        ...lines.map((line) =>
                          [...line].reduce(
                            (sum, character) => sum + (character.charCodeAt(0) > 127 ? 13 : 7.15),
                            0,
                          ),
                        ),
                      ) + 20,
                    height: lines.length * 18 + 10,
                  },
                ],
              }
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
      const group = graph.groups?.find((candidate) => candidate.id === graph.nodes[index]?.group);
      const role = roles[index] ?? 'component';
      nodes.push({
        index,
        x: left,
        y: top,
        width: node.width ?? 164,
        height: node.height ?? 56,
        lines: lines(graph.nodes[index]?.label ?? ''),
        role,
        palette: flow
          ? diagramPalette(role)
          : group
            ? diagramPalette(diagramRole(group.label), group.id)
            : diagramPalette(role, graph.nodes[index]?.id),
      });
    } else if (/^g\d+$/.test(node.id)) {
      const group = graph.groups?.[Number(node.id.slice(1))];
      const role = diagramRole(group?.label ?? '');
      groups.push({
        id: node.id,
        label: graph.groups?.[Number(node.id.slice(1))]?.label ?? '',
        x: left,
        y: top,
        width: node.width ?? 0,
        height: node.height ?? 0,
        role,
        palette: diagramPalette(role, group?.id),
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
            return roundedConnection(
              points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
            );
          })
          .join(' '),
        labels: (edge.labels ?? []).map((label) => ({
          text: label.text ?? '',
          lines: labelLines(label.text ?? '', 16),
          x: (label.x ?? 0) + offset.x,
          y: (label.y ?? 0) + offset.y,
          width: label.width ?? 0,
          height: label.height ?? 18,
        })),
      };
    }),
  };
}
