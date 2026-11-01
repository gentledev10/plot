# Architecture

This document explains how the app is put together and why. Read it before making changes that cross process boundaries or touch security.

## Processes

Plot is an Electron app with three kinds of code. Each one has a single job.

| Process  | Directory      | Job                                                              | Can access                            |
| -------- | -------------- | ---------------------------------------------------------------- | ------------------------------------- |
| Main     | `src/main`     | Talks to GitHub, runs `git` and AI tools, owns tokens and caches | Node.js, the file system, the network |
| Preload  | `src/preload`  | Exposes the IPC contract to the page as `window.plot`            | `contextBridge`, `ipcRenderer`        |
| Renderer | `src/renderer` | Draws the UI                                                     | Only `window.plot`                    |

Code shared by more than one process lives in `src/shared`. It must stay free of Node.js and DOM APIs so every process can import it.

## Trust boundaries

The renderer shows content written by other people: pull request titles, descriptions, and diffs. It also shows text produced by AI tools that read that content. Treat everything on screen as untrusted, and keep the renderer unable to do damage even if a bug lets that content run as script.

- The renderer runs sandboxed, with context isolation and without Node.js integration.
- Pages are served from the custom `app://plot` scheme with a strict Content-Security-Policy (`src/main/app/security.ts`). Only bundled scripts can run, and the page cannot open network connections of its own.
- Untrusted text is rendered as text. Nothing from GitHub or an AI tool is inserted as HTML.
- Navigation away from the app is blocked. Links with `https://` open in the default browser.
- Permission requests (camera, notifications, and so on) are denied.
- Secrets such as the GitHub token stay in the main process. They never cross IPC.
- The main process answers IPC calls only from the app's own frames, and validates every argument before using it.

## IPC contract

`PlotApi` in `src/shared/ipc.ts` is the single list of what the renderer can ask the main process to do. A call travels like this:

```
renderer                   preload                    main
createApi(window.plot)  →  PlotBridge (Result)   →    registerIpcHandlers
  throws PlotError           ipcRenderer.invoke         1. check the sender frame
                                                        2. parse arguments (ipc/arguments.ts)
                                                        3. call the service
                                                        4. return { ok, value } or { ok, error }
```

Failures cross the boundary as `{ code, message }`. `AppError` in the main process carries a code from `src/shared/errors.ts`, and the renderer turns it back into a `PlotError` with the same code, so the UI can react to `gh-not-installed` differently from `network`. Any other error is logged in the main process and reaches the renderer as `unknown`, without details such as file paths.

To add a method, add it to `PlotApi` and `METHODS` in `src/shared/ipc.ts`, then follow the type errors: the argument parser, the service that implements it, and the fake API used in renderer tests all have to name it.

## Main process layout

| Directory           | Contents                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `src/main/index.ts` | Composition root. Creates the adapters and services, registers IPC handlers, and opens the window |
| `src/main/app`      | Electron glue: window creation, the `app://` protocol, navigation and permission guards           |
| `src/main/ipc`      | The IPC adapter: sender checks, argument parsing, and error mapping                               |
| `src/main/services` | Use cases such as "load the inbox", built from adapters                                           |
| `src/main/accounts` | Connected accounts and their encrypted tokens                                                     |
| `src/main/github`   | GitHub adapter: connections per host, sign-in flows, the REST client, and response mappers        |
| `src/main/git`      | Repository cache: fetches the commits a pull request needs and parses `git diff` output           |
| `src/main/ai`       | AI review: Claude Code and Codex CLI runners, detection, the prompt, schema, and stored reviews   |
| `src/main/system`   | Running commands, and reading `PATH` from the login shell                                         |

Adapters receive what they depend on as arguments, for example `createGitHubClient({ fetch, tokens })`, so tests can pass fakes instead of mocking modules. Pure logic is kept out of files that import `electron`, so it can be tested in plain Node.js.

Commands run through `runCommand`, which uses `execFile` without a shell. Arguments are passed as a list and are never parsed by a shell.

### Accounts and signing in

Plot talks to GitHub only after someone chooses how to sign in. Each connected account is kept in `userData/accounts.json` by `accounts/account-store.ts`: its host, login, and sign-in method. Tokens from browser sign-in and personal access tokens are encrypted with Electron's `safeStorage`, whose key lives in the macOS keychain, and are decrypted only in the main process. Accounts that use the GitHub CLI keep no token: Plot runs `gh auth token --hostname <host> --user <login>` when it needs one, so signing out of `gh` signs Plot out too.

Browser sign-in uses GitHub's device flow (`github/device-flow.ts`). Plot opens the device page on github.com with the one-time code in its address and also shows the code, the person approves it there, and Plot polls until GitHub hands over a token. The flow uses the client ID of Plot's GitHub OAuth app (`github/oauth-app.ts`), which a build can replace with `MAIN_VITE_GITHUB_CLIENT_ID`; builds without one hide the option. The app is registered on github.com, which company servers do not know about, so the option appears only for GitHub.com. GitHub has no read-only scope for private repositories, so the app asks for `repo`, and Plot only reads with it.

Requests go through `GitHubConnections` (`github/connections.ts`). The inbox uses the current account. A pull request uses an account on its own host: the current account if it is there, otherwise the first one connected for that host. Pull request references carry their host, and so does everything cached for them, such as `userData/repositories/<host>/<owner>/<repo>.git`, so a token is only ever sent to the server it came from. REST calls go to `api.github.com` for github.com, `api.<host>` for GitHub Enterprise Cloud with data residency (`*.ghe.com`), and `https://<host>/api/v3` for GitHub Enterprise Server.

Apps opened from Finder get a minimal `PATH` that does not include Homebrew. The packaged app reads `PATH` from the user's login shell at startup so it can find `gh` and `git`.

### Reading a pull request's changes

Plot computes diffs with git instead of using the diff GitHub returns. That keeps whole files available for context, works for pull requests of any size, and gives later features such as symbol navigation a real repository to read.

Cloning large repositories would make opening a pull request slow, so `getPullRequestDiff` fetches only what the diff needs:

1. Ask GitHub for the merge base of the pull request (`/compare/{base}...{head}`). Diffing against the merge base matches the "Files changed" tab on GitHub.
2. Fetch exactly two commits, the merge base and the head, with `--depth=1 --filter=blob:none` into an app-owned bare repository under `userData/repositories/<owner>/<repo>.git`. No history and no file contents are downloaded at this point.
3. Run `git diff --numstat` and `git diff --raw` between the two commits. Git downloads the contents of the changed files on demand, and nothing else.

`readBlob` reads one file version by its object id when the renderer opens a file. Files larger than 4 MB are reported as too large instead of being sent to the renderer.

The cache runs git in an isolated environment (`isolatedGitEnvironment`): the user's global and system config, hooks, and URL rewrites do not apply. The token reaches git as an `http.extraheader` set through `GIT_CONFIG_*` environment variables, so it never appears in command arguments or in the repository config. Fetches into the same repository run one at a time, because concurrent shallow fetches conflict on git's lock files.

### Local repositories

People can also open a git repository on their Mac. The folder comes from the native folder picker, and the main process records it in `userData/local-repositories.json` (`local/local-repositories.ts`). The renderer only ever refers to a repository by an opaque id, so it cannot point git at an arbitrary path.

`local/local-git.ts` compares the working tree with a base. "Branch changes" uses the merge base with `origin/HEAD`, or with `main` or `master` when there is no remote, so it shows what a pull request would show if the branch were pushed now, plus uncommitted work and untracked files. "Uncommitted only" compares with `HEAD`. The base side is read from git objects, and the current side from disk; files are only read inside the repository, symbolic links are shown as their target instead of being followed, and parent folders that link outside the repository are refused.

The repository belongs to the user, so their git config applies, unlike in the pull request cache. Variables that point git at another repository are dropped, `GIT_OPTIONAL_LOCKS=0` keeps git from taking locks that the user's own tools may need, and `core.fsmonitor` is turned off so no file-system monitor command runs. Git has no change notification, so the open view polls a cheap signature of the working tree (`git status` plus the size and modification time of changed files) every two seconds, and loads the diff again only when it changes.

### AI overviews

`createReviewService` turns a pull request into an overview that helps someone understand the change quickly, rather than judge it. In code it is a `ReviewMap`: a summary, the main changes described as before and now, the runtime flows the change alters with their steps before and after it, the components around the change marked as added, changed, removed, or unchanged, what else it affects, and a reading order. Items point to a file and line. It runs an AI coding tool the user already has, Claude Code or Codex CLI, chosen in Settings > AI overview, so Plot needs no API key and adds no new place that code is sent to.

1. Check out the directories the pull request touches at its head commit, as a sparse worktree of the repository cache. Write the diff, the list of every file in the repository (from git trees, without downloading contents), and the description next to it.
2. Run the chosen tool in that worktree: `claude --print` (`ai/claude-code.ts`) or `codex exec` (`ai/codex.ts`). The tool reads the files and returns JSON that must match `REVIEW_SCHEMA`. Its tool calls stream back as progress such as "Reading src/app.ts", which the renderer polls once a second.
3. `parseReviewMap` checks the result, caps its size, and drops anything malformed. `verifyLocations` marks every cited line that does not exist in the checked-out files as unverified, so the UI can flag it.
4. Store the result under `userData/reviews`, keyed by pull request and head commit, and delete the worktree. A new push gets a new overview; reopening the same commit shows the stored one. Stored files carry a format number, and files in an older format are ignored, so they are generated again after the shape changes.

Steps before the change keep no code location, because the code they describe may be gone from the pull request's version. `compareFlow` finds the steps that only exist on one side, and the before and after diagrams shade them red and green.

Each tool is a `ReviewAgent` (`ai/agent.ts`). `runAgentProcess` gives every runner the same timeout, cancellation, and "not installed" handling, and `ai/detect.ts` reports in Settings whether each tool is installed and signed in. `REVIEW_SCHEMA` stays within the strict subset that OpenAI structured outputs accept, with every property required and optional values nullable, so one schema serves both tools. Supporting another tool means writing one runner and adding it to `AI_PROVIDERS` in `src/shared/ai.ts`.

The pull request is written by someone else, so the agent is treated as if its input may try to take it over:

- Claude Code runs with `--restricted` and only the `Read`, `Grep`, and `Glob` tools. It cannot run commands, edit files, or fetch URLs, and file access is confined to the worktree and the context directory. `--strict-mcp-config` keeps the user's MCP servers, such as mail or chat integrations, out of reach, and `--no-session-persistence` keeps the run out of the user's history.
- Codex CLI runs with `--sandbox read-only`: the commands it runs can read files but cannot write them or open network connections. `--ignore-user-config` and `--ignore-rules` leave out the user's configuration, including MCP servers, web search is turned off, and `--ephemeral` keeps the run out of the user's history. Unlike Claude Code's restricted mode, the sandbox does not limit reading to the worktree, so Claude Code is the stricter choice for sensitive machines.
- Model names from settings are checked against a plain pattern and passed as `--model=<name>`, so a setting cannot smuggle in another flag.
- Diagrams are built from the structured result by `mermaid-source.ts`, not from Mermaid text the model writes. Labels are reduced to characters that cannot start a new Mermaid statement, and Mermaid runs with `securityLevel: 'strict'`.

## Renderer layout

| Directory                     | Contents                                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| `src/renderer/src/app`        | The layout and the providers for the API and React Query          |
| `src/renderer/src/features`   | One folder per feature, with its components and React Query hooks |
| `src/renderer/src/components` | Small UI pieces shared by features                                |
| `src/renderer/src/lib`        | Framework-free helpers, such as the API client and formatting     |
| `src/renderer/src/styles`     | Design tokens and base styles. Components use CSS Modules         |

The shell in `app/App.tsx` lays out a tool window bar on each edge, the sidebar (pull requests or changed files), the workspace, and the AI review panel in one CSS grid. Like IntelliJ's tool windows, the side panels can be hidden from the bars or the keyboard, and resized by dragging their inner edge (`ResizeHandle`, which also works with the arrow keys). Hidden panels stay mounted so they keep their state. The AI panel can also be maximized over the sidebar and the diff, like IntelliJ's Maximize Tool Window, so diagrams get the whole window; opening a code location from it restores the layout. While a panel edge is dragged, the width is written straight to a CSS variable, and it is saved with the other preferences when the drag ends, so a drag does not re-render the app on every pointer move. On macOS the window controls cover the top-left corner, so the shell sets `--titlebar-inset` on whichever area sits there, and headers add it to their left padding.

### Preferences and appearance

Renderer preferences, such as the panel layout and widths, the keymap, diff options, and appearance, live in `userData/preferences.json`, which the main process owns (`preferences/preferences-store.ts`). The renderer loads them once before the first render with `initializePreferences` and sends each change back with `setPreference`. Nothing is kept in `localStorage`, because Chromium does not keep it for the app's own `app://` page across restarts.

Themes are defined in `features/appearance/themes.ts`: the UI colors, which become CSS variables on the root element, and Monaco's syntax and editor colors. People can override a few colors per theme, such as the diff colors and the accent, and `editorTheme` builds a Monaco theme from the same colors, so the editor and the rest of the app always match. The saved appearance is applied before React renders, so the window does not flash the default colors. The main process sets `nativeTheme.themeSource` to light, dark, or system to match the theme, so scrollbars, form controls, and `prefers-color-scheme` follow it, and it remembers that choice to open the window in the right colors.

Components get the API from `useApi()` instead of reading `window.plot`, and fetch data through React Query hooks. Tests render components with a fake API through `renderWithApi` in `src/renderer/test/render.tsx`.

### The diff view

The diff is drawn by Monaco's diff editor. `features/diff/monaco.ts` loads only the editor features a read-only review needs (find, copy, word highlighting, expanding the selection, and highlighting invisible Unicode characters) and the syntax definitions, without language services or their workers.

IntelliJ colors a block by what happened to it: blue for edited lines, green for inserted lines, and gray for deleted lines. Monaco only knows which side a line is on, so in the side-by-side view its own diff colors are turned off (`themes.ts`), and `changeDecorations` in `changes.ts` classifies each block and paints it. The unified view keeps Monaco's colors, because deleted lines there are not real editor lines that could be decorated.

Navigation follows IntelliJ's keymap. F7 and Shift+F7 move between differences; at the last difference of a file, a second press opens the next file (`decideNavigation` in `features/pull-request/navigation.ts`). Ctrl+Shift+Right and Ctrl+Shift+Left switch files directly.

### Keyboard shortcuts

Every shortcut is a command in `features/keymap/commands.ts`, with an id, a title, and default keys. Components say what a command does with `useCommand(id, handler)`. `KeymapProvider` owns a single `keydown` listener in the capture phase, so shortcuts also work while the editor has focus, and runs the handler mounted last for the keys pressed. Keys with no handler at that moment, such as F7 while no pull request is open, reach the page as usual.

Shortcuts are stored as strings such as `Ctrl+Shift+ArrowRight`. Letters, digits, and punctuation are read from the physical key (`KeyboardEvent.code`), so shortcuts keep working while an input method such as Korean is active. Only the commands someone changed are saved, so later changes to the defaults still reach everyone else. `strokeProblem` rejects shortcuts that macOS, the app menu, or the editor's find already use, and keys without ⌘, ⌃, or ⌥ that would get in the way of typing.

The application menu (`src/main/app/menu.ts`) owns the standard macOS shortcuts. Items that need the page, such as Settings, are sent to the renderer as menu commands over `MENU_COMMAND_CHANNEL`, a one-way channel separate from `PlotApi`.

Monaco needs a real browser, so component tests replace `DiffViewer` with `src/renderer/test/fake-diff-viewer.tsx`, which honors the same contract: `goToChange`, `onChangesComputed`, and `onReveal`. Everything that decides what to show lives outside `DiffViewer` and is tested directly.

## Testing

| Layer                 | Tool                                  | Location                                           |
| --------------------- | ------------------------------------- | -------------------------------------------------- |
| Main and shared logic | Vitest in Node.js                     | `src/main/**/*.test.ts`, `src/shared/**/*.test.ts` |
| React components      | Vitest with jsdom and Testing Library | `src/renderer/**/*.test.tsx`                       |

Tests sit next to the code they cover. Tests use made-up data, such as `octocat/hello-world`, never real repositories.

The repository cache is tested against real git. `createFixtureRepository` builds a throwaway repository with a base branch and a pull request branch, and the tests fetch from it over `file://` exactly as the app fetches from GitHub.

## Dependencies

All npm packages are `devDependencies`. electron-vite bundles the main, preload, and renderer code, and the packaged app only contains the build output in `out/`. Add a runtime `dependency` only for a package that cannot be bundled, such as a native module.
