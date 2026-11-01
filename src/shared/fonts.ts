export const FONT_STYLES = ['normal', 'italic'] as const;

export type FontStyle = (typeof FONT_STYLES)[number];

export interface AddedFont {
  id: string;
  family: string;
  weight: number;
  style: FontStyle;
}

export interface InstalledFont {
  family: string;
  monospaced: boolean;
}

const FONT_ID = /^[0-9a-f]{16}$/;
const FONT_FAMILY = /^[\p{L}\p{N} ._-]{1,64}$/u;

export function isFontId(value: unknown): value is string {
  return typeof value === 'string' && FONT_ID.test(value);
}

export function isFontFamily(value: unknown): value is string {
  return typeof value === 'string' && FONT_FAMILY.test(value) && value.trim() !== '';
}

export function isFontStyle(value: unknown): value is FontStyle {
  return typeof value === 'string' && (FONT_STYLES as readonly string[]).includes(value);
}

export function isFontWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;
}
