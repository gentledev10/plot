import type { AiProviderId } from './ai';
import type { ErrorPayload } from './errors';
import type { Language } from './language';
import type { ReviewUnit } from './review-unit';
import type { ReviewSimulation } from './simulation';

export interface CodeLocation {
  path: string;
  line: number;
  verified?: boolean;
}

export interface KeyChange {
  title: string;
  before: string;
  after: string;
  location?: CodeLocation;
}

export interface FlowStep {
  from: string;
  to: string;
  label: string;
  location?: CodeLocation;
}

export interface Flow {
  title: string;
  before: FlowStep[];
  after: FlowStep[];
}

export type ChangeStatus = 'added' | 'changed' | 'removed' | 'unchanged';

export interface ArchitectureNode {
  id: string;
  label: string;
  status: ChangeStatus;
  group?: string;
  evidence?: 'code' | 'docs' | 'inferred';
  location?: CodeLocation;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label?: string;
  evidence?: 'code' | 'docs' | 'inferred';
}

export interface Impact {
  area: string;
  detail: string;
  location?: CodeLocation;
}

export interface ReviewPoint {
  title: string;
  reason: string;
  check: string;
  evidence: 'code' | 'description' | 'inferred';
  location?: CodeLocation;
}

export interface ReadingStep {
  path: string;
  reason: string;
}

export interface Architecture {
  grouping?: 'source-files';
  groups?: { id: string; label: string }[];
  summary?: string;
  scope?: string;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

export type ReviewDiagramKind = 'components' | 'flowchart' | 'sequence';
export interface ReviewVisual {
  kind: ReviewDiagramKind;
  title: string;
  takeaway: string;
  scope: string;
  before?: Architecture;
  after?: Architecture;
}
export interface ReviewDiagram extends Architecture {
  kind?: ReviewDiagramKind;
}

export interface CustomReviewSection {
  id: string;
  body: string;
  items: Impact[];
  diagram?: ReviewDiagram;
}

export interface ReviewMap {
  units?: ReviewUnit[];
  summary: string;
  changes: KeyChange[];
  flows: Flow[];
  architecture: Architecture;
  visuals?: ReviewVisual[];
  simulations?: ReviewSimulation[];
  impacts: Impact[];
  reviewPoints?: ReviewPoint[];
  readingOrder: ReadingStep[];
  customSections?: CustomReviewSection[];
}

export interface StoredReview {
  planKey?: string;
  language?: Language;
  review: ReviewMap;
  head: string;
  createdAt: string;
  provider?: AiProviderId;
  model?: string;
  costUsd?: number;
}

export type ReviewStatus =
  | { state: 'idle' }
  | { state: 'running'; startedAt: string; activity: string[] }
  | ({ state: 'done' } & StoredReview)
  | { state: 'failed'; error: ErrorPayload };
