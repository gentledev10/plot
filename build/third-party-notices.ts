import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

interface Component {
  name: string;
  version: string;
  license: string;
  repository?: string;
  notices: { name: string; text: string }[];
}

export function thirdPartyNotices(): Plugin {
  return {
    name: 'plot-third-party-notices',
    apply: 'build',
    generateBundle() {
      const roots = new Map<string, string | undefined>();
      const components = new Map<string, Component>();
      const findRoot = (file: string): string | undefined => {
        const dir = dirname(file);
        if (roots.has(dir)) return roots.get(dir);
        const manifest = join(dir, 'package.json');
        if (existsSync(manifest)) {
          const data = JSON.parse(readFileSync(manifest, 'utf8')) as {
            name?: string;
            version?: string;
          };
          if (data.name && data.version) {
            roots.set(dir, dir);
            return dir;
          }
        }
        if (dirname(dir) === dir) return undefined;
        const root = findRoot(dir);
        roots.set(dir, root);
        return root;
      };
      for (const id of this.getModuleIds()) {
        const file = id.split('?')[0] ?? '';
        if (!isAbsolute(file) || !file.includes('/node_modules/')) continue;
        const root = findRoot(file);
        if (!root || components.has(root)) continue;
        const data = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
          name: string;
          version: string;
          license?: string;
          repository?: string | { url?: string };
        };
        const notices = readdirSync(root, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isFile() &&
              /^(?:licen[sc]e|copying|notice|copyright|third.?party.*notices?)(?:[._-].*|$)/i.test(
                entry.name,
              ) &&
              !/\.[cm]?[jt]s$/i.test(entry.name),
          )
          .map(({ name }) => ({ name, text: readFileSync(join(root, name), 'utf8') }))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (notices.length === 0)
          this.error(`No license text found for bundled component ${data.name}@${data.version}`);
        const license =
          data.license ??
          (notices.some((notice) => /The MIT License/i.test(notice.text)) ? 'MIT' : 'UNKNOWN');
        if (license === 'UNKNOWN') this.error(`Review the license of ${data.name}@${data.version}`);
        const repository =
          typeof data.repository === 'string' ? data.repository : data.repository?.url;
        components.set(root, {
          name: data.name,
          version: data.version,
          license,
          repository,
          notices,
        });
      }
      const sorted = [...components.values()].sort((a, b) =>
        `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
      );
      const introduction = readFileSync(resolve('THIRD_PARTY_NOTICES.md'), 'utf8');
      const sections = sorted.map((component) => {
        const source =
          component.name === 'elkjs'
            ? `\nELK source for this version, under EPL-2.0: https://github.com/kieler/elkjs/tree/${component.version}\nObtain the repository with its submodules to include the underlying ELK sources.\n`
            : '';
        return `\n${'='.repeat(72)}\n${component.name}@${component.version}\nLicense: ${component.license}\n${component.repository ?? ''}\n${source}${component.notices.map((notice) => `\n--- ${notice.name} ---\n${notice.text}`).join('\n')}`;
      });
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_LICENSES.txt',
        source: `${introduction}\n\nBundled JavaScript components\n\nBuild adaptation: Monaco's embedded DOMPurify module is replaced with the separately listed DOMPurify package, using its Apache-2.0 license option. Original upstream notices are retained.\n${sections.join('\n')}\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-components.json',
        source: JSON.stringify(
          sorted.map(({ notices, ...component }) => ({
            ...component,
            noticeFiles: notices.map((notice) => notice.name),
          })),
          null,
          2,
        ),
      });
    },
  };
}
