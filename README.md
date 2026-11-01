# Plot

**The story behind every change.**

Plot is a lightweight Mac app for reading code changes, made for developers who are used to IntelliJ's diff viewer. It opens GitHub pull requests and the work in your local repositories, and for pull requests an AI overview explains what the change does, why, and how the code flows differently from before.

> Status: early development. Expect rough edges, and please report them.

## Why

Many developers now open a full IDE only to read diffs, often of code an AI wrote. Plot does just that part, and opens fast:

- **Pull requests in one click.** See the pull requests waiting for your review, browse and filter all pull requests of the repositories you add, or paste any pull request URL.
- **IntelliJ's diff, outside IntelliJ.** Side-by-side diffs with IntelliJ's colors, collapsed unchanged fragments, and the same keyboard shortcuts.
- **Understand a change before you read it.** An AI overview explains what the pull request changes, compares how the code flowed before and after in sequence diagrams, draws the components around it, and lists what else it affects. Every item links to the line it is about. Bring your own Claude Code or Codex CLI.
- **Your own work, too.** Open a local repository in the Local changes window to see everything on your branch, including work you have not committed, with the same diff and shortcuts. It refreshes as files change, which suits checking code an AI agent just wrote, and links to the branch's pull request when there is one.
- **Fast on large repositories.** Plot fetches only the two commits a pull request compares, not the whole repository.

## AI overviews and your code

New profiles automatically choose an installed, compatible tool that is signed in using the selected sign-in method. Choosing a tool yourself keeps that choice; existing saved choices stay manual. Toggle automatic selection in Settings > AI overview at any time. The Codex model picker shows the model currently used by Default as well as the account's available models.

Overviews are made by an AI coding tool on your Mac: [Claude Code](https://claude.com/claude-code) or [Codex CLI](https://github.com/openai/codex). Choose one in Settings > AI overview, which also shows whether each tool is installed and signed in. Pick its model and reasoning effort there too. Codex models are loaded for the selected sign-in; API-key discovery uses a temporary, isolated Codex profile and does not change your CLI sign-in. If an older Codex returns only retired models, update it and reload the list. The tool can use its own sign-in, or an Anthropic or OpenAI API key that you add there, which your provider bills for each overview. Plot keeps the key in your macOS keychain and gives it only to that tool while it makes an overview. Plot has no server and no API key of its own.

The tool reads the pull request's diff and description, the list of file paths in the repository, and the directories the pull request touches. It only gets to read:

- **Claude Code** runs with the `Read`, `Grep`, and `Glob` tools only, inside the checkout, without commands, the web, or your MCP servers.
- **Codex CLI** runs in its read-only sandbox: it can run commands that read files, but cannot change them or use the network. Those commands see only basic environment variables such as `PATH` and `HOME`, so keys in your environment do not reach them. Web search, your Codex configuration, and its MCP servers are turned off.

Instructions hidden in a pull request therefore cannot make the tool change files or send code elsewhere. Lines the AI cites are checked against the code, and anything it made up is marked as unverified.

Code sent for an overview is processed by your chosen AI provider under that account’s terms. The changed directories, diff, description, and repository file list are provided. When a change map or custom diagram is configured, Plot also reads a bounded sample of repository READMEs, architecture documentation and manifests at the exact PR commit: up to eight files, 16 KB per file and 32,000 characters total. Files that are unavailable, too large or truncated are recorded in the context; the map explains its analysis scope. Impacts outside this inspected context may be incomplete.

Overviews are saved on your Mac per commit and language, so reopening a pull request does not run the tool again.

Settings > AI overview > Review format starts with five steps: At a glance, Change map, Key changes, Review focus, and Code walkthrough. The overview is short, the most important changes are shown first, and additional details can be expanded. Review focus separates code references, the PR description and inferences, without giving a merge verdict. Untouched older defaults migrate automatically; edited plans are retained. Apply five-step flow keeps custom steps and edited instructions, and the built-in picker can add back optional execution flows or impacts. Drag the cards or use the arrow buttons to reorder them, rename built-in cards, or hide their results. You can delete any step, including the defaults, and undo deletions. Deleted steps stay removed after restarting and are excluded from future analyses. These changes immediately rearrange saved overviews without another AI call. Each result card can also be collapsed while reading. Change maps group components by responsibility, highlight the parts touched by the PR, and use dashed styling for inferred components or relationships. The map fits the panel, can be enlarged, and links changed components to their code. Scope and evidence remain available in a disclosure below the map.

Adjust each step's detail and instructions, or add up to six custom steps as explanations, checklists, or diagrams. Diagram steps can show flowcharts, chronological calls, or component relationships according to your instructions. New steps start with empty title and instruction fields; example hints are never sent as instructions. All configured steps are generated in one analysis, including cards hidden with Show in results. Removing a step excludes it from analysis. Add a title or instructions to each custom step before generating. Changes to instructions, detail, or custom steps show a reminder to generate again and keep the previous analysis readable until you do; changing settings never starts an AI request automatically. Settings are saved locally and apply across pull requests.

## Languages

Settings > Language offers Korean and English for the app. The default follows the system's preferred language, using English for unsupported languages. AI reviews follow the app language by default, or you can select their language separately—for example, English controls with Korean explanations. Changes take effect immediately and are saved across restarts.

Code, paths, branch names, and pull request titles stay in their original language. AI prose and diagram descriptions use the review language. Reviews are cached separately by language; changing a language never starts an AI request automatically. A previously saved review without language information stays on disk but must be generated again for the selected language.

## Keyboard shortcuts

| Action                         | Default shortcut               |
| ------------------------------ | ------------------------------ |
| Next / previous difference     | F7 / ⇧F7                       |
| Next / previous file           | ⌃⇧→ / ⌃⇧←                      |
| Go to line                     | ⌘L                             |
| Extend / shrink selection      | ⌥↑ / ⌥↓                        |
| Find in file                   | ⌘F                             |
| Move in the changed files tree | ↑ ↓, ← → to collapse or expand |
| Show or hide pull requests     | ⌘1                             |
| Show or hide local changes     | ⌘0                             |
| Show or hide the AI review     | ⌘2                             |
| Hide or restore all panels     | ⇧⌘F12                          |
| Resize a side panel            | Drag its edge                  |
| Maximize or restore the AI     | ⇧⌘'                            |
| Open a pull request by URL     | ⌘O                             |
| Back to the list               | ⌘[                             |
| Refresh                        | ⌘R                             |
| Settings                       | ⌘,                             |

The defaults follow IntelliJ IDEA's macOS keymap. At the last difference of a file, press F7 again to open the next file, as in IntelliJ.

Change any shortcut in Settings > Keymap. Actions such as switching to the unified view or explaining a change have no default shortcut, and you can give them one there.

## Make it yours

Drag the bottom-right corner of Settings to resize it, or use its expand/restore button. The fixed-width font filter narrows the list of fonts installed on your Mac to those suited to aligned code columns.

Settings > Appearance offers Light, Dark, and IntelliJ's classic Darcula theme, or System to follow macOS. Change the code font and size, and the diff and accent colors of each theme, while a preview shows which part of the window each one changes. Plot comes with JetBrains Mono, Fira Code, Geist Mono, Inconsolata, Iosevka, and Roboto Mono, and can use any font installed on your Mac or font files you add. Panels can be hidden, resized by dragging their edge, and the AI overview can take the whole window.

## Connecting GitHub

Plot connects to nothing until you choose how to sign in:

- **Browser.** Plot opens GitHub in your browser, and you approve it there. Works with single sign-on.
- **Personal access token.** A classic token with the `repo` scope, or a fine-grained token with read access to contents and pull requests.
- **GitHub CLI.** Uses the account you signed in to with `gh auth login`. Plot asks `gh` for the token when it needs one and stores no copy.

Accounts on GitHub Enterprise Cloud live on github.com, so choose GitHub.com for them. Choose Company server for GitHub Enterprise Server or GHE.com. Browser sign-in works only on github.com, so for a company server, run `gh auth login --hostname <server> --web` once and connect with the GitHub CLI, or use a token.

You can connect several accounts, including accounts on company servers, and switch between them in Settings > Accounts. Pull requests on a company server open with the account connected for that server. Tokens are encrypted with your macOS keychain and only sent to the server they belong to.

## Requirements

- macOS
- Git
- A GitHub account on github.com or GitHub Enterprise Server
- Claude Code 2.1.248 or later, or an up-to-date Codex CLI, signed in, for AI overviews. Everything else works without them.

## Development

Requires Node.js 22.12 or later.

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

For a deterministic check in the real Electron app on macOS, run `npm run test:e2e`. It uses a temporary profile, real temporary Git repositories, and fixture GitHub/AI responses. It never signs in to GitHub or calls an AI provider. It also checks narrow-window layout, automatic refresh, diagrams, sanitizer versions, notices, and accessibility.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and guidelines, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the app is structured. Report security issues as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Plot includes fonts and theme colors from other projects under their own licenses, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Builds generate `THIRD_PARTY_LICENSES.txt` with the bundled packages’ full notices, including Monaco’s embedded components and ELK source instructions. Open it from Help > Open Source Licenses in the packaged app.
