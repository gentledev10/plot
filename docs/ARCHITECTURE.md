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
| `src/main/fonts`    | Font files people add to Plot, and the font families installed on the Mac                         |
| `src/main/system`   | Running commands, and reading `PATH` from the login shell                                         |

Adapters receive what they depend on as arguments, for example `createGitHubClient({ fetch, tokens })`, so tests can pass fakes instead of mocking modules. Pure logic is kept out of files that import `electron`, so it can be tested in plain Node.js.

Commands run through `runCommand`, which uses `execFile` without a shell. Arguments are passed as a list and are never parsed by a shell.

### Accounts and signing in

Plot talks to GitHub only after someone chooses how to sign in. Each connected account is kept in `userData/accounts.json` by `accounts/account-store.ts`: its host, login, and sign-in method. Tokens from browser sign-in and personal access tokens are encrypted with Electron's `safeStorage`, whose key lives in the macOS keychain, and are decrypted only in the main process. Accounts that use the GitHub CLI keep no token: Plot runs `gh auth token --hostname <host> --user <login>` when it needs one, so signing out of `gh` signs Plot out too.

Browser sign-in uses GitHub's web flow (`github/web-flow.ts`) when the build has the OAuth app's client secret. Plot listens on a random port of `127.0.0.1` and opens GitHub's authorize page with a fresh `state` and a PKCE challenge. After the person approves Plot, GitHub sends the browser back to that address with a code, which Plot trades for tokens. A request without the right `state` is ignored, and the listener closes after the first answer, a cancel, or ten minutes. GitHub requires the client secret for that trade even with PKCE. A secret inside a desktop app can be read by anyone, so Plot treats it as public: it stays out of the repository and reaches release builds through `MAIN_VITE_GITHUB_CLIENT_SECRET`. Builds without it use the device flow (`github/device-flow.ts`): Plot copies a one-time code, opens github.com/login/device for the person to paste it, and polls until GitHub hands over a token.

Both flows use the client ID of Plot's GitHub OAuth app (`github/oauth-app.ts`), which a build can replace with `MAIN_VITE_GITHUB_CLIENT_ID`; builds without one hide the option. The app is registered on github.com, which company servers do not know about, so the option appears only for GitHub.com. GitHub has no read-only scope for private repositories, so the app asks for `repo`, and Plot only reads with it.

GitHub can issue browser sign-in tokens that expire after eight hours, with a refresh token that lasts six months. Plot seals the refresh token like the access token. `storedTokens` in `github/token.ts` trades it for a new pair shortly before the access token expires, or when GitHub rejects the token, and saves the pair without switching the current account. GitHub retires a refresh token once it is used, so requests that fail at the same time share one refresh.

Requests go through `GitHubConnections` (`github/connections.ts`). The inbox uses the current account. A pull request uses an account on its own host: the current account if it is there, otherwise the first one connected for that host. Pull request references carry their host, and so does everything cached for them, such as `userData/repositories/<host>/<owner>/<repo>.git`, so a token is only ever sent to the server it came from. REST calls go to `api.github.com` for github.com, `api.<host>` for GitHub Enterprise Cloud with data residency (`*.ghe.com`), and `https://<host>/api/v3` for GitHub Enterprise Server.

The repositories a person adds to the Pull requests window are a preference (`pullRequests.repositories`), so they belong to the person rather than to an account, and each repository is read with the account for its host. Adding one asks GitHub for the repository first (`findRepository`) and keeps the name GitHub returns, because search does not follow renamed or moved repositories while other requests do. The open pull request count comes from the pulls list with one item per page: GitHub has no count endpoint, and the page number in the `last` link of the `Link` header is the count. This uses the core rate limit instead of search's 30 requests a minute. Browsing a repository runs a search built from its filters (`repositorySearch`): `is:open`, `is:merged`, or `is:closed is:unmerged` for the state, `review-requested:@me`, `author:@me`, or `assignee:@me` for whose pull requests they are, and the search box text as typed, so GitHub qualifiers such as `label:bug` work. It loads 30 results at a time, up to the 1,000 results search returns, and runs the search box only when Enter is pressed, because search allows 30 requests a minute.

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

People can also open a git repository on their Mac, in the Local changes tool window. The folder comes from the native folder picker, and the main process records it in `userData/local-repositories.json` (`local/local-repositories.ts`). The renderer only ever refers to a repository by an opaque id, so it cannot point git at an arbitrary path.

`local/local-git.ts` compares the working tree with a base. "Branch changes" uses the merge base with `origin/HEAD`, or with `main` or `master` when there is no remote, so it shows what a pull request would show if the branch were pushed now, plus uncommitted work and untracked files. "Uncommitted only" compares with `HEAD`. The base side is read from git objects, and the current side from disk; files are only read inside the repository, symbolic links are shown as their target instead of being followed, and parent folders that link outside the repository are refused.

The repository belongs to the user, so their git config applies, unlike in the pull request cache. Variables that point git at another repository are dropped, `GIT_OPTIONAL_LOCKS=0` keeps git from taking locks that the user's own tools may need, and `core.fsmonitor` is turned off so no file-system monitor command runs. Git has no change notification, so the open view polls a cheap signature of the working tree (`git status` plus the size and modification time of changed files) every two seconds, and loads the diff again only when it changes. A folder's pull request is found from git config, so nothing is fetched: `findLocalPullRequest` reads the remotes and the branch the current branch tracks, then asks GitHub for an open pull request whose head is that branch. It looks first in the remote named `upstream`, which clones of a fork usually use for the original repository, then in `origin` and the remote the branch is pushed to (`local/local-pull-request.ts`). The Local changes list shows the pull request's number, the files view links to it, and pull request lists mark it Local. The Local changes list also shows each folder's branch and how many files a branch diff would list (`git diff --name-only` plus untracked files, without comparing lines), polled every five seconds while the list is showing.

### AI overviews

`createReviewService` turns a pull request into an overview that helps someone understand the change quickly, rather than judge it. In code it is a `ReviewMap`: a summary, the main changes described as before and now, the runtime flows the change alters with their steps before and after it, the components around the change marked as added, changed, removed, or unchanged, what else it affects, and a reading order. Items point to a file and line. It runs an AI coding tool the user already has, Claude Code or Codex CLI, chosen in Settings > AI overview, so Plot needs no API key of its own and adds no new place that code is sent to. For each tool, the person chooses between the tool's own sign-in and an API key. A key is sealed with `safeStorage` in `userData/ai-api-keys.json` (`ai/api-key-store.ts`), never crosses IPC back to the renderer, and reaches the tool only for one run, as `ANTHROPIC_API_KEY` for Claude Code or `CODEX_API_KEY` for `codex exec`. Both tools put that variable ahead of their saved sign-in. Claude Code still prefers `ANTHROPIC_AUTH_TOKEN` and its cloud provider switches, so those are left out of a run that uses a key.

1. Check out the directories the pull request touches at its head commit, as a sparse worktree of the repository cache. Write the diff, the list of every file in the repository (from git trees, without downloading contents), and the description next to it.
2. Run the chosen tool in that worktree: `claude --print` (`ai/claude-code.ts`) or `codex exec` (`ai/codex.ts`). The tool reads the files and returns JSON that must match `REVIEW_SCHEMA`. Its tool calls stream back as progress such as "Reading src/app.ts", which the renderer polls once a second.
3. `parseReviewMap` checks the result, caps its size, and drops anything malformed. `verifyLocations` marks every cited line that does not exist in the checked-out files as unverified, so the UI can flag it.
4. Store the result under `userData/reviews`, keyed by pull request, head commit, and review language, and delete the worktree. A new push gets a new overview; reopening the same commit and language shows the stored one. Stored files carry a format number, and files in an older format are ignored, so they are generated again after the shape changes. Legacy reviews without language metadata are retained but are not served for a requested language.

Language settings live in preferences under `languages`. The app supports Korean and English, defaults to the system's preferred language, and lets AI reviews follow it or use an independent language. `LanguageProvider` updates React text and the document language immediately; the main process updates application menus when the preference is saved. The review service snapshots the current language when a job starts and includes it in the prompt and saved result. Switching languages only changes which stored review is requested; it never starts a paid generation. Code, paths, pull request titles, and other repository data are not passed through the UI translator.

Steps before the change keep no code location, because the code they describe may be gone from the pull request's version. `compareFlow` finds the steps that only exist on one side, and the before and after diagrams shade them red and green.

The built-in picture step now returns `visuals`: usually one or two architecture, flowchart, or sequence views chosen to explain the particular PR. Each view has a question-oriented title, a takeaway, scope, and optional before/after graphs. The parser bounds graph size and removes locations from the before side; only PR-head locations are verified and navigable. Existing maps and custom diagrams remain compatible. `VisualWalkthrough` offers Before, After, and Side by side without another analysis. Architecture and process graphs use React SVG (`VectorDiagram`) with ELK layouts; text is rendered as text, and no AI-generated SVG or HTML is executed. ELK was already bundled through Mermaid and is now also a direct dependency at the same version. Compound-edge coordinates are translated from their container to the SVG root. Fit considers both viewport width and height, and Readable size uses a scrollable viewport. Sequence views continue to use the generated Mermaid representation.

This separates what the AI explains from how Plot draws it. SVG allows element-level code navigation, theme changes and consistent geometry. A raster image generation service could be added for optional conceptual illustrations, but it is not required by the review path. Native vector rendering does not establish that an AI claim is correct; scope, provenance and code references remain part of the result.

Each tool is a `ReviewAgent` (`ai/agent.ts`). `runAgentProcess` gives every runner the same timeout, cancellation, and "not installed" handling, and `ai/detect.ts` reports in Settings whether each tool is installed and signed in. Settings offers the models each tool knows (`ai/models.ts`): Claude Code's model aliases, which always point at the newest model of each family, and the account-aware catalog that Codex app-server `model/list` returns, with the reasoning efforts each model accepts. `REVIEW_SCHEMA` stays within the strict subset that OpenAI structured outputs accept, with every property required and optional values nullable, so one schema serves both tools. Supporting another tool means writing one runner and adding it to `AI_PROVIDERS` in `src/shared/ai.ts`.

The pull request is written by someone else, so the agent is treated as if its input may try to take it over:

- Claude Code 2.1.248 or later is checked before overview preparation and runs with `--restricted` and only the `Read`, `Grep`, and `Glob` tools. It cannot run commands, edit files, or fetch URLs, and file access is confined to the worktree and the context directory. `--strict-mcp-config` keeps the user's MCP servers, such as mail or chat integrations, out of reach, and `--no-session-persistence` keeps the run out of the user's history.
- Codex CLI runs with `--sandbox read-only`: the commands it runs can read files but cannot write them or open network connections. `--ignore-user-config` and `--ignore-rules` leave out the user's configuration, including MCP servers, web search is turned off, and `--ephemeral` keeps the run out of the user's history. `shell_environment_policy.inherit="core"` gives the commands only basic variables such as `PATH` and `HOME`, so `CODEX_API_KEY` and other secrets in the environment never reach them. Unlike Claude Code's restricted mode, the sandbox does not limit reading to the worktree, so Claude Code is the stricter choice for sensitive machines.
- Model names and reasoning efforts from settings are checked against plain patterns and passed as `--model=<name>`, and as `--effort=<level>` to Claude Code or `--config model_reasoning_effort="<level>"` to Codex, so a setting cannot smuggle in another flag.
- Diagrams are built from the structured result by `mermaid-source.ts`, not from Mermaid text the model writes. Labels are reduced to characters that cannot start a new Mermaid statement, and Mermaid runs with `securityLevel: 'strict'`.

## Renderer layout

| Directory                     | Contents                                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| `src/renderer/src/app`        | The layout and the providers for the API and React Query          |
| `src/renderer/src/features`   | One folder per feature, with its components and React Query hooks |
| `src/renderer/src/components` | Small UI pieces shared by features                                |
| `src/renderer/src/lib`        | Framework-free helpers, such as the API client and formatting     |
| `src/renderer/src/styles`     | Design tokens and base styles. Components use CSS Modules         |

The shell in `app/App.tsx` lays out a tool window bar on each edge, the sidebar, the workspace, and the AI review panel in one CSS grid. The sidebar shows one tool window at a time, Pull requests (GitHub) or Local changes (folders on this Mac), and each of them switches to the changed files of what it opened. Like IntelliJ's tool windows, the side panels can be hidden from the bars or the keyboard, and resized by dragging their inner edge (`ResizeHandle`, which also works with the arrow keys). Hidden panels and the tool window in the background stay mounted, so they keep their state. The AI panel can also be maximized over the sidebar and the diff, like IntelliJ's Maximize Tool Window, so diagrams get the whole window; opening a code location from it restores the layout. While a panel edge is dragged, the width is written straight to a CSS variable, and it is saved with the other preferences when the drag ends, so a drag does not re-render the app on every pointer move. On macOS the window controls cover the top-left corner, so the shell sets `--titlebar-inset` on whichever area sits there, and headers add it to their left padding.

### Preferences and appearance

Renderer preferences, such as the panel layout and widths, the keymap, diff options, and appearance, live in `userData/preferences.json`, which the main process owns (`preferences/preferences-store.ts`). The renderer loads them once before the first render with `initializePreferences` and sends each change back with `setPreference`. Nothing is kept in `localStorage`, because Chromium does not keep it for the app's own `app://` page across restarts.

Themes are defined in `features/appearance/themes.ts`: the UI colors, which become CSS variables on the root element, and Monaco's syntax and editor colors. People can override a few colors per theme, such as the diff colors and the accent, and `editorTheme` builds a Monaco theme from the same colors, so the editor and the rest of the app always match. The saved appearance is applied before React renders, so the window does not flash the default colors. The main process sets `nativeTheme.themeSource` to light, dark, or system to match the theme, so scrollbars, form controls, and `prefers-color-scheme` follow it, and it remembers that choice to open the window in the right colors.

Code fonts come from three places. Six fonts under the SIL Open Font License are bundled into the renderer (`features/appearance/bundled-fonts.ts`). `fonts/installed-fonts.ts` asks macOS for its font families through `osascript` and marks the monospaced ones. Font files someone adds are copied to `userData/fonts` (`fonts/font-library.ts`), after `fonts/font-file.ts` reads the family, weight, and style from the font's own tables. The renderer reads those files over IPC and registers them with the `FontFace` API, so they work without being installed on the Mac.

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
