# Contributing

Thanks for your interest in Plot. This guide covers how to set up the project and what a good change looks like.

## Setup

You need macOS and Node.js 22.12 or later.

```sh
git clone https://github.com/gentledev10/plot.git
cd plot
npm ci
npm run dev
```

`npm ci` installs the Electron runtime through the project's `postinstall` hook. `npm run dev` and `npm run preview` also run the same idempotent check before starting, including when dependencies were installed with `--ignore-scripts`. Use `npm run setup:electron` to install or repair the runtime explicitly. The first download needs network access; see [troubleshooting](docs/TROUBLESHOOTING.md#electron-uninstall-when-running-from-source) if it fails.

`npm run dev` prepares a macOS development runtime with the existing `electron-builder` dependency and the locally installed Electron distribution; it does not download a second Electron. It sets the Plot name/icon and a development-only bundle ID, restores Electron's source-app loader, and signs the result ad hoc without an Apple account. The internal executable remains named `Electron` so Electron still reports `app.isPackaged === false`. Plot's sources are not copied into the cached runtime, and release packaging is unchanged.

The cache key includes Electron/builder versions, architecture, the preparation script, and the `.icns` icon. Current source is built on each launch; renderer edits refresh and main/preload edits rebuild via `electron-vite --watch`. The existing `Plot` user-data location is retained, with no account/settings migration. macOS may request Keychain access again for the new development identity. To repair a damaged cache, quit development instances and remove `.dev-runtime/` before running `npm run dev` again.

The app starts without an account. Browser sign-in uses Plot's GitHub OAuth app. Only release builds carry the app's client secret, so a development build asks you to paste a one-time code on github.com instead of returning to the app by itself. A personal access token or the GitHub CLI work too.

To try the full browser sign-in, or to use your own OAuth app in a fork, [register one](https://github.com/settings/applications/new) with the redirect URI `http://127.0.0.1/callback`, enable Device Flow, and put its values in `.env.local`:

```sh
MAIN_VITE_GITHUB_CLIENT_ID=<client id>
MAIN_VITE_GITHUB_CLIENT_SECRET=<client secret>
```

Git ignores `.env.local`. Keep these values out of commits.

## Before you open a pull request

Run the same checks as CI:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run format` fixes formatting and import order. On macOS, `npm run test:e2e` checks the built Electron app with isolated fixtures and does not use live accounts or paid AI calls.

`npm run test:dev-runtime` checks the real `npm run dev` path on macOS: native app name, development mode, source path, profile preferences, renderer updates, main-process restart, cache reuse, signatures, and preservation of the original Electron bundle. Run it in a dedicated working tree: it temporarily edits and restores the main/renderer entry files. It uses an isolated profile and mock Keychain, not your real accounts; actual Keychain permission prompts are not covered. Reports go to `dist/dev-runtime-report.json` and `dist/dev-runtime-check.log`.

To run the same smoke checks against a packaged app, set `PLOT_E2E_EXECUTABLE` to its `Contents/MacOS/Plot` executable and run `node e2e/smoke.mjs`. The test supplies an isolated login-shell path so installed CLI tools cannot replace its fixtures.

The renderer build collects upstream license files from its actual module graph. A new bundled dependency without license text fails the build. Keep upstream third-party notices and any required source-access information intact. `npm audit` includes build-tool dependencies too; never use `--omit=dev` to assess the shipped app, because renderer dependencies are bundled from `devDependencies`.

### Current dependency audit

As of November 1, 2026, the renderer uses DOMPurify 3.4.17 throughout, including Monaco's embedded sanitizer replacement. The renderer's generated component inventory lists 82 packages and retains their upstream notices. ELK remains EPL-2.0 with matching source-access instructions; Plot's own code remains MIT.

The build overrides minimatch 9/10 with 11.0.3. Older build dependencies still need minimatch 3.1.5 or 5.1.9's callable API, so replacing those with 11 would break packaging. `npm audit` reports 15 moderate entries through those paths, all deriving from [GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). The upstream advisory describes `firstPhasePreProcess()` with `optimizationLevel >= 2`; neither implementation exists in the installed 3/5 sources. This is our applicability assessment, not an audit suppression or an upstream correction. The packages are used for packaging, not included in the renderer. Recheck the advisory and dependency paths when updating electron-builder; do not force incompatible majors just to clear the audit count.

## Guidelines

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. Keep privileged work (network, files, processes, secrets) in the main process, and keep the renderer limited to drawing the UI.
- Add or update tests for every behavior change. Put a test next to the file it covers, named `*.test.ts` or `*.test.tsx`.
- Keep pure logic out of files that import `electron`, so it stays testable.
- Prefer clear names over comments. Write a comment only when the code cannot explain why it is written that way.
- Keep pull requests focused on one change, and describe what reviewers should look at closely.

## Project language

Write project-authored code identifiers, comments, documentation, test names, pull request
text, and commit subjects/bodies in English. Preserve existing Git history: do not rewrite
old commits to enforce this policy.

This is not an ASCII-only rule or a restriction on application input. Preserve all Korean
localization, native language names, Korean classification vocabulary, Unicode paths and
content, internationalization tests/fixtures, and upstream license/copyright notices.
Do not globally replace Korean text or change runtime behavior to satisfy a prose check.

`npm run check:language` scans tracked and new nonignored text files for Hangul; it skips
binary files. `npm run lint` runs that audit and its regression tests before Biome, so CI
and release lint enforce the same gate. This targeted regression check is not a general
natural-language detector: reviewers must still enforce English for other authored prose.

Reviewed exceptions live in `scripts/check-language-allowlist.json`: each exact path has
an English reason and a list of original line numbers and SHA-256 hashes of complete lines
(without the newline). Line numbers locate the reviewed source; hashes allow English-only
insertions above it without breaking localization. Each entry permits only one occurrence.
There are no blanket test, translation-directory, or whole-file exclusions. Changing an
allowed line, adding a translation/support fixture, or retaining a new upstream notice
requires reviewing the exact line and updating this inventory with a specific reason.
Never allowlist an authored Korean comment or document merely to make CI pass. Run
`npm run test:language` after changing the checker or inventory. The suite checks the
real canonical catalog against its reviewed hashes, rejects both standalone and inline
Korean comments in that catalog, and rejects new unreviewed catalog values. New genuine
translations must be reviewed and added to the inventory; they are not an exemption for
other Korean prose in `src/shared/translations.ts`.

### Commit messages

The versioned `.githooks/commit-msg` hook checks the subject and body. Opt in for a normal
clone with:

```sh
git config core.hooksPath .githooks
```

That setting is shared by linked worktrees unless worktree-specific configuration is
already enabled. Do not run it automatically or change shared configuration on behalf of
other worktrees. For a single commit without changing configuration, use:

```sh
git -c core.hooksPath=.githooks commit
```

PR CI fetches complete history and runs `npm run check:commit-language -- --base BASE_SHA
--head HEAD_SHA` using the PR's base and head commits. Only commits reachable from the
head but not the base are checked; historical base commits and the synthetic CI merge
commit are not audited or rewritten. This hook is optional locally; CI is the required
commit-message gate for pull requests.

## Reporting security issues

Please do not open public issues for security problems. See [SECURITY.md](SECURITY.md).
