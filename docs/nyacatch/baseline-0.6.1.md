# NyaCatch 0.6.1-beta.1 source baseline

Recorded on 2026-11-04. Upstream baseline: MediaGo v3.5.0, commit `74b67101ae0805116673f940c29b84c034926183`.

This checkpoint records the existing NyaCatch implementation: independent branding, six themes and five languages, explicit single/batch download submission, stable resource selection and retry, anonymous public-post adapters, platform evidence, upgrade/diagnostic support, and the three-part local conversion workspace. The product version comes from `APP_BUILD_VERSION`; upstream package versions are independent.

The current local application remains the previously verified, unsigned 0.6.1-beta.1 directory package. Source files were normalized with the existing formatter and an unnecessary conversion-draft array copy was removed. No new runtime behavior or release is claimed by this checkpoint.

## Validation

- Go tests: `go test ./...`.
- TypeScript unit tests: `tsx --test` over `*.test.ts` in the UI, Electron services and shared constants (61 passed).
- TypeScript: `tsc --noEmit` for UI, Electron and preload.
- Production desktop build: eight tasks passed. Scoped lint: 31 warnings, zero errors; existing warnings remain visible and rules were not weakened.
- Native Windows 11 UI: ordinary launch, converter navigation, close/reopen, complete quit with core-port release, and full restart. Original preferences and eight existing downloads were preserved; media was not played.
- Current package version and executable SHA-256 match its existing acceptance manifest.

Windows 10, other devices, and actual Windows display scaling at 125%/150% remain untested. Engine catalog entries and sample parsing results do not establish universal platform or full-download coverage. Public distribution still needs license clarification.

Local reports and the working roadmap live in the parent NyaCatch project, outside this upstream source repository. Binaries, user state, cookies, downloaded media and local configuration backups are excluded from this commit.

The next work item is evidence-based platform reliability: Xiaohongshu share links, Douyin image posts, and batch multi-resource download/retry. New functionality requires its own version and acceptance record.
