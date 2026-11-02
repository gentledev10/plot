import type { ReviewCodeSelection } from '@shared/review-unit';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export interface ReadingFocus {
  target: string;
  head: string;
  mode: 'unit' | 'all' | 'remaining';
  unitId?: string;
  paths?: string[];
}
interface QuestionContext {
  target: string;
  head: string;
  unitId?: string;
  selection?: ReviewCodeSelection;
}
const Context = createContext<{
  focus?: ReadingFocus;
  question?: QuestionContext;
  select(focus: ReadingFocus): void;
  ask(context: QuestionContext | undefined): void;
  reset(): void;
}>({ select: () => {}, ask: () => {}, reset: () => {} });

export function ReviewReadingProvider({ children }: { children: ReactNode }) {
  const [focus, select] = useState<ReadingFocus>();
  const [question, ask] = useState<QuestionContext>();
  const reset = useCallback(() => {
    select(undefined);
    ask(undefined);
  }, []);
  const value = useMemo(() => ({ focus, question, select, ask, reset }), [focus, question, reset]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useReviewReading = () => useContext(Context);
