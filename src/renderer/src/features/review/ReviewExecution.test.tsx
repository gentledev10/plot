import type { ExecutionReport } from '@shared/review-execution';
import { shippingSimulation } from '@shared/simulation.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { ReviewExecution } from './ReviewExecution';

const ref = { host: 'github.com', owner: 'example', repo: 'app', number: 1 };
const head = 'a'.repeat(40);
const context = { ref, head };
describe('actual execution controls', () => {
  it('never auto-executes and sends only current scalar inputs after a click', async () => {
    const simulation = shippingSimulation();
    simulation.binding = {
      before: { path: 'shipping.mjs', exportName: 'shipping', args: [{ input: 'amount' }] },
      after: { path: 'shipping.mjs', exportName: 'shipping', args: [{ input: 'amount' }] },
    };
    const runReviewExecution = vi.fn().mockResolvedValue(undefined);
    renderWithApi(
      <ReviewExecution
        context={context}
        simulation={simulation}
        inputs={new Map([['amount', -1]])}
      />,
      {
        getReviewExecutionSupport: vi
          .fn()
          .mockResolvedValue({ available: true, nodeVersion: 'v26.3.1' }),
        getReviewExecution: vi
          .fn()
          .mockResolvedValue({ head, reports: [], task: { state: 'idle' } }),
        runReviewExecution,
      },
    );
    const button = await screen.findByRole('button', { name: 'Run actual code with these values' });
    expect(runReviewExecution).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(runReviewExecution).toHaveBeenCalledWith(ref, {
      head,
      unitId: undefined,
      kind: 'scenario',
      simulationId: 'shipping',
      inputs: [{ id: 'amount', value: -1 }],
    });
  });
  it('labels stale input results and distinguishes returned errors from thrown exceptions', async () => {
    const report: ExecutionReport = {
      id: 'result',
      head,
      base: 'b'.repeat(40),
      createdAt: new Date().toISOString(),
      nodeVersion: 'v26.3.1',
      isolation: 'macos-sandbox',
      request: {
        head,
        kind: 'scenario',
        simulationId: 'shipping',
        inputs: [{ id: 'amount', value: 40000 }],
      },
      before: {
        exitCode: 0,
        status: 'completed',
        stdout: '',
        stderr: '',
        command: ['node'],
        outcome: { kind: 'return', value: { error: 400 } },
      },
      after: {
        exitCode: 0,
        status: 'completed',
        stdout: '',
        stderr: '',
        command: ['node'],
        outcome: { kind: 'throw', value: { name: 'TypeError', message: 'bad input' } },
      },
    };
    renderWithApi(
      <ReviewExecution
        context={context}
        simulation={shippingSimulation()}
        inputs={new Map([['amount', -1]])}
      />,
      {
        getReviewExecution: vi
          .fn()
          .mockResolvedValue({ head, reports: [report], task: { state: 'done', result: report } }),
      },
    );
    expect(await screen.findByText(/Inputs changed/)).toBeInTheDocument();
    expect(screen.getByText('Function returned')).toBeInTheDocument();
    expect(screen.getByText('Function threw')).toBeInTheDocument();
  });
});
