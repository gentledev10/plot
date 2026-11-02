import type { AiProviderId } from './ai';
import type { ErrorPayload } from './errors';
import type { CodeLocation } from './review';
import type { ReviewCodeSelection } from './review-unit';

export interface ReviewTaskScope {
  head: string;
  unitId?: string;
  providedPaths: string[];
  omittedPaths: string[];
  diffTruncated: boolean;
  createdAt: string;
  provider: AiProviderId;
  model?: string;
}
export interface ReviewAnswer extends ReviewTaskScope {
  id: string;
  question: string;
  answer: string;
  selection?: ReviewCodeSelection;
  locations: CodeLocation[];
}
export interface VerificationFinding {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
  check: string;
  location?: CodeLocation;
  verdict: 'supported' | 'dismissed' | 'uncertain';
  verificationReason: string;
}
export interface ReviewVerification extends ReviewTaskScope {
  summary: string;
  findings: VerificationFinding[];
}
export type ReviewTask<T> =
  | { state: 'idle' }
  | { state: 'running'; startedAt: string; activity: string[]; unitId?: string }
  | { state: 'done'; result: T }
  | { state: 'failed'; error: ErrorPayload };
export interface ReviewActivity {
  head: string;
  questions: ReviewAnswer[];
  verifications: ReviewVerification[];
  questionTask: ReviewTask<ReviewAnswer>;
  verificationTask: ReviewTask<ReviewVerification>;
}
export interface ReviewQuestionRequest {
  head: string;
  unitId?: string;
  question: string;
  selection?: ReviewCodeSelection;
}
export interface ReviewVerificationRequest {
  head: string;
  unitId?: string;
}

export interface StoredReviewActivity {
  questions: ReviewAnswer[];
  verifications?: ReviewVerification[];
}
