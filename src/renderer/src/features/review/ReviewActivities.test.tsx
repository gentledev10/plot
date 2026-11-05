import { LANGUAGE_PREFERENCE } from '@shared/language';
import { pullRequestKey } from '@shared/pull-request-ref';
import { createTranslator } from '@shared/translations';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { initializePreferences } from '../../lib/preferences';
import { ReviewActivities } from './ReviewActivities';
import { useReviewReading } from './ReviewReadingProvider';

const target = { host: 'github.com', owner: 'example', repo: 'app', number: 1 };
const head = 'a'.repeat(40);
const idle = {
  head,
  questions: [],
  verifications: [],
  questionTask: { state: 'idle' },
  verificationTask: { state: 'idle' },
};
function Harness() {
  const reading = useReviewReading();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          reading.ask({
            target: pullRequestKey(target),
            head,
            selection: { path: 'src/a.ts', side: 'original', startLine: 2, endLine: 3 },
          })
        }
      >
        Choose code
      </button>
      <ReviewActivities target={target} head={head} units={[]} onOpenLocation={() => {}} />
    </>
  );
}
describe('review questions UI', () => {
  it.each(['en', 'ko'] as const)(
    'explains the two-session review in %s without implying execution',
    async (language) => {
      initializePreferences(
        { [LANGUAGE_PREFERENCE]: { app: language, review: language } },
        () => {},
      );
      const t = createTranslator(language);
      renderWithApi(<Harness />, { getReviewActivity: vi.fn().mockResolvedValue(idle) });
      expect(screen.getByRole('heading', { name: t('AI code review') })).toBeVisible();
      const button = screen.getByRole('button', { name: t('Find possible bugs') });
      await vi.waitFor(() => expect(button).toBeEnabled());
      expect(
        screen.getByText(
          t(
            'A fresh AI session looks for possible bugs. If it finds any, a second session reviews the code evidence. No code or tests are executed, so these findings are not confirmed bugs.',
          ),
        ),
      ).toBeVisible();
    },
  );
  it('opens the question for the exact selected side and source range', async () => {
    const user = userEvent.setup();
    const askReview = vi.fn().mockResolvedValue(undefined);
    renderWithApi(<Harness />, { getReviewActivity: vi.fn().mockResolvedValue(idle), askReview });
    await user.click(screen.getByRole('button', { name: 'Choose code' }));
    await user.type(screen.getByLabelText('Your question'), 'Explain this previous branch.');
    await user.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(askReview).toHaveBeenCalledWith(target, {
      head,
      unitId: undefined,
      question: 'Explain this previous branch.',
      selection: { path: 'src/a.ts', side: 'original', startLine: 2, endLine: 3 },
    });
  });
  it('shows the question composer immediately without a disclosure toggle', async () => {
    renderWithApi(<Harness />, { getReviewActivity: vi.fn().mockResolvedValue(idle) });
    expect(screen.getByRole('heading', { name: 'Ask about this change' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your question' }).closest('details')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDisabled();
  });
  it('sends a question only after an explicit submit', async () => {
    const user = userEvent.setup();
    const askReview = vi.fn().mockResolvedValue(undefined);
    renderWithApi(<Harness />, { getReviewActivity: vi.fn().mockResolvedValue(idle), askReview });
    await user.click(screen.getByText('Ask about this change'));
    await user.type(screen.getByLabelText('Your question'), 'What happens on timeout?');
    expect(askReview).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(askReview).toHaveBeenCalledWith(target, {
      head,
      unitId: undefined,
      question: 'What happens on timeout?',
      selection: undefined,
    });
  });
  it('structures saved answers and code review explanations without interpreting HTML', async () => {
    const scope = {
      head,
      createdAt: new Date().toISOString(),
      provider: 'codex',
      providedPaths: [],
      omittedPaths: [],
      diffTruncated: false,
    };
    renderWithApi(<Harness />, {
      getReviewActivity: vi.fn().mockResolvedValue({
        ...idle,
        questions: [
          {
            ...scope,
            id: 'answer',
            question: 'What retries?',
            answer: '**Temporary failures** only.\n\n- Keep `event.id`\n- <script>unsafe</script>',
            locations: [],
          },
        ],
        verifications: [
          {
            ...scope,
            summary: 'Inspection summary.\n\n- Bound the retries',
            findings: [
              {
                id: 'finding',
                title: 'Review **boundary**',
                severity: 'medium',
                reason: 'Check the limit.\n\n- Inspect `MAX_ATTEMPTS`',
                check: '1. Read the guard\n2. Inspect exhaustion',
                verdict: 'uncertain',
                verificationReason: 'The boundary remains **uncertain**.',
              },
            ],
          },
        ],
      }),
    });
    expect((await screen.findByText('Temporary failures')).tagName).toBe('STRONG');
    expect(screen.getByText('event.id').tagName).toBe('CODE');
    expect(screen.getByText('MAX_ATTEMPTS').closest('li')).not.toBeNull();
    expect(screen.getByText('Read the guard').closest('ol')).not.toBeNull();
    expect(screen.getByText('uncertain').tagName).toBe('STRONG');
    expect(document.querySelector('script')).toBeNull();
  });
  it('keeps independent AI support distinct from executed tests', async () => {
    const report = {
      head,
      createdAt: new Date().toISOString(),
      provider: 'codex',
      providedPaths: ['src/a.ts'],
      omittedPaths: ['other.ts'],
      diffTruncated: true,
      summary: 'A scoped check.',
      findings: [
        {
          id: 'f',
          title: 'Possible failure',
          severity: 'medium',
          reason: 'Inspect this.',
          check: 'Read the guard.',
          verdict: 'supported',
          verificationReason: 'The second pass found the same path.',
        },
      ],
    };
    renderWithApi(
      <ReviewActivities target={target} head={head} units={[]} onOpenLocation={() => {}} />,
      { getReviewActivity: vi.fn().mockResolvedValue({ ...idle, verifications: [report] }) },
    );
    expect(await screen.findByText(/Code evidence found in the second AI review/)).toBeVisible();
    expect(
      screen.getByText(/No code or tests are executed, so these findings are not confirmed bugs/),
    ).toBeVisible();
  });
});
