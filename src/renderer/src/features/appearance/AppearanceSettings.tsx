import { RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { AppearancePreview } from './AppearancePreview';
import { useAppearance } from './AppearanceProvider';
import styles from './AppearanceSettings.module.css';
import {
  type Appearance,
  CUSTOM_COLORS,
  type CustomColor,
  clampFontSize,
  FONT_SIZE,
  isFontFamily,
  type ThemeChoice,
} from './appearance';
import { THEMES, type Theme } from './themes';

const SUGGESTED_FONTS = [
  'JetBrains Mono',
  'SF Mono',
  'Menlo',
  'Monaco',
  'D2Coding',
  'Fira Code',
  'Cascadia Code',
  'Source Code Pro',
];

const CHOICES: readonly { id: ThemeChoice; name: string }[] = [
  { id: 'system', name: 'System' },
  ...THEMES.map(({ id, name }) => ({ id, name })),
];

export function AppearanceSettings() {
  const { appearance, setAppearance, theme, colors } = useAppearance();
  const groupName = useId();
  const [highlight, setHighlight] = useState<CustomColor>();
  const overrides = appearance.colors[theme.id] ?? {};

  function update(changes: Partial<Appearance>) {
    setAppearance({ ...appearance, ...changes });
  }

  function setColor(id: CustomColor, value: string | undefined) {
    const next = { ...overrides };
    if (value === undefined) {
      delete next[id];
    } else {
      next[id] = value.toLowerCase();
    }
    update({ colors: { ...appearance.colors, [theme.id]: next } });
  }

  return (
    <div className={styles.appearance}>
      <AppearancePreview theme={theme} font={appearance.codeFont} highlight={highlight} />
      <fieldset className={styles.section}>
        <legend className={styles.legend}>Theme</legend>
        <div className={styles.themes}>
          {CHOICES.map((choice) => (
            <label key={choice.id} className={styles.theme}>
              <ThemeSwatch
                themes={
                  choice.id === 'system'
                    ? THEMES.filter((candidate) => candidate.id !== 'darcula')
                    : THEMES.filter((candidate) => candidate.id === choice.id)
                }
              />
              <span className={styles.themeName}>
                <input
                  type="radio"
                  name={groupName}
                  checked={appearance.theme === choice.id}
                  onChange={() => update({ theme: choice.id })}
                />
                {choice.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className={styles.section} aria-labelledby="appearance-font">
        <h4 id="appearance-font" className={styles.legend}>
          Code font
        </h4>
        <FontFields
          family={appearance.codeFont.family}
          size={appearance.codeFont.size}
          onChange={(codeFont) => update({ codeFont })}
        />
      </section>

      <section className={styles.section} aria-labelledby="appearance-colors">
        <div className={styles.colorsHeader}>
          <h4 id="appearance-colors" className={styles.legend}>
            Colors for {theme.name}
          </h4>
          <button
            type="button"
            className={styles.secondary}
            disabled={Object.keys(overrides).length === 0}
            onClick={() => update({ colors: { ...appearance.colors, [theme.id]: {} } })}
          >
            Reset colors
          </button>
        </div>
        <p className={styles.hint}>
          Each theme keeps its own colors.
          {appearance.theme === 'system' && ' These apply while macOS uses this appearance.'}
        </p>
        <ul className={styles.colors}>
          {CUSTOM_COLORS.map(({ id, label }) => (
            <li
              key={id}
              className={styles.color}
              onMouseEnter={() => setHighlight(id)}
              onMouseLeave={() => setHighlight(undefined)}
              onFocus={() => setHighlight(id)}
              onBlur={() => setHighlight(undefined)}
            >
              <input
                type="color"
                className={styles.picker}
                aria-label={label}
                value={colors[id]}
                onChange={(event) => setColor(id, event.target.value)}
              />
              <span className={styles.colorLabel}>{label}</span>
              <code className={styles.hex}>{colors[id]}</code>
              {overrides[id] && (
                <IconButton label={`Reset ${label}`} onClick={() => setColor(id, undefined)}>
                  <RotateCcw size={13} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ThemeSwatch({ themes }: { themes: Theme[] }) {
  return (
    <span className={styles.swatch} aria-hidden="true">
      {themes.map((theme) => (
        <span
          key={theme.id}
          className={styles.swatchHalf}
          style={{ background: theme.ui['color-bg-editor'] }}
        >
          <span style={{ background: theme.ui['color-bg-panel'] }} />
          <span style={{ background: theme.ui['diff-inserted-line'] }} />
          <span style={{ background: theme.ui['diff-modified-line'] }} />
          <span style={{ background: theme.ui['color-accent'] }} />
        </span>
      ))}
    </span>
  );
}

interface FontFieldsProps {
  family: string;
  size: number;
  onChange(font: { family: string; size: number }): void;
}

function FontFields({ family, size, onChange }: FontFieldsProps) {
  const [draft, setDraft] = useState(family);
  const listId = useId();
  const invalid = !isFontFamily(draft);

  function saveFamily() {
    if (!invalid && draft.trim() !== family) {
      onChange({ family: draft.trim(), size });
    }
  }

  return (
    <div className={styles.font}>
      <div className={styles.fontRow}>
        <label className={styles.field}>
          <span>Font</span>
          <input
            className={styles.input}
            list={listId}
            spellCheck={false}
            value={draft}
            aria-invalid={invalid}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                saveFamily();
              }
            }}
            onBlur={saveFamily}
          />
          <datalist id={listId}>
            {SUGGESTED_FONTS.map((font) => (
              <option key={font} value={font} />
            ))}
          </datalist>
        </label>
        <label className={styles.field}>
          <span>Size</span>
          <input
            className={styles.sizeInput}
            type="number"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            value={size}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next > 0) {
                onChange({ family, size: clampFontSize(next) });
              }
            }}
          />
        </label>
      </div>
      {invalid && (
        <p className={styles.error} role="alert">
          Use a font name made of letters, digits, spaces, dots, dashes, or underscores.
        </p>
      )}
      <p className={styles.hint}>
        Fonts that are not installed fall back to JetBrains Mono, which comes with Plot.
      </p>
    </div>
  );
}
