import type { Architecture } from '@shared/review';
import { diagramPalette, diagramRole } from './diagram-design';
import { labelLines } from './vector-layout';

export function layoutSequence(graph: Architecture) {
  const laneWidth = 208;
  const gap = 28;
  const participants = graph.nodes.map((node, index) => {
    const role = diagramRole(node.label);
    return {
      index,
      id: node.id,
      x: 28 + index * (laneWidth + gap),
      width: laneWidth,
      center: 28 + index * (laneWidth + gap) + laneWidth / 2,
      lines: labelLines(node.label, 9),
      role,
      palette: diagramPalette(role, node.id),
    };
  });
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const headerHeight = Math.max(
    84,
    ...participants.map((participant) => participant.lines.length * 19 + 28),
  );
  let nextY = 28 + headerHeight + 46;
  const messages = graph.edges.flatMap((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    const self = from.id === to.id;
    const direction = to.center >= from.center ? 1 : -1;
    const span = Math.abs(to.center - from.center);
    const maxLabelWidth = self ? laneWidth - 28 : Math.max(160, span - 46);
    const lines = labelLines(edge.label ?? '', maxLabelWidth / 14);
    const captionHeight = lines.length * 18 + 8;
    const y = nextY + captionHeight;
    const start = from.center + direction * 7;
    const end = to.center - direction * 7;
    const path = self
      ? `M${from.center + 7},${y} h54 q10,0 10,10 v4 q0,10 -10,10 h-54`
      : `M${start},${y} H${end}`;
    nextY = y + (self ? 60 : 38);
    return [
      {
        index,
        from,
        to,
        self,
        y,
        path,
        numberX: self ? from.center + 26 : start + direction * 18,
        labelX: self ? from.center + 28 : (from.center + to.center) / 2,
        labelY: y - captionHeight - 6,
        captionHeight,
        lines,
        captionWidth: Math.min(
          maxLabelWidth + 20,
          Math.max(
            ...lines.map((line) =>
              [...line].reduce(
                (sum, character) => sum + (character.charCodeAt(0) > 127 ? 14 : 7.7),
                0,
              ),
            ),
          ) + 20,
        ),
      },
    ];
  });
  return {
    participants,
    messages,
    headerHeight,
    width: Math.max(300, participants.length * (laneWidth + gap) + 28),
    height: Math.max(220, nextY + 20),
  };
}
