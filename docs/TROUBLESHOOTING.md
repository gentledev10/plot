# Troubleshooting

[Back to the README](../README.md) · [User guide](GUIDE.md)

## `Electron uninstall` when running from source

This error from `electron-vite` means it cannot find Electron's runtime path file. It does not mean you need to uninstall Plot. Electron 42 and later no longer download the runtime during dependency installation; they normally download it on first use. The version of `electron-vite` used here looks for the path file directly instead of triggering that download.

Plot explicitly runs the local Electron installer's `install-electron` command after `npm ci` / `npm install` and before `npm run dev` / `npm run preview`. An existing runtime is reused. If you installed dependencies with `--ignore-scripts`, the normal development or preview command still performs the setup unless you also disable its pre-hooks.

To repair an existing checkout, run:

```sh
npm run setup:electron
npm run dev
```

On an older checkout without `setup:electron`, use the installer already supplied by the Electron dependency (the `--no` flag prevents npm from installing an unrelated package):

```sh
npx --no install-electron
npm run dev
```

If setup fails, read the download or extraction error above the npm error summary. Check network access to Electron's GitHub release downloads, corporate proxy settings, free disk space and permissions. Do not disable TLS verification. See Electron's [installation guide](https://www.electronjs.org/docs/latest/tutorial/installation) for supported download and proxy configuration. Setup failures stop startup rather than hiding the cause behind `Electron uninstall`.

Use macOS 13+ and Node.js 22.12+. Do not copy `node_modules` from another machine or CPU architecture; install dependencies on the target Mac with `npm ci`. Windows and Linux are not supported by Plot.

## I only want to read local changes

Choose **Open a local folder…** on the start screen, or **Local changes → Choose a folder…**. No GitHub sign-in or AI tool is required. The folder must be a Git repository. Install Git (or the Xcode Command Line Tools) if it is not available.

## The app asks for a one-time GitHub code

This is expected in source builds without the OAuth client secret. Paste the code on the GitHub page Plot opens. A personal access token or an existing GitHub CLI sign-in also works. Never post these credentials in an issue.

## My company account cannot connect in the browser

Choose GitHub.com for GitHub Enterprise Cloud accounts on github.com. Choose **Company server** for GitHub Enterprise Server or GHE.com, and use the GitHub CLI or a token. Browser sign-in is supported only on github.com. See [Connecting GitHub](GUIDE.md#connecting-github).

## AI is unavailable

Open **Settings → AI overview** and check the installed tool and sign-in status. Claude Code must be 2.1.248 or later; keep Codex CLI up to date. If a model is unavailable, reload the model list and select one available to the chosen sign-in. GitHub sign-in does not sign you in to an AI provider.

## A saved overview differs from my current settings

Changing review instructions, detail or custom steps does not call AI automatically. The previous result stays readable; choose **Generate again** to apply the new instructions. Model/provider usage may be billable. Reordering, hiding or collapsing cards reuses the existing result.

## A diagram or explanation looks wrong

AI output needs human review. Plot verifies referenced paths and line numbers, not the truth of the explanation. Check the displayed evidence and analysis scope. Before-side diagrams do not link to current code. Fit to panel shows the whole diagram; Readable size preserves label size with scrolling.

## Where are the installer and Homebrew package?

The first signed and notarized release is being prepared. Until it is published, use the source setup in the [README](../README.md#get-started). Do not assume a similarly named Homebrew package belongs to Plot. Distribution work is documented in [RELEASING.md](RELEASING.md).
