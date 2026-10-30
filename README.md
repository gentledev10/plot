# Viewer

A lightweight desktop app for reviewing GitHub pull requests, made for developers who are used to IntelliJ's diff viewer.

> Status: early development. Not usable yet.

## Goals

- Open the pull requests waiting for your review in one click.
- Read diffs with IntelliJ-style colors and keyboard navigation (F7, Shift+F7).
- Get an AI review map: a summary, a reading order, and flow diagrams that link back to the code.

## Development

Requirements: macOS, Node.js 22 or later, and the GitHub CLI (`gh`) signed in.

```sh
npm install
npm run dev
```

| Script              | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `npm run typecheck` | Type-check the main, preload, and renderer code |
| `npm run lint`      | Lint and check formatting with Biome            |
| `npm test`          | Run unit tests with Vitest                      |
| `npm run dist:mac`  | Build a macOS app into `dist/`                  |

## License

Not decided yet.
