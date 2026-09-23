# Android packaging

One APK covers phone and Pad: `app.nanoplayer.android`, minimum API 29, arm64-v8a. Development and emulator testing are active; see [implementation status](../../docs/clients/android/STATUS.md) for missing release gates.

## Local packaging

```sh
pnpm release:android -- --dry-run
pnpm release:android -- --debug
```

The packaging command runs environment checks, frontend/Rust tests, builds the APK, verifies its signature and writes `manifest.json`, `SHA256SUMS` and signature evidence under `artifacts/android/v<version>-b<code>/<variant>/`. No tag, upload or desktop updater metadata is changed.

Root `package.json` controls versionName. `packaging/android/version-code.json` independently controls monotonically increasing Android versionCode (1008 starts after the generated development APK's 1007). Allocate once per Android release and reuse when retrying. Do not derive Android release numbers from desktop tags.

For a release build, supply these environment variables from private local storage/CI; do not store passwords or keys in this repository:

- `NANOPLAYER_ANDROID_KEYSTORE`: absolute keystore path.
- `NANOPLAYER_ANDROID_KEY_ALIAS`.
- `NANOPLAYER_ANDROID_STORE_PASSWORD`.
- `NANOPLAYER_ANDROID_KEY_PASSWORD`.

Then run `pnpm release:android -- --build-only`. A missing key fails before building. The repository does not create or choose a production signing identity. Debug APKs use the SDK debug key and cannot upgrade a differently signed production installation.

## Public-release gates

Phone and Pad physical-device acceptance, format matrix, background/interruptions, source hashes, signed upgrade/data preservation and production certificate verification must pass. Public upload remains disabled; future Android tags are `android/vX.Y.Z-bN`, separate from desktop `vX.Y.Z` and `latest.json`. Do not advertise Android availability on the website until an uploaded artifact has been verified. AAB/Google Play is a later channel and is not claimed by this APK workflow.
