import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface PreferencesStore {
  all(): Promise<Record<string, unknown>>;
  set(key: string, value: unknown): Promise<void>;
}

export function createPreferencesStore(file: string): PreferencesStore {
  let loading: Promise<Record<string, unknown>> | undefined;
  let saving: Promise<void> = Promise.resolve();
  let dirty = false;

  function load(): Promise<Record<string, unknown>> {
    loading ??= readFile(file, 'utf8')
      .then(
        (text) => {
          const parsed: unknown = JSON.parse(text);
          return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
        },
        () => ({}),
      )
      .catch(() => ({}));
    return loading;
  }

  async function save(): Promise<void> {
    dirty = false;
    const values = await load();
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(values, null, 2));
    await rename(temporary, file);
  }

  return {
    async all() {
      return { ...(await load()) };
    },

    async set(key, value) {
      const current = await load();
      current[key] = value;
      if (!dirty) {
        dirty = true;
        saving = saving.then(save, save);
      }
      await saving;
    },
  };
}
