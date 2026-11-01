# Plot

**The story behind every change.**

Plot is a lightweight Mac app for reading code changes, made for developers who are used to IntelliJ's diff viewer. It opens GitHub pull requests and the work in your local repositories, and for pull requests an AI overview explains what the change does, why, and how the code flows differently from before.

> Status: early development. Expect rough edges, and please report them.

## Why

Many developers now open a full IDE only to read diffs, often of code an AI wrote. Plot does just that part, and opens fast:

- **Pull requests in one click.** See the pull requests waiting for your review, or paste any pull request URL.
- **IntelliJ's diff, outside IntelliJ.** Side-by-side diffs with IntelliJ's colors, collapsed unchanged fragments, and the same keyboard shortcuts.
- **Understand a change before you read it.** An AI overview explains what the pull request changes, compares how the code flowed before and after in sequence diagrams, draws the components around it, and lists what else it affects. Every item links to the line it is about. Bring your own Claude Code or Codex CLI.
- **Your own work, too.** Open a local repository to see everything on your branch, including work you have not committed, with the same diff and shortcuts. It refreshes as files change, which suits checking code an AI agent just wrote.
- **Fast on large repositories.** Plot fetches only the two commits a pull request compares, not the whole repository.

## AI overviews and your code

Overviews are made by an AI coding tool on your Mac, with your own account: [Claude Code](https://claude.com/claude-code) or [Codex CLI](https://github.com/openai/codex). Choose one in Settings > AI overview, which also shows whether each tool is installed and signed in. Plot has no server and no API key of its own.

The tool reads the pull request's diff and description, the list of file paths in the repository, and the directories the pull request touches. It only gets to read:

- **Claude Code** runs with the `Read`, `Grep`, and `Glob` tools only, inside the checkout, without commands, the web, or your MCP servers.
- **Codex CLI** runs in its read-only sandbox: it can run commands that read files, but cannot change them or use the network. Web search, your Codex configuration, and its MCP servers are turned off.

Instructions hidden in a pull request therefore cannot make the tool change files or send code elsewhere. Lines the AI cites are checked against the code, and anything it made up is marked as unverified.

Overviews are saved on your Mac per commit, so reopening a pull request does not run the tool again.

## Keyboard shortcuts

| Action                         | Default shortcut               |
| ------------------------------ | ------------------------------ |
| Next / previous difference     | F7 / ⇧F7                       |
| Next / previous file           | ⌃⇧→ / ⌃⇧←                      |
| Go to line                     | ⌘L                             |
| Extend / shrink selection      | ⌥↑ / ⌥↓                        |
| Find in file                   | ⌘F                             |
| Move in the changed files tree | ↑ ↓, ← → to collapse or expand |
| Show or hide the sidebar       | ⌘1                             |
| Show or hide the AI review     | ⌘2                             |
| Hide or restore all panels     | ⇧⌘F12                          |
| Resize a side panel            | Drag its edge                  |
| Maximize or restore the AI     | ⇧⌘'                            |
| Open a pull request by URL     | ⌘O                             |
| Back to the pull request list  | ⌘[                             |
| Refresh                        | ⌘R                             |
| Settings                       | ⌘,                             |

The defaults follow IntelliJ IDEA's macOS keymap. At the last difference of a file, press F7 again to open the next file, as in IntelliJ.

Change any shortcut in Settings > Keymap. Actions such as switching to the unified view or explaining a change have no default shortcut, and you can give them one there.

## Make it yours

Settings > Appearance offers Light, Dark, and IntelliJ's classic Darcula theme, or follows macOS. Pick any installed code font and size, and change the diff and accent colors of each theme. Panels can be hidden, resized by dragging their edge, and the AI overview can take the whole window.

## Connecting GitHub

Plot connects to nothing until you choose how to sign in:

- **Browser.** Plot opens github.com in your browser, where you approve it with a one-time code. Works with single sign-on.
- **Personal access token.** A classic token with the `repo` scope, or a fine-grained token with read access to contents and pull requests.
- **GitHub CLI.** Uses the account you signed in to with `gh auth login`. Plot asks `gh` for the token when it needs one and stores no copy.

Accounts on GitHub Enterprise Cloud live on github.com, so choose GitHub.com for them. Choose Company server for GitHub Enterprise Server or GHE.com. Browser sign-in works only on github.com, so for a company server, run `gh auth login --hostname <server> --web` once and connect with the GitHub CLI, or use a token.

You can connect several accounts, including accounts on company servers, and switch between them in Settings > Accounts. Pull requests on a company server open with the account connected for that server. Tokens are encrypted with your macOS keychain and only sent to the server they belong to.

## Requirements

- macOS
- Git
- A GitHub account on github.com or GitHub Enterprise Server
- Claude Code or Codex CLI, signed in, for AI overviews. Everything else works without them.

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

[MIT](LICENSE)
