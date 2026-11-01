import type { PlotApi } from '@shared/ipc';
import {
  defaultReviewPlan,
  parseReviewPlan,
  REVIEW_PLAN_PREFERENCE,
  type ReviewPlan,
} from '@shared/review-plan';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cachePreference, readPreference } from '../../lib/preferences';

const ReviewPlanContext = createContext({
  plan: defaultReviewPlan(),
  saving: false,
  error: '',
  change: (_plan: ReviewPlan) => {},
  flush: async () => {},
});

export function ReviewPlanProvider({ api, children }: { api: PlotApi; children: ReactNode }) {
  const [plan, setPlan] = useState(() =>
    parseReviewPlan(readPreference(REVIEW_PLAN_PREFERENCE, undefined)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(plan);
  const saved = useRef(JSON.stringify(plan));
  const queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        const next = latest.current;
        const serialized = JSON.stringify(next);
        if (serialized === saved.current) {
          setError('');
          setSaving(false);
          return;
        }
        setSaving(true);
        let succeeded = false;
        try {
          await api.setPreference(REVIEW_PLAN_PREFERENCE, next);
          saved.current = serialized;
          cachePreference(REVIEW_PLAN_PREFERENCE, next);
          setError('');
          succeeded = true;
        } catch {
          setError('Could not save the review format. Retry before generating.');
          throw new Error('Could not save the review format. Retry before generating.');
        } finally {
          setSaving(succeeded && JSON.stringify(latest.current) !== saved.current);
        }
      });
    queue.current = task;
    return task;
  }, [api]);
  const change = (next: ReviewPlan) => {
    latest.current = parseReviewPlan(next);
    setPlan(latest.current);
    setSaving(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 300);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ReviewPlanContext.Provider value={{ plan, change, flush, saving, error }}>
      {children}
    </ReviewPlanContext.Provider>
  );
}

export const useReviewPlan = () => useContext(ReviewPlanContext);
