# Releasing Plot for macOS

## Current status

The first public release is pending Developer ID Application signing and Apple notarization. Local Apple Development identities cannot replace the distribution identity. Do not publish an unsigned app as a signed release, or advertise a Homebrew installation before the release and tap are reachable.

The app requires macOS 13+. Packages are produced for Apple Silicon (`arm64`) and Intel (`x64`). A package build is not evidence of a runtime test on both architectures: test the native app on each architecture before claiming both are verified.

## Local package preview

```sh
npm ci
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --x64 --publish never
npm run release:prepare
```

This is an unsigned/ad-hoc preview for local verification, not a notarized public release. macOS Gatekeeper will reject it for normal downloaded distribution. Do not disable Gatekeeper or strip quarantine to make a release appear valid.

The output includes `Plot-<version>-arm64.dmg`, `Plot-<version>-x64.dmg`, ZIP equivalents, `SHA256SUMS.txt` and `dist/homebrew/Casks/plot.rb`. Checksums are generated from the actual files; never copy hashes from an earlier build.

## Signed release workflow

Before running `.github/workflows/release.yml`, configure repository secrets through GitHub's settings:

| Secret                 | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| `MAC_CSC_LINK`         | Base64-encoded Developer ID Application certificate exported as `.p12` |
| `MAC_CSC_KEY_PASSWORD` | Password protecting that `.p12`                                        |
| `APPLE_API_KEY_BASE64` | Base64-encoded compatible App Store Connect API private key (`.p8`)    |
| `APPLE_API_KEY_ID`     | Key ID of that API key                                                 |
| `APPLE_API_ISSUER`     | Issuer ID of that API key                                              |
| `APPLE_TEAM_ID`        | Team that issued the Developer ID certificate                          |

Use existing compatible credentials where possible. Do not commit private keys, certificates, passwords or exports. The App Store Connect upload key used by iOS projects does not itself provide a Developer ID signing identity. Creating or changing Apple credentials is a separate account action.

A compatible existing API key can authenticate to Apple's notarization service as well as App Store Connect. Confirm its team, permissions and current validity before reusing it; do not create another key merely because this repository has no secrets yet. Keep local credential copies outside Git with file mode `0600`. The workflow decodes the API key into a restricted temporary file, passes its path to electron-builder, and removes it even if the release fails. It does not require an Apple account password or app-specific password.

The optional repository variable `MAIN_VITE_GITHUB_CLIENT_ID` and secret `MAIN_VITE_GITHUB_CLIENT_SECRET` enable browser sign-in with automatic return. Without them the app uses GitHub's one-time device code. The desktop OAuth secret is not a confidential client credential; see [ARCHITECTURE.md](ARCHITECTURE.md#accounts-and-signing-in).

1. Update `package.json` and the lockfile version together; add `docs/releases/v<version>.md`.
2. Run the local checks from [CONTRIBUTING.md](../CONTRIBUTING.md).
3. Push the release commit and a matching `v<version>` tag, or manually run **macOS release** against the intended commit.
4. The workflow checks credentials, builds both architectures, signs and notarizes, verifies signatures and stapled tickets, and smoke-tests the runner's native packaged app.
5. It creates a **draft** GitHub Release with the DMGs, ZIPs, checksums and generated cask. Existing published releases are never overwritten.
6. Check clean installation, GitHub sign-in, local changes and optional AI on representative Macs. Verify downloaded checksums and Gatekeeper assessment.
7. Publish the reviewed draft, then publish the exact generated cask in the tap. Update the README and troubleshooting page to replace the pending-distribution text with the verified download and installation commands.

## Homebrew distribution

A maintained tap is the initial distribution route. Create the public repository `gentledev10/homebrew-tap` and put the generated `plot.rb` at `Casks/plot.rb` only after its referenced release is public. No new repository has been created as part of this local setup.

Validate it with Homebrew before announcing availability:

```sh
brew tap gentledev10/tap
brew trust --cask gentledev10/tap/plot
brew style --cask gentledev10/tap/plot
brew audit --cask --online gentledev10/tap/plot
brew install --cask gentledev10/tap/plot
```

Users can then install with `brew install --cask gentledev10/tap/plot`, and update with `brew update` followed by `brew upgrade --cask gentledev10/tap/plot`. Fully qualified installation trusts that cask; commands such as `brew audit` need explicit cask trust first on Homebrew 6+. See [Tap Trust](https://docs.brew.sh/Tap-Trust). Plot does not currently have an in-app updater. Normal uninstall retains preferences; `brew uninstall --cask --zap gentledev10/tap/plot` also deletes the app's saved data.

Submitting to the official `homebrew/cask` repository is separate and must meet its acceptance and Gatekeeper requirements. A project tap does not imply official Homebrew approval.

References: [Homebrew taps](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap), [Cask Cookbook](https://docs.brew.sh/Cask-Cookbook), [Acceptable Casks](https://docs.brew.sh/Acceptable-Casks), [electron-builder v26 notarization](https://www.electron.build/v26/docs/features/code-signing/notarization/).
