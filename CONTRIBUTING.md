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

The app starts without an account. Connect one with a personal access token or the GitHub CLI. Browser sign-in also needs a GitHub OAuth app: [create one](https://github.com/settings/applications/new) with any callback URL, enable Device Flow, and put its client ID in `.env.local` as `MAIN_VITE_GITHUB_CLIENT_ID=<client id>`. The client ID is not a secret, but keep your own out of commits.

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
