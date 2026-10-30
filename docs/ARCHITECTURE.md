# Architecture

This document explains how the app is put together and why. Read it before making changes that cross process boundaries or touch security.

## Processes

Viewer is an Electron app with three kinds of code. Each one has a single job.

| Process  | Directory      | Job                                                              | Can access                            |
| -------- | -------------- | ---------------------------------------------------------------- | ------------------------------------- |
| Main     | `src/main`     | Talks to GitHub, runs `git` and AI tools, owns tokens and caches | Node.js, the file system, the network |
| Preload  | `src/preload`  | Exposes the IPC contract to the page as `window.viewer`          | `contextBridge`, `ipcRenderer`        |
| Renderer | `src/renderer` | Draws the UI                                                     | Only `window.viewer`                  |

Code shared by more than one process lives in `src/shared`. It must stay free of Node.js and DOM APIs so every process can import it.

## Trust boundaries

The renderer shows content written by other people: pull request titles, descriptions, and diffs. It also shows text produced by AI tools that read that content. Treat everything on screen as untrusted, and keep the renderer unable to do damage even if a bug lets that content run as script.

- The renderer runs sandboxed, with context isolation and without Node.js integration.
- Pages are served from the custom `app://viewer` scheme with a strict Content-Security-Policy (`src/main/app/security.ts`). Only bundled scripts can run, and the page cannot open network connections of its own.
- Untrusted text is rendered as text. Nothing from GitHub or an AI tool is inserted as HTML.
- Navigation away from the app is blocked. Links with `https://` open in the default browser.
- Permission requests (camera, notifications, and so on) are denied.
- Secrets such as the GitHub token stay in the main process. They never cross IPC.
- The main process answers IPC calls only from the app's own frames, and validates every argument before using it.

## IPC contract

`ViewerApi` in `src/shared/ipc.ts` is the single list of what the renderer can ask the main process to do. A call travels like this:

```
renderer                   preload                    main
createApi(window.viewer) → ViewerBridge (Result)  →  registerIpcHandlers
  throws ViewerError        ipcRenderer.invoke         1. check the sender frame
                                                       2. parse arguments (ipc/arguments.ts)
                                                       3. call the service
                                                       4. return { ok, value } or { ok, error }
```

Failures cross the boundary as `{ code, message }`. `AppError` in the main process carries a code from `src/shared/errors.ts`, and the renderer turns it back into a `ViewerError` with the same code, so the UI can react to `gh-not-installed` differently from `network`. Any other error is logged in the main process and reaches the renderer as `unknown`, without details such as file paths.

To add a method, add it to `ViewerApi` and `METHODS` in `src/shared/ipc.ts`, then follow the type errors: the argument parser, the service that implements it, and the fake API used in renderer tests all have to name it.

## Main process layout

| Directory           | Contents                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `src/main/index.ts` | Composition root. Creates the adapters and services, registers IPC handlers, and opens the window |
| `src/main/app`      | Electron glue: window creation, the `app://` protocol, navigation and permission guards           |
| `src/main/ipc`      | The IPC adapter: sender checks, argument parsing, and error mapping                               |
| `src/main/services` | Use cases such as "load the inbox", built from adapters                                           |
| `src/main/github`   | GitHub adapter: the token from the GitHub CLI, the REST client, and response mappers              |
| `src/main/system`   | Running commands, and reading `PATH` from the login shell                                         |

Adapters receive what they depend on as arguments, for example `createGitHubClient({ fetch, tokens })`, so tests can pass fakes instead of mocking modules. Pure logic is kept out of files that import `electron`, so it can be tested in plain Node.js.

Commands run through `runCommand`, which uses `execFile` without a shell. Arguments are passed as a list and are never parsed by a shell.

### Signing in

Viewer does not have its own GitHub login. It asks the GitHub CLI for a token with `gh auth token`, keeps it in memory, and asks again if GitHub rejects it. This reuses the account and organization access people already set up for `gh`.

Apps opened from Finder get a minimal `PATH` that does not include Homebrew. The packaged app reads `PATH` from the user's login shell at startup so it can find `gh` and `git`.

## Renderer layout

| Directory                     | Contents                                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| `src/renderer/src/app`        | The layout and the providers for the API and React Query          |
| `src/renderer/src/features`   | One folder per feature, with its components and React Query hooks |
| `src/renderer/src/components` | Small UI pieces shared by features                                |
| `src/renderer/src/lib`        | Framework-free helpers, such as the API client and formatting     |
| `src/renderer/src/styles`     | Design tokens and base styles. Components use CSS Modules         |

Components get the API from `useApi()` instead of reading `window.viewer`, and fetch data through React Query hooks. Tests render components with a fake API through `renderWithApi` in `src/renderer/test/render.tsx`.

## Testing

| Layer                 | Tool                                  | Location                                           |
| --------------------- | ------------------------------------- | -------------------------------------------------- |
| Main and shared logic | Vitest in Node.js                     | `src/main/**/*.test.ts`, `src/shared/**/*.test.ts` |
| React components      | Vitest with jsdom and Testing Library | `src/renderer/**/*.test.tsx`                       |

Tests sit next to the code they cover. Tests use made-up data, such as `octocat/hello-world`, never real repositories.

## Dependencies

All npm packages are `devDependencies`. electron-vite bundles the main, preload, and renderer code, and the packaged app only contains the build output in `out/`. Add a runtime `dependency` only for a package that cannot be bundled, such as a native module.
