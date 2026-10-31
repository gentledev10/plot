export type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
>;

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

type Modifier = (typeof MODIFIERS)[number];

const MODIFIER_FLAGS = {
  Ctrl: 'ctrlKey',
  Alt: 'altKey',
  Shift: 'shiftKey',
  Meta: 'metaKey',
} as const satisfies Record<Modifier, keyof KeyEventLike>;

const PUNCTUATION: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

const PUNCTUATION_KEYS = new Set(Object.values(PUNCTUATION));

const NAMED_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Escape',
  'Tab',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Space',
]);

const FUNCTION_KEY = /^F([1-9]|1[0-9]|20)$/;

function isKeyName(key: string): boolean {
  return (
    /^[A-Z0-9]$/.test(key) ||
    PUNCTUATION_KEYS.has(key) ||
    FUNCTION_KEY.test(key) ||
    NAMED_KEYS.has(key)
  );
}

// Letters, digits, and punctuation are read from the physical key, so shortcuts keep working
// while an input method such as Korean is active, or when Option turns a letter into a symbol.
function keyName({ key, code }: Pick<KeyEventLike, 'key' | 'code'>): string | undefined {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  const punctuation = PUNCTUATION[code];
  if (punctuation) {
    return punctuation;
  }
  if (key === ' ') {
    return 'Space';
  }
  if (/^[a-z]$/i.test(key)) {
    return key.toUpperCase();
  }
  return isKeyName(key) ? key : undefined;
}

export function strokeFromEvent(event: KeyEventLike): string | undefined {
  const key = keyName(event);
  if (!key) {
    return undefined;
  }
  const modifiers = MODIFIERS.filter((modifier) => event[MODIFIER_FLAGS[modifier]]);
  return [...modifiers, key].join('+');
}

export function normalizeStroke(text: string): string | undefined {
  const parts = text.split('+');
  const key = parts.pop();
  if (key === undefined || !isKeyName(key)) {
    return undefined;
  }
  const modifiers = new Set(parts);
  if (
    modifiers.size !== parts.length ||
    parts.some((part) => !(MODIFIERS as readonly string[]).includes(part))
  ) {
    return undefined;
  }
  return [...MODIFIERS.filter((modifier) => modifiers.has(modifier)), key].join('+');
}

const MAC_MODIFIERS: Record<Modifier, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };

const MAC_KEYS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '↩',
  Escape: '⎋',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
  PageUp: '⇞',
  PageDown: '⇟',
  Home: '↖',
  End: '↘',
};

const OTHER_MODIFIERS: Record<Modifier, string> = {
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'Super',
};

const OTHER_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

export function formatStroke(stroke: string, platform: string): string {
  const parts = stroke.split('+');
  const key = parts.pop() ?? '';
  const modifiers = parts as Modifier[];
  if (platform === 'darwin') {
    return modifiers.map((modifier) => MAC_MODIFIERS[modifier]).join('') + (MAC_KEYS[key] ?? key);
  }
  return [...modifiers.map((modifier) => OTHER_MODIFIERS[modifier]), OTHER_KEYS[key] ?? key].join(
    '+',
  );
}

const RESERVED: Record<string, string> = {
  'Meta+Q': 'quits the app',
  'Meta+W': 'closes the window',
  'Meta+H': 'hides the app',
  'Alt+Meta+H': 'hides other apps',
  'Meta+M': 'minimizes the window',
  'Meta+,': 'opens settings',
  'Meta+C': 'copies',
  'Meta+X': 'cuts',
  'Meta+V': 'pastes',
  'Alt+Shift+Meta+V': 'pastes and matches the style',
  'Meta+A': 'selects all',
  'Meta+Z': 'undoes',
  'Shift+Meta+Z': 'redoes',
  'Meta+F': 'finds in the file',
  'Meta+G': 'finds the next match',
  'Shift+Meta+G': 'finds the previous match',
  'Meta+0': 'resets the zoom',
  'Meta+=': 'zooms in',
  'Meta+-': 'zooms out',
  'Ctrl+Meta+F': 'enters full screen',
  'Meta+Tab': 'switches apps',
  'Meta+Space': 'opens Spotlight',
  'Ctrl+Space': 'switches the input source',
};

export type StrokeProblem = { kind: 'reserved'; use: string } | { kind: 'needs-modifier' };

export function strokeProblem(stroke: string): StrokeProblem | undefined {
  const use = RESERVED[stroke];
  if (use) {
    return { kind: 'reserved', use };
  }
  const parts = stroke.split('+');
  const key = parts.at(-1) ?? '';
  const hasCommandModifier = parts.some(
    (part) => part === 'Ctrl' || part === 'Alt' || part === 'Meta',
  );
  return hasCommandModifier || FUNCTION_KEY.test(key) ? undefined : { kind: 'needs-modifier' };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const editable =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable === true;
  return editable && target.closest('.monaco-editor') === null;
}
