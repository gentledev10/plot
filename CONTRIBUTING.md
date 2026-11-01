# Contributing

Thanks for your interest in Plot. This guide covers how to set up the project and what a good change looks like.

## Setup

You need macOS and Node.js 22 or later.

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

`npm run format` fixes formatting and import order.

## Guidelines

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. Keep privileged work (network, files, processes, secrets) in the main process, and keep the renderer limited to drawing the UI.
- Add or update tests for every behavior change. Put a test next to the file it covers, named `*.test.ts` or `*.test.tsx`.
- Keep pure logic out of files that import `electron`, so it stays testable.
- Prefer clear names over comments. Write a comment only when the code cannot explain why it is written that way.
- Keep pull requests focused on one change, and describe what reviewers should look at closely.

## Reporting security issues

Please do not open public issues for security problems. See [SECURITY.md](SECURITY.md).
