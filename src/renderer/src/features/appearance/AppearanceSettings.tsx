import { RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { Select } from '../../components/Select';
import { useT } from '../language/LanguageProvider';
import { AppearancePreview } from './AppearancePreview';
import { useAppearance } from './AppearanceProvider';
import styles from './AppearanceSettings.module.css';
import {
  type Appearance,
  type CodeFont,
  CUSTOM_COLORS,
  type CustomColor,
  clampFontSize,
  DEFAULT_APPEARANCE,
  FONT_SIZE,
  type ThemeChoice,
} from './appearance';
import { BUNDLED_FONTS } from './bundled-fonts';
import { useAddedFonts, useAddFonts, useInstalledFonts, useRemoveAddedFont } from './queries';
import { THEMES, type Theme } from './themes';

const CHOICES: readonly {
  id: ThemeChoice;
  name: string;
}[] = [
  {
    id: 'system',
    name: 'System',
  },
  ...THEMES.map(({ id, name }) => ({
    id,
    name,
  })),
];
export function AppearanceSettings() {
  const t = useT();
  const { appearance, setAppearance, theme, colors } = useAppearance();
  const groupName = useId();
  const [highlight, setHighlight] = useState<CustomColor>();
  const overrides = appearance.colors[theme.id] ?? {};
  function update(changes: Partial<Appearance>) {
    setAppearance({
      ...appearance,
      ...changes,
    });
  }
  function setColor(id: CustomColor, value: string | undefined) {
    const next = {
      ...overrides,
    };
    if (value === undefined) {
      delete next[id];
    } else {
      next[id] = value.toLowerCase();
    }
    update({
      colors: {
        ...appearance.colors,
        [theme.id]: next,
      },
    });
  }
  return (
    <div className={styles.appearance}>
      <AppearancePreview theme={theme} font={appearance.codeFont} highlight={highlight} />
      <fieldset className={styles.section}>
        <legend className={styles.legend}>{t('Theme')}</legend>
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
                  onChange={() =>
                    update({
                      theme: choice.id,
                    })
                  }
                />
                {t(choice.name)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className={styles.section} aria-labelledby="appearance-font">
        <h4 id="appearance-font" className={styles.legend}>
          {t('Code font')}
        </h4>
        <FontFields
          family={appearance.codeFont.family}
          size={appearance.codeFont.size}
          onChange={(codeFont) =>
            update({
              codeFont,
            })
          }
        />
      </section>

      <section className={styles.section} aria-labelledby="appearance-colors">
        <div className={styles.colorsHeader}>
          <h4 id="appearance-colors" className={styles.legend}>
            {t('Colors for ')}
            {t(theme.name)}
          </h4>
          <button
            type="button"
            className={styles.secondary}
            disabled={Object.keys(overrides).length === 0}
            onClick={() =>
              update({
                colors: {
                  ...appearance.colors,
                  [theme.id]: {},
                },
              })
            }
          >
            {t('Reset colors')}
          </button>
        </div>
        <p className={styles.hint}>
          {t('Each theme keeps its own colors.')}
          {appearance.theme === 'system' && t(' These apply while macOS uses this appearance.')}
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
                aria-label={t(label)}
                value={colors[id]}
                onChange={(event) => setColor(id, event.target.value)}
              />
              <span className={styles.colorLabel}>{t(label)}</span>
              <code className={styles.hex}>{colors[id]}</code>
              {overrides[id] && (
                <IconButton
                  label={t('Reset {value0}', {
                    value0: label,
                  })}
                  onClick={() => setColor(id, undefined)}
                >
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
          style={{
            background: theme.ui['color-bg-editor'],
          }}
        >
          <span
            style={{
              background: theme.ui['color-bg-panel'],
            }}
          />
          <span
            style={{
              background: theme.ui['diff-inserted-line'],
            }}
          />
          <span
            style={{
              background: theme.ui['diff-modified-line'],
            }}
          />
          <span
            style={{
              background: theme.ui['color-accent'],
            }}
          />
        </span>
      ))}
    </span>
  );
}
interface FontFieldsProps {
  family: string;
  size: number;
  onChange(font: CodeFont): void;
}
function FontFields({ family, size, onChange }: FontFieldsProps) {
  const t = useT();
  const filterHintId = useId();
  const fontId = useId();
  const installed = useInstalledFonts();
  const added = useAddedFonts();
  const addFonts = useAddFonts();
  const removeFont = useRemoveAddedFont();
  const [monospacedOnly, setMonospacedOnly] = useState(true);
  const addedFamilies = [...new Set((added.data ?? []).map((font) => font.family))].sort();
  const others = (installed.data ?? []).filter(
    (font) =>
      !BUNDLED_FONTS.includes(font.family) &&
      !addedFamilies.includes(font.family) &&
      (font.monospaced || !monospacedOnly || font.family === family),
  );
  const listed = [...BUNDLED_FONTS, ...addedFamilies, ...others.map((font) => font.family)];
  const missing = installed.isSuccess && added.isSuccess && !listed.includes(family);
  const error = addFonts.error ?? removeFont.error;
  function chooseFamily(next: string) {
    onChange({
      family: next,
      size,
    });
  }
  return (
    <div className={styles.font}>
      <div className={styles.fontRow}>
        <label className={styles.field} htmlFor={fontId}>
          <span>{t('Font')}</span>
          <Select
            id={fontId}
            className={styles.select}
            value={family}
            onChange={(event) => chooseFamily(event.target.value)}
          >
            <optgroup label={t('Included with Plot')}>
              {BUNDLED_FONTS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
            {addedFamilies.length > 0 && (
              <optgroup label={t('Added to Plot')}>
                {addedFamilies.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label={t('Installed on this Mac')}>
                {others.map((font) => (
                  <option key={font.family} value={font.family}>
                    {font.family}
                  </option>
                ))}
              </optgroup>
            )}
            {!listed.includes(family) && (
              <option value={family}>
                {missing
                  ? t('{value0} (not installed)', {
                      value0: family,
                    })
                  : family}
              </option>
            )}
          </Select>
        </label>
        <label className={styles.field}>
          <span>{t('Size')}</span>
          <input
            className={styles.sizeInput}
            type="number"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            value={size}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next > 0) {
                onChange({
                  family,
                  size: clampFontSize(next),
                });
              }
            }}
          />
        </label>
      </div>
      <div className={styles.fontActions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={addFonts.isPending}
          onClick={() =>
            addFonts.mutate(undefined, {
              onSuccess: ([first]) => first && chooseFamily(first.family),
            })
          }
        >
          {t('Add font files…')}
        </button>
        {addedFamilies.includes(family) && (
          <button
            type="button"
            className={styles.secondary}
            disabled={removeFont.isPending}
            onClick={() =>
              removeFont.mutate(family, {
                onSuccess: () => chooseFamily(DEFAULT_APPEARANCE.codeFont.family),
              })
            }
          >
            {t('Remove from Plot')}
          </button>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            aria-describedby={filterHintId}
            checked={monospacedOnly}
            onChange={(event) => setMonospacedOnly(event.target.checked)}
          />
          {t('Only fixed-width system fonts')}
        </label>
      </div>
      <p id={filterHintId} className={styles.hint}>
        {t(
          'Fixed-width (monospaced) fonts give every character the same space, keeping code columns aligned. This filters fonts installed on your Mac.',
        )}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {t(error.message)}
        </p>
      )}
      <p className={styles.hint}>
        {missing
          ? t('{value0} is not installed on this Mac, so code is shown in {value1}.', {
              value0: family,
              value1: DEFAULT_APPEARANCE.codeFont.family,
            })
          : t(
              'Plot comes with the fonts under Included with Plot. To use another font, install it on this Mac or add its .ttf or .otf files.',
            )}
      </p>
    </div>
  );
}
