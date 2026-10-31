import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isThemeSource, type ThemeSource } from '@shared/appearance';

export async function readThemeSource(file: string): Promise<ThemeSource> {
  try {
    const { source } = JSON.parse(await readFile(file, 'utf8')) as { source?: unknown };
    return isThemeSource(source) ? source : 'system';
  } catch {
    return 'system';
  }
}

export async function writeThemeSource(file: string, source: ThemeSource): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ source }));
}
