import {
  Cpu,
  Database,
  GitBranch,
  Layers3,
  ListOrdered,
  Monitor,
  Package,
  Server,
  SlidersHorizontal,
} from 'lucide-react';
import type { DiagramRole } from './diagram-design';

const icons = {
  app: Monitor,
  server: Server,
  build: Package,
  runtime: Cpu,
  environment: Layers3,
  database: Database,
  cache: Layers3,
  queue: ListOrdered,
  config: SlidersHorizontal,
  decision: GitBranch,
};

export function DiagramGlyph({
  role,
  x,
  y,
  size = 24,
}: {
  role: DiagramRole;
  x: number;
  y: number;
  size?: number;
}) {
  if (role === 'component') return null;
  const Icon = icons[role];
  return <Icon aria-hidden="true" x={x} y={y} width={size} height={size} strokeWidth={1.7} />;
}
