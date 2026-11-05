# Using Plot

[Back to the README](../README.md) · [Troubleshooting](TROUBLESHOOTING.md)

## AI overviews and your code

New profiles automatically choose an installed, compatible tool that is signed in using the selected sign-in method. Choosing a tool yourself keeps that choice; existing saved choices stay manual. Toggle automatic selection in Settings > AI overview at any time. The Codex model picker shows the model currently used by Default as well as the account's available models.

Overviews are made by an AI coding tool on your Mac: [Claude Code](https://claude.com/claude-code) or [Codex CLI](https://github.com/openai/codex). Choose one in Settings > AI overview, which also shows whether each tool is installed and signed in. Pick its model and reasoning effort there too. Codex models are loaded for the selected sign-in; API-key discovery uses a temporary, isolated Codex profile and does not change your CLI sign-in. If an older Codex returns only retired models, update it and reload the list. The tool can use its own sign-in, or an Anthropic or OpenAI API key that you add there, which your provider bills for each overview. Plot keeps the key in your macOS keychain and gives it only to that tool while it makes an overview. Plot has no server and no API key of its own.

The tool reads the pull request's diff and description, the list of file paths in the repository, and the directories the pull request touches. The tools run with these restrictions:

- **Claude Code** runs with the `Read`, `Grep`, and `Glob` tools only, inside the checkout, without commands, the web, or your MCP servers.
- **Codex CLI** runs in its read-only sandbox: it can run commands that read files, but cannot change them or use the network. Those commands see only basic environment variables such as `PATH` and `HOME`, so keys in your environment do not reach them. Web search, your Codex configuration, and its MCP servers are turned off. The read-only sandbox does not confine file reads to the checkout; Claude Code has the narrower read scope.

These restrictions reduce the actions available to the AI tool when it reads untrusted pull request content. They are not a guarantee that the AI output is correct or that every prompt injection can be prevented. Plot checks cited file paths and line numbers; this verifies the location, not the explanation. Unverified references are marked in the app.

Code sent for an overview is processed by your chosen AI provider under that account’s terms. The changed directories, diff, description, and repository file list are provided. When a change map or custom diagram is configured, Plot also reads a bounded sample of repository READMEs, architecture documentation and manifests at the exact PR commit: up to eight files, 16 KB per file and 32,000 characters total. Files that are unavailable, too large or truncated are recorded in the context; the map explains its analysis scope. Impacts outside this inspected context may be incomplete.

Overviews are saved on your Mac per commit and language, so reopening a pull request does not run the tool again.

Settings > AI overview > Review format starts with five steps: At a glance, Change map, Key changes, Review focus, and Code walkthrough. The overview is short, the most important changes are shown first, and additional details can be expanded. Review focus separates code references, the PR description and inferences, without giving a merge verdict. Untouched older defaults migrate automatically; edited plans are retained. Apply five-step flow keeps custom steps and edited instructions, and the built-in picker can add back optional execution flows or impacts. Drag the cards or use the arrow buttons to reorder them, rename built-in cards, or hide their results. You can delete any step, including the defaults, and undo deletions. Deleted steps stay removed after restarting and are excluded from future analyses. These changes immediately rearrange saved overviews without another AI call. Each result card can also be collapsed while reading.

The picture step chooses the views that explain the change: system architecture, processing/data flow, or a sequence of calls. It usually produces one or two complementary pictures, with a short explanation of what each shows. Before, After, and Side by side compare the actual structure or behavior at the merge base and PR head. After is shown first to preserve legibility; switch to Before or choose Side by side for comparison. The views use styled SVG: architecture groups components into tinted subsystem panels with role icons, processing flows emphasize paths and branches, and call sequences use participant lanes and numbered messages. Hovering a component or message traces its relationships; verified current-code elements open their source. Fit to panel keeps the whole drawing visible, while Readable size preserves labels in a scrollable viewport. These views reuse the same analysis without another AI call. Before diagrams never link to current code. Scope and current-code evidence remain available below each picture. Custom diagrams keep their chosen format, and older saved maps remain readable until regenerated.

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

## Read and check a PR by purpose

After generating an overview, **Read by change** groups related implementation, changed tests, documentation and explanation by behavior. Choose a unit to focus the diff and its diagrams; **All files and review steps** restores the full review, including custom steps. The **Scope** selector at the top of the AI overview stays visible in both modes: choose **Whole PR** or a named change to switch back and forth. Switching scope reuses the saved overview; it does not generate another AI request. Files without an AI association remain accessible under **Other files**. Linked-file counts describe navigation, not how much code the AI inspected.

**Ask about this change** is an always-visible question composer below the overview, not a collapsible section. Check the displayed scope before submitting. Selecting code moves focus to the question field and includes that source selection; typing alone does not send an AI request.

Select up to 120 lines on either side of the diff and choose **Ask about selected code**, or ask a question for the current unit. Answers use source snapshots from that PR revision, keep the selected side and range, and link supported current-code citations. In **AI code review**, choose **Find possible bugs** to start a fresh session with your selected AI tool. If it finds possible bugs, another session with the same tool rechecks the code evidence; this does not select a different model. The results distinguish findings with code evidence, ruled-out candidates and uncertain findings. No code or tests are executed, so these are not confirmed bugs or an approval. Questions and reports are saved by PR revision and AI language. Each explicit request counts toward the selected AI tool's usage; changing units does not start a request.

Flowcharts use conventional symbols: a diamond for a decision, a rectangle for a process, a parallelogram for input/output, and a capsule for a start or end. Expand **Flowchart symbols** beside a drawing for the key. The same roles apply to before/after pictures, custom flowcharts and Mermaid exports. Component maps and sequence diagrams keep their own notation.

**Try inputs and error cases** evaluates an AI explanation model immediately. When that model also has a native function binding, **Run actual code with these values** compares the real exported function in merge-base and head snapshots. Editing inputs marks earlier execution results as stale. The function's complete JSON return or exception is shown separately from the model's simplified outcome and its fixed assumptions.

**Compare tests with Node.js** runs related changed `.test`/`.spec` files directly with Node's built-in test runner (`node --test`), not the project's `npm test` command. Vitest, Jest, package scripts and tests requiring installed dependencies are not supported in this isolated environment. Both versions use the exact PR-head test assertions, so a new test may expose either an intended behavior difference or a regression. The comparison shows top-level test outcomes and retains raw output; skipped tests are not passes. Nested or duplicate test names need the raw output. An **Execution failed** status alone does not establish a code defect: failure output opens automatically, and a detected module-loading error explains the dependency restriction.

Actual execution currently requires macOS's available sandbox and a compatible installed Node.js runtime (22 or newer with the required test flags). It starts only on an explicit click, uses disposable snapshots, blocks network access, private file contents and child processes, and writes only to temporary scratch space. Plot does not install dependencies or run package scripts. Functions needing service/browser setup, object arguments, missing dependencies, other test frameworks and repositories above 20,000 tracked files may be unavailable. A setup error is reported as such. Execution can be cancelled, is time limited, and results remain available for the current app session. The original configurable five-step review and custom steps remain available.

## Local changes

Choose **Open a local folder…** on the start screen, or **Local changes → Choose a folder…**. Reading local diffs does not require a GitHub account or an AI tool.

- **Uncommitted only** is the default. It compares your working tree with `HEAD`, including staged, unstaged and untracked files.
- **Selected commits** shows the history of the chosen branch. Check one or several commits to inspect only their changes, not every commit between the first and last selection. The list shows up to 100 commits and tells you when older history is omitted. Selections that depend on omitted changes can conflict; Plot reports the conflict instead of silently including those commits.

Open **AI overview** and explicitly choose **Explain local changes** to analyze the selected local diff. This uses the AI tool and response language configured in Settings, with the same provider usage costs as PR overviews. Local code is sent to the selected AI provider; it is not offline analysis. Local overviews use an isolated, bounded snapshot rather than running the AI in your working folder. Changed selections or working files need their own overview; changing the selection never starts an AI request automatically.

The app does not check out another branch or edit, stage, commit, push or merge your work. Local overviews explain changes; PR-specific questions, independent checks and code execution are not available for local selections.
