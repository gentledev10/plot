# Contributing

Thanks for your interest in Plot. This guide covers how to set up the project and what a good change looks like.

## Setup

You need macOS and Node.js 22.12 or later.

```sh
git clone https://github.com/gentledev10/plot.git
cd plot
npm install
npm run dev
```

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

## Reporting security issues

Please do not open public issues for security problems. See [SECURITY.md](SECURITY.md).
