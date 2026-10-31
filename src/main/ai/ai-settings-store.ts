import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type AiSettings, DEFAULT_AI_SETTINGS, parseAiSettings } from '@shared/ai';

export interface AiSettingsStore {
  read(): Promise<AiSettings>;
  write(settings: AiSettings): Promise<void>;
}

export function createAiSettingsStore(file: string): AiSettingsStore {
  return {
    async read() {
      try {
        return parseAiSettings(JSON.parse(await readFile(file, 'utf8'))) ?? DEFAULT_AI_SETTINGS;
      } catch {
        return DEFAULT_AI_SETTINGS;
      }
    },

    async write(settings) {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(settings, null, 2));
      await rename(temporary, file);
    },
  };
}
