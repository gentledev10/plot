import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { usePreference } from '../../lib/preferences';
import type { CommandId } from './commands';
import {
  type Bindings,
  commandsByStroke,
  type KeymapOverrides,
  parseOverrides,
  resolveBindings,
} from './keymap';
import { formatStroke, isTypingTarget, strokeFromEvent } from './keystroke';

type Handler = () => void;

interface KeymapContextValue {
  platform: string;
  bindings: Bindings;
  overrides: KeymapOverrides;
  setOverrides(overrides: KeymapOverrides): void;
  register(id: CommandId, handler: Handler): () => void;
  suspend(): () => void;
}

const KeymapContext = createContext<KeymapContextValue | null>(null);

function useKeymapContext(): KeymapContextValue {
  const context = useContext(KeymapContext);
  if (!context) {
    throw new Error('Keymap hooks must be used inside <KeymapProvider>');
  }
  return context;
}

interface KeymapProviderProps {
  platform: string;
  children: ReactNode;
}

export function KeymapProvider({ platform, children }: KeymapProviderProps) {
  const [overrides, setOverrides] = usePreference<KeymapOverrides>('keymap', {}, parseOverrides);
  const bindings = useMemo(() => resolveBindings(overrides), [overrides]);
  const lookup = useRef(commandsByStroke(bindings));
  const handlers = useRef(new Map<CommandId, Handler[]>());
  const suspensions = useRef(0);

  useEffect(() => {
    lookup.current = commandsByStroke(bindings);
  }, [bindings]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (suspensions.current > 0 || event.isComposing || isTypingTarget(event.target)) {
        return;
      }
      const stroke = strokeFromEvent(event);
      const id = stroke === undefined ? undefined : lookup.current.get(stroke);
      const handler = id === undefined ? undefined : handlers.current.get(id)?.at(-1);
      if (!handler) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handler();
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

  const register = useCallback((id: CommandId, handler: Handler) => {
    const stack = handlers.current.get(id) ?? [];
    handlers.current.set(id, [...stack, handler]);
    return () => {
      const current = handlers.current.get(id) ?? [];
      handlers.current.set(
        id,
        current.filter((candidate) => candidate !== handler),
      );
    };
  }, []);

  const suspend = useCallback(() => {
    suspensions.current += 1;
    return () => {
      suspensions.current -= 1;
    };
  }, []);

  const value = useMemo(
    () => ({ platform, bindings, overrides, setOverrides, register, suspend }),
    [platform, bindings, overrides, setOverrides, register, suspend],
  );
  return <KeymapContext.Provider value={value}>{children}</KeymapContext.Provider>;
}

export function useCommand(id: CommandId, handler: Handler, enabled = true): void {
  const { register } = useKeymapContext();
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return register(id, () => latest.current());
  }, [register, id, enabled]);
}

export function useSuspendShortcuts(): void {
  const { suspend } = useKeymapContext();
  useEffect(() => suspend(), [suspend]);
}

export function useKeymap() {
  return useKeymapContext();
}

export function useShortcutLabel(id: CommandId): string | undefined {
  const { bindings, platform } = useKeymapContext();
  const stroke = bindings[id][0];
  return stroke === undefined ? undefined : formatStroke(stroke, platform);
}

export function withShortcut(label: string, shortcut: string | undefined): string {
  return shortcut ? `${label} (${shortcut})` : label;
}
