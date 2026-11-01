import type { Language } from '@shared/language';
import type { Architecture } from '@shared/review';

// Keep a usable map when an agent supplies nodes but omits architectural boundaries.
// Source files provide explicit boundaries without inventing layers or services.
export function ensureArchitectureGroups(map: Architecture, language: Language): Architecture {
  if (
    map.nodes.length === 0 ||
    map.groups?.some((group) => map.nodes.some((node) => node.group === group.id))
  )
    return map;
  const groups = new Map<string, { id: string; label: string }>();
  const nodes = map.nodes.map((node) => {
    const path = node.location?.path;
    const key = path ?? '';
    let group = groups.get(key);
    if (!group) {
      group = {
        id: `source-${groups.size}`,
        label: path ?? (language === 'ko' ? '주변 맥락' : 'Surrounding context'),
      };
      groups.set(key, group);
    }
    return { ...node, group: group.id };
  });
  return { ...map, groups: [...groups.values()], nodes, grouping: 'source-files' };
}
