import type { AiProviderId } from './ai';
import type { ErrorPayload } from './errors';

export interface CodeLocation {
  path: string;
  line: number;
  verified?: boolean;
}

export interface ReadingStep {
  path: string;
  reason: string;
}

export interface FlowStep {
  from: string;
  to: string;
  label: string;
  location?: CodeLocation;
}

export interface Flow {
  title: string;
  steps: FlowStep[];
}

export interface ArchitectureNode {
  id: string;
  label: string;
  changed: boolean;
  location?: CodeLocation;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label?: string;
}

export type RiskSeverity = 'high' | 'medium' | 'low';

export interface Risk {
  title: string;
  detail: string;
  severity: RiskSeverity;
  location?: CodeLocation;
}

export interface ReviewMap {
  summary: string;
  readingOrder: ReadingStep[];
  flows: Flow[];
  architecture: { nodes: ArchitectureNode[]; edges: ArchitectureEdge[] };
  risks: Risk[];
}

export interface StoredReview {
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
