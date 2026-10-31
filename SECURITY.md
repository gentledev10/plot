# Security Policy

Viewer renders pull requests written by other people and passes them to AI tools on your machine. We take reports about ways to abuse that seriously.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/gentledev10/viewer/security/advisories/new). Please include the steps to reproduce, the impact you expect, and the app version.

You can expect a first response within a week.

## What we care about most

- Pull request content or AI output that runs script in the app window.
- Anything that leaks a GitHub token, writes one to disk unencrypted, sends one to a server other than the one it belongs to, or lets the renderer reach privileged main-process features it should not.
- Ways to make AI tools that Viewer launches modify files, run commands, reach the network, or read files outside the pull request.

The security model is described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#trust-boundaries).
