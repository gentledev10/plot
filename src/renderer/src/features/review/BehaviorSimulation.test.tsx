import type { CodeLocation } from '@shared/review';
import { shippingSimulation } from '@shared/simulation.fixture';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BehaviorSimulation } from './BehaviorSimulation';

vi.mock('./VectorDiagram', () => ({
  VectorDiagram: ({ label, trace }: { label: string; trace: { nodes: Set<string> } }) => (
    <div role="img" aria-label={label}>
      {[...trace.nodes].join(' → ')}
    </div>
  ),
}));

function setup(simulation = shippingSimulation()) {
  const onOpen = vi.fn();
  render(
    <BehaviorSimulation
      simulation={simulation}
      changedPaths={new Set(['src/shipping.ts'])}
      onOpenLocation={onOpen}
      link={(location: CodeLocation | undefined) =>
        location && (
          <button type="button" onClick={() => onOpen(location)}>
            {location.path}:{location.line}
          </button>
        )
      }
    />,
  );
  return { user: userEvent.setup(), onOpen };
}

describe('interactive review scenarios', () => {
  it('shows an unresolved result when a typed comparison has no modeled validation', async () => {
    const simulation = shippingSimulation();
    for (const side of ['before', 'after'] as const) {
      simulation[side].entry = 'threshold';
      simulation[side].nodes = simulation[side].nodes.filter((node) =>
        ['threshold', 'free', 'paid'].includes(node.id),
      );
    }
    const { user } = setup(simulation);
    await user.click(screen.getByText('Try inputs and error cases'));
    const amount = screen.getByRole('textbox', { name: 'Order amount' });
    await user.clear(amount);
    await user.type(amount, 'not a number');
    expect(screen.getByRole('status')).toHaveTextContent('Model could not determine a result');
    expect(screen.getByRole('status')).not.toHaveTextContent('Shipping fee (3000)');
  });
  it('keeps the review compact and updates both results and paths when inputs change', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Try inputs and error cases'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Shipping fee (3000) · After: Free shipping (0)',
    );
    const amount = screen.getByRole('textbox', { name: 'Order amount' });
    await user.clear(amount);
    await user.type(amount, '29999');
    expect(screen.getByRole('status')).toHaveTextContent('After: Shipping fee (3000)');
    expect(screen.getByRole('img', { name: 'After model' })).toHaveTextContent('threshold → paid');
    expect(screen.getByLabelText('Scenario')).toHaveValue('custom');
  });
  it('loads dependency failure and permission scenarios without pretending to run tests', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Try inputs and error cases'));
    await user.selectOptions(screen.getByLabelText('Scenario'), 'offline');
    expect(screen.getByRole('status')).toHaveTextContent('Service unavailable (503)');
    expect(screen.getByRole('img', { name: 'After model' })).not.toHaveTextContent('threshold');
    expect(screen.getByLabelText('Service available')).toHaveValue('false');
    await user.selectOptions(screen.getByLabelText('Scenario'), 'denied');
    expect(screen.getByRole('status')).toHaveTextContent('Permission denied (403)');
    expect(screen.getByText(/Repository code and tests are not executed/)).toBeVisible();
  });
  it('accepts null and wrong-type inputs and restores defaults', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Try inputs and error cases'));
    const amountField = screen.getByRole('group', { name: 'Order amount' });
    await user.click(within(amountField).getByLabelText('No value (null)'));
    expect(screen.getByRole('textbox', { name: 'Order amount' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Invalid amount (400)');
    await user.click(within(amountField).getByLabelText('No value (null)'));
    const amount = screen.getByRole('textbox', { name: 'Order amount' });
    await user.clear(amount);
    await user.type(amount, 'not a number');
    expect(within(amountField).getByText('Value type: string')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Invalid amount (400)');
    await user.selectOptions(screen.getByLabelText('Scenario'), 'default');
    expect(amount).toHaveValue('40000');
    expect(screen.getByRole('status')).toHaveTextContent('After: Free shipping (0)');
  });
  it('links only current-code trace steps and calls branch counts model exploration', async () => {
    const { user, onOpen } = setup();
    await user.click(screen.getByText('Try inputs and error cases'));
    const before = screen.getByRole('region', { name: 'Before model' });
    const after = screen.getByRole('region', { name: 'After model' });
    await user.click(within(before).getByText('Follow conditions and code'));
    expect(within(before).queryByRole('button')).not.toBeInTheDocument();
    await user.click(within(after).getByText('Follow conditions and code'));
    await user.click(
      within(after).getAllByRole('button', { name: 'src/shipping.ts:4' })[0] as HTMLElement,
    );
    expect(onOpen).toHaveBeenCalledWith({ path: 'src/shipping.ts', line: 4 });
    await user.click(screen.getByText('Model scope and unexplored branches'));
    expect(screen.getAllByText(/This is not code coverage/)).toHaveLength(2);
  });
});
