import {
  BUILTIN_STEPS,
  defaultReviewPlan,
  MAX_CUSTOM_STEPS,
  moveReviewStep,
  type ReviewDetail,
  type ReviewFormat,
  type ReviewPlan,
  type ReviewStep,
  stepTitle,
} from '@shared/review-plan';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { Select } from '../../components/Select';
import { useT } from '../language/LanguageProvider';
import styles from './ReviewFormatSettings.module.css';
import { useReviewPlan } from './ReviewPlanProvider';

const DRAG_TYPE = 'application/x-plot-review-step';

export function ReviewFormatSettings() {
  const t = useT();
  const { plan, change, flush, saving, error } = useReviewPlan();
  const [expanded, setExpanded] = useState<string>();
  const [dragged, setDragged] = useState<string>();
  const [drop, setDrop] = useState<{ id: string; after: boolean }>();
  const [announcement, setAnnouncement] = useState('');
  const [undo, setUndo] = useState<ReviewPlan>();
  useEffect(() => {
    if (expanded)
      document
        .getElementById(`edit-${expanded}`)
        ?.parentElement?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded]);
  const update = (id: string, patch: Partial<ReviewStep>) =>
    change({ steps: plan.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const title = (step: ReviewStep) => step.title.trim() || t(stepTitle(step));
  const move = (id: string, target: string, after = false) => {
    const next = moveReviewStep(plan, id, target, after);
    change(next);
    const step = next.steps.find((s) => s.id === id);
    if (step)
      setAnnouncement(
        t('{title} moved to position {position}.', {
          title: title(step),
          position: next.steps.indexOf(step) + 1,
        }),
      );
  };
  return (
    <div className={styles.settings}>
      <p className={styles.description}>
        {t(
          'One AI analysis, arranged your way. Drag cards to change the reading order, or use the arrow buttons.',
        )}
      </p>
      <p className={styles.hint}>
        {t(
          'Order, titles of built-in steps and visibility update saved reviews immediately. Instructions, detail and custom steps apply when you generate again. Hidden steps are still analyzed.',
        )}
      </p>
      <div className={styles.toolbar}>
        <span role="status">
          {error ? t(error) : saving ? t('Saving…') : t('Saved automatically')}
        </span>
        {error && (
          <button type="button" onClick={() => void flush().catch(() => {})}>
            {t('Retry')}
          </button>
        )}
        {undo && (
          <button
            type="button"
            onClick={() => {
              change(undo);
              setUndo(undefined);
            }}
          >
            {t('Undo')}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setUndo(plan);
            change(defaultReviewPlan());
            setExpanded(undefined);
          }}
        >
          {t('Restore default steps')}
        </button>
      </div>
      <ol className={styles.cards} aria-label={t('Review steps')}>
        {plan.steps.map((step, index) => {
          const open = expanded === step.id;
          const builtin = BUILTIN_STEPS.find((s) => s.id === step.kind);
          return (
            <li
              key={step.id}
              className={styles.card}
              data-step-id={step.id}
              data-visible={step.visible}
              data-drop={drop?.id === step.id ? (drop.after ? 'after' : 'before') : undefined}
              onDragOver={(event) => {
                if (
                  !dragged ||
                  dragged === step.id ||
                  !event.dataTransfer.types.includes(DRAG_TYPE)
                )
                  return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const rect = event.currentTarget.getBoundingClientRect();
                setDrop({ id: step.id, after: event.clientY > rect.top + rect.height / 2 });
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData(DRAG_TYPE);
                if (id === dragged) move(id, step.id, drop?.after ?? false);
                setDragged(undefined);
                setDrop(undefined);
              }}
            >
              <div className={styles.cardHeader}>
                <button
                  type="button"
                  className={styles.grip}
                  draggable
                  aria-label={t('Drag {title}', { title: title(step) })}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE, step.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setDragged(step.id);
                  }}
                  onDragEnd={() => {
                    setDragged(undefined);
                    setDrop(undefined);
                  }}
                >
                  <GripVertical size={16} />
                </button>
                <span className={styles.number}>{index + 1}</span>
                <button
                  type="button"
                  className={styles.expand}
                  aria-expanded={open}
                  aria-controls={`edit-${step.id}`}
                  onClick={() => setExpanded(open ? undefined : step.id)}
                >
                  <span>{title(step)}</span>
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <label className={styles.visibility}>
                  <input
                    type="checkbox"
                    checked={step.visible}
                    disabled={step.visible && plan.steps.filter((s) => s.visible).length === 1}
                    onChange={(e) => update(step.id, { visible: e.target.checked })}
                  />
                  {t('Show')}
                </label>
                <button
                  type="button"
                  className={styles.arrow}
                  disabled={index === 0}
                  aria-label={t('Move {title} up', { title: title(step) })}
                  onClick={() => {
                    const previous = plan.steps[index - 1];
                    if (previous) move(step.id, previous.id);
                  }}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className={styles.arrow}
                  disabled={index === plan.steps.length - 1}
                  aria-label={t('Move {title} down', { title: title(step) })}
                  onClick={() => {
                    const next = plan.steps[index + 1];
                    if (next) move(step.id, next.id, true);
                  }}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
              {open && (
                <div className={styles.editor} id={`edit-${step.id}`}>
                  {builtin && <p className={styles.hint}>{t(builtin.description)}</p>}
                  <div className={styles.field}>
                    <label htmlFor={`title-${step.id}`}>{t('Card title')}</label>
                    <input
                      id={`title-${step.id}`}
                      maxLength={100}
                      onBlur={() => void flush().catch(() => {})}
                      value={step.title}
                      placeholder={t(stepTitle({ ...step, title: '' }))}
                      onChange={(e) => update(step.id, { title: e.target.value })}
                    />
                  </div>
                  <div className={styles.options}>
                    <div className={styles.field}>
                      <label htmlFor={`detail-${step.id}`}>{t('Detail')}</label>
                      <Select
                        id={`detail-${step.id}`}
                        value={step.detail}
                        onChange={(e) =>
                          update(step.id, { detail: e.target.value as ReviewDetail })
                        }
                      >
                        <option value="brief">{t('Brief')}</option>
                        <option value="balanced">{t('Balanced')}</option>
                        <option value="detailed">{t('Detailed')}</option>
                      </Select>
                    </div>
                    {step.kind === 'custom' && (
                      <div className={styles.field}>
                        <label htmlFor={`format-${step.id}`}>{t('Format')}</label>
                        <Select
                          id={`format-${step.id}`}
                          value={step.format}
                          onChange={(e) =>
                            update(step.id, { format: e.target.value as ReviewFormat })
                          }
                        >
                          <option value="text">{t('Explanation')}</option>
                          <option value="checklist">{t('Checklist')}</option>
                          <option value="diagram">{t('Component diagram')}</option>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`instructions-${step.id}`}>
                      {t('Additional AI instructions')}
                    </label>
                    <textarea
                      id={`instructions-${step.id}`}
                      rows={3}
                      onBlur={() => void flush().catch(() => {})}
                      maxLength={1500}
                      value={step.instructions}
                      placeholder={t(
                        'For example: explain the tradeoffs and edge cases in plain language.',
                      )}
                      onChange={(e) => update(step.id, { instructions: e.target.value })}
                    />
                  </div>
                  {step.kind === 'custom' && (
                    <div>
                      <IconButton
                        label={t('Remove step')}
                        onClick={() => {
                          setUndo(plan);
                          change({ steps: plan.steps.filter((s) => s.id !== step.id) });
                          setExpanded(undefined);
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <button
        className={styles.add}
        type="button"
        disabled={plan.steps.filter((s) => s.kind === 'custom').length >= MAX_CUSTOM_STEPS}
        onClick={() => {
          const id = `custom_${crypto.randomUUID()}`;
          change({
            steps: [
              ...plan.steps,
              {
                id,
                kind: 'custom',
                title: t('Additional perspective'),
                visible: true,
                detail: 'balanced',
                format: 'text',
                instructions: t(
                  'Check assumptions and unanswered questions, and link them to the relevant code.',
                ),
              },
            ],
          });
          setExpanded(id);
        }}
      >
        <Plus size={15} />
        {t('Add step')}
      </button>
      <p className={styles.hint}>
        {t('Add up to {count} custom steps. Changes never start an AI analysis automatically.', {
          count: MAX_CUSTOM_STEPS,
        })}
      </p>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
