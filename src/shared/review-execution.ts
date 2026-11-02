import type { ReviewTask } from './review-activity';
import type { ScenarioValue } from './simulation';

export interface FunctionBinding {
  path: string;
  exportName: string;
  args: ({ input: string } | { value: ScenarioValue })[];
}
export interface ScenarioBinding {
  before: FunctionBinding;
  after: FunctionBinding;
}
export interface ExecutionSupport {
  available: boolean;
  nodeVersion?: string;
  reason?: string;
}
export type ExecutionRequest = { head: string; unitId?: string } & (
  | { kind: 'scenario'; simulationId: string; inputs: { id: string; value: ScenarioValue }[] }
  | { kind: 'tests'; paths: string[] }
);
export interface ExecutionSide {
  tests?: { name: string; status: 'passed' | 'failed' | 'skipped' }[];
  exitCode: number | null;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  stdout: string;
  stderr: string;
  command: string[];
  outcome?: { kind: 'return' | 'throw' | 'setup-error'; value: unknown; valueType?: 'undefined' };
}
export interface ExecutionReport {
  id: string;
  head: string;
  base: string;
  unitId?: string;
  createdAt: string;
  nodeVersion: string;
  request: ExecutionRequest;
  binding?: ScenarioBinding;
  isolation: 'macos-sandbox';
  before: ExecutionSide;
  after: ExecutionSide;
}
export interface ExecutionStatus {
  head: string;
  reports: ExecutionReport[];
  task: ReviewTask<ExecutionReport>;
}
export const NODE_TEST_PATH = /(?:^|\/)[^/]+\.(?:test|spec)\.(?:mjs|cjs|js|ts)$/;
