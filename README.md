# Viewer

A lightweight desktop app for reviewing GitHub pull requests, made for developers who are used to IntelliJ's diff viewer.

> Status: early development. The pull request inbox and the diff view work. AI review maps are next.

## Why

Many developers now open a full IDE only to read diffs, often of code an AI wrote. Viewer does just that part, and opens fast:

- **Pull requests in one click.** See the pull requests waiting for your review, or paste any pull request URL.
- **IntelliJ's diff, outside IntelliJ.** Side-by-side diffs with IntelliJ's colors, collapsed unchanged fragments, and the same keyboard shortcuts.
- **Fast on large repositories.** Viewer fetches only the two commits a pull request compares, not the whole repository.

## Keyboard shortcuts

| Action                         | Shortcut                       |
| ------------------------------ | ------------------------------ |
| Next / previous difference     | F7 / Shift+F7                  |
| Next / previous file           | Ctrl+Shift+→ / Ctrl+Shift+←    |
| Move in the changed files tree | ↑ ↓, ← → to collapse or expand |
| Find in file                   | ⌘F                             |
| Expand selection               | ⌥↑                             |

At the last difference of a file, press F7 again to open the next file, as in IntelliJ.

## Requirements

- macOS
- [GitHub CLI](https://cli.github.com), signed in with `gh auth login`. Viewer uses its login, so there is nothing else to set up.
- Git

## Development

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

| Script              | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `npm run typecheck` | Type-check the main, preload, and renderer code |
| `npm run lint`      | Lint and check formatting with Biome            |
| `npm test`          | Run unit and component tests with Vitest        |
| `npm run dist:mac`  | Build a macOS app into `dist/`                  |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and guidelines, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the app is structured. Report security issues as described in [SECURITY.md](SECURITY.md).

## License

Not decided yet.
