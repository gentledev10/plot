import type { Architecture, ArchitectureEdge, ArchitectureNode } from '@shared/review';

// Keep the original graph intact. This is a second view of its existing areas,
// not another AI analysis or a new set of architectural claims.
export function architectureOverview(architecture: Architecture): Architecture | undefined {
  if (architecture.nodes.length < 8 || architecture.grouping === 'source-files') return;
  const groups = (architecture.groups ?? []).filter((group) =>
    architecture.nodes.some((node) => node.group === group.id),
  );
  if (groups.length < 2) return;
  const ids = new Map<string, string>();
  const nodes: ArchitectureNode[] = groups.map((group, index) => {
    const members = architecture.nodes.filter((node) => node.group === group.id);
    const id = `area-${index}`;
    for (const node of members) ids.set(node.id, id);
    const firstStatus = members[0]?.status ?? 'unchanged';
    const status = members.every((node) => node.status === firstStatus)
      ? firstStatus
      : members.some((node) => node.status !== 'unchanged')
        ? 'changed'
        : 'unchanged';
    return {
      id,
      label: group.label,
      status,
      ...(members.some((node) => node.evidence === 'inferred')
        ? { evidence: 'inferred' as const }
        : {}),
    };
  });
  for (const [index, node] of architecture.nodes.entries()) {
    if (ids.has(node.id)) continue;
    const id = `component-${index}`;
    ids.set(node.id, id);
    nodes.push({ ...node, id, group: undefined });
  }
  if (nodes.length > architecture.nodes.length * 0.7) return;
  const connections = new Map<string, ArchitectureEdge>();
  for (const edge of architecture.edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (!from || !to || from === to) continue;
    const key = `${from}\0${to}`;
    const previous = connections.get(key);
    // A grouped link remains uncertain if any of its constituent links is.
    const evidence =
      !edge.evidence || edge.evidence === 'inferred' || previous?.evidence === 'inferred'
        ? 'inferred'
        : edge.evidence === 'docs' || previous?.evidence === 'docs'
          ? 'docs'
          : 'code';
    connections.set(key, { from, to, evidence });
  }
  return { nodes, edges: [...connections.values()] };
}
