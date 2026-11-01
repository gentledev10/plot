import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/, 'Use a stable three-part package version.');
const dist = join(root, 'dist');
const hashes = {};
const sums = [];
for (const arch of ['arm64', 'x64']) {
  for (const ext of ['dmg', 'zip']) {
    const name = `Plot-${version}-${arch}.${ext}`;
    const bytes = await readFile(join(dist, name));
    assert.ok(bytes.length > 1_000_000, `${name} is unexpectedly small.`);
    const sha = createHash('sha256').update(bytes).digest('hex');
    sums.push(`${sha}  ${name}`);
    if (ext === 'dmg') hashes[arch] = sha;
  }
}
const cask = `cask "plot" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm:   "${hashes.arm64}",
         intel: "${hashes.x64}"

  url "https://github.com/gentledev10/plot/releases/download/v#{version}/Plot-#{version}-#{arch}.dmg"
  name "Plot"
  desc "Understand pull requests and local code changes"
  homepage "https://github.com/gentledev10/plot"

  depends_on macos: :ventura

  app "Plot.app"

  zap trash: [
    "~/Library/Application Support/Plot",
    "~/Library/Preferences/io.github.gentledev10.plot.plist",
    "~/Library/Saved Application State/io.github.gentledev10.plot.savedState",
  ]
end
`;
await mkdir(join(dist, 'homebrew', 'Casks'), { recursive: true });
await writeFile(join(dist, 'homebrew', 'Casks', 'plot.rb'), cask);
await writeFile(join(dist, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
console.log(
  `Prepared checksums and Homebrew cask for v${version}. This does not publish a release.`,
);
