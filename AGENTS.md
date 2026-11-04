# Repository instructions

## English authoring policy

- Write project-authored code, identifiers, comments, developer documentation, test names, pull request text, and commit subjects and bodies in English.
- Preserve Korean application support. Genuine localization values, native language names, language-classification vocabulary, localized support fixtures/assertions, Unicode input/paths, and verbatim upstream input or legal notices are intentional exceptions, not prose to translate globally.
- Never exempt entire test files or directories, and never allowlist Korean developer comments or documentation to bypass the policy. Review exceptions at the exact-line level in `scripts/check-language-allowlist.json`, including new values in `src/shared/translations.ts`.
- Run `npm run check:language` and `npm run test:language` after changing source text, localization exceptions, or language gates. `npm run lint` runs both before Biome. The Hangul check is a regression guard, not a general English-language detector; review other authored prose manually.
- Preserve historical Git commits. Check new commit messages with `.githooks/commit-msg` or `npm run check:commit-language -- --base BASE_SHA --head HEAD_SHA`. Do not change global/shared Git configuration or automatically install hooks for other worktrees. See `CONTRIBUTING.md` for per-command hook activation.
