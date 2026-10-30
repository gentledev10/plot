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
- Navigation away from the app is blocked. Links with `https://` open in the default browser.
- Permission requests (camera, notifications, and so on) are denied.
- Secrets such as the GitHub token stay in the main process. They never cross IPC.

## Main process layout

| Directory           | Contents                                                                                |
| ------------------- | --------------------------------------------------------------------------------------- |
| `src/main/app`      | Electron glue: window creation, the `app://` protocol, navigation and permission guards |
| `src/main/index.ts` | Composition root. Creates services, wires them together, and opens the window           |

Pure logic is kept out of files that import `electron`, so it can be unit-tested in plain Node.js. For example, path checks for the `app://` protocol live in `navigation.ts`, and `security.ts` only connects them to Electron.

## Testing

| Layer                 | Tool                                  | Location                                           |
| --------------------- | ------------------------------------- | -------------------------------------------------- |
| Main and shared logic | Vitest in Node.js                     | `src/main/**/*.test.ts`, `src/shared/**/*.test.ts` |
| React components      | Vitest with jsdom and Testing Library | `src/renderer/**/*.test.tsx`                       |

Tests sit next to the code they cover.

## Dependencies

All npm packages are `devDependencies`. electron-vite bundles the main, preload, and renderer code, and the packaged app only contains the build output in `out/`. Add a runtime `dependency` only for a package that cannot be bundled, such as a native module.
