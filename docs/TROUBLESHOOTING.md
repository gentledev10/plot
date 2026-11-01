# Troubleshooting

[Back to the README](../README.md) · [User guide](GUIDE.md)

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
