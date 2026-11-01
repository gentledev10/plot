import type { Architecture } from '@shared/review';

export type DiagramRole =
  | 'app'
  | 'server'
  | 'build'
  | 'runtime'
  | 'environment'
  | 'database'
  | 'cache'
  | 'queue'
  | 'config'
  | 'decision'
  | 'component';
export type DiagramPalette = 'blue' | 'teal' | 'violet' | 'amber' | 'rose';

// Icons are visual cues inferred from labels, not additional claims about code.
export function diagramRole(label: string): DiagramRole {
  const text = label.toLowerCase();
  if (/database|\bdb\b|\bsql\b|데이터베이스|저장소/.test(text)) return 'database';
  if (/cache|캐시/.test(text) && !/runner|실행기/.test(text)) return 'cache';
  if (/queue|message bus|큐|대기열/.test(text)) return 'queue';
  if (/build|compiler|bundl|빌드|컴파일/.test(text)) return 'build';
  if (/runner|runtime|evaluat|실행기|런타임|평가/.test(text)) return 'runtime';
  if (/environment|환경/.test(text)) return 'environment';
  if (/server|service|http|websocket|서버|서비스/.test(text)) return 'server';
  if (/config|setting|설정/.test(text)) return 'config';
  if (
    /browser|client|caller|frontend|\bapp\b|\bcli\b|브라우저|클라이언트|호출자|프레임워크|앱/.test(
      text,
    )
  )
    return 'app';
  return 'component';
}

export function nodeRole(graph: Architecture, index: number, flow: boolean): DiagramRole {
  const node = graph.nodes[index];
  if (!node) return 'component';
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  if (
    flow &&
    outgoing.length > 1 &&
    outgoing.some((edge) =>
      /^(yes|no|true|false|hit|miss|예|아니오|있음|없음|성공|실패)(?=$|[\s:：,.;(])/i.test(
        edge.label ?? '',
      ),
    )
  )
    return 'decision';
  return diagramRole(node.label);
}

export function diagramPalette(role: DiagramRole, key = ''): DiagramPalette {
  if (role === 'server' || role === 'environment') return 'teal';
  if (role === 'runtime' || role === 'app') return 'violet';
  if (role === 'database' || role === 'queue' || role === 'decision') return 'amber';
  if (role === 'cache') return 'rose';
  if (role === 'build' || role === 'config') return 'blue';
  const choices: DiagramPalette[] = ['blue', 'teal', 'violet', 'amber', 'rose'];
  const hash = [...key].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return choices[hash % choices.length] ?? 'blue';
}

export function roundedConnection(points: { x: number; y: number }[], radius = 12): string {
  const first = points[0];
  if (!first) return '';
  let path = `M${first.x},${first.y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    if (!previous || !corner || !next) continue;
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, incoming / 2, outgoing / 2);
    if (!r) continue;
    const before = {
      x: corner.x + ((previous.x - corner.x) * r) / incoming,
      y: corner.y + ((previous.y - corner.y) * r) / incoming,
    };
    const after = {
      x: corner.x + ((next.x - corner.x) * r) / outgoing,
      y: corner.y + ((next.y - corner.y) * r) / outgoing,
    };
    path += ` L${before.x},${before.y} Q${corner.x},${corner.y} ${after.x},${after.y}`;
  }
  const last = points.at(-1);
  if (last && points.length > 1) path += ` L${last.x},${last.y}`;
  return path;
}
