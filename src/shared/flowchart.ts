import type { Architecture } from './review';

export const FLOW_ROLES = ['start', 'end', 'process', 'decision', 'input', 'output'] as const;
export type FlowRole = (typeof FLOW_ROLES)[number];

// Old saved graphs have no explicit role. Recognize actual branching evidence,
// otherwise use an ordinary process; a leaf alone does not prove termination.
export function flowRole(graph: Architecture, index: number): FlowRole {
  const node = graph.nodes[index];
  if (node?.flowRole) return node.flowRole;
  const outgoing = graph.edges.filter((edge) => edge.from === node?.id);
  if (
    outgoing.length > 1 &&
    (outgoing.some((edge) =>
      /^(yes|no|true|false|hit|miss|예|아니오|아니요|있음|없음|성공|실패)(?=$|[\s:：,.;(])/i.test(
        edge.label ?? '',
      ),
    ) ||
      /[?？]|\b(check|condition|validate|decision)\b|검사|검증|판정|조건/i.test(node?.label ?? ''))
  )
    return 'decision';
  return 'process';
}
