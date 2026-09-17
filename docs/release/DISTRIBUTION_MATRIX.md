# Distribution matrix

Updated: 2026-09-11 · Published version: 0.1.7

| Platform | Published packages | OS signing | Qualification boundary |
| --- | --- | --- | --- |
| macOS 12+ | Universal DMG, `.app.tar.gz` | Unsigned; not notarized | Published; native historical macOS checks exist, full Intel/Apple Silicon hardware qualification remains open |
| Windows 10+ | x64 NSIS `.exe`, English/Chinese WiX `.msi` | Unsigned | Published; full native install/playback/upgrade qualification remains open |
| Linux | x64 AppImage, `.deb`, `.rpm` | Checksums; no repository-signing claim | Published; distribution/runtime and hardware qualification remain open |
| iOS / iPadOS / Android | None | Not applicable | Feasibility analysis only; no mobile build or release |

Minimum OS entries are declared desktop targets, not proof of complete minimum-version testing. Linux compatibility depends on the distribution's WebKitGTK/audio/runtime libraries.

Evidence: [GitHub v0.1.7](https://github.com/maweifeng2024/nanoPlayer/releases/tag/v0.1.7), release API metadata retrieved 2026-09-11, and `website/public/downloads/latest.json`. The eight package names, sizes and SHA-256 values match the API asset digests. This metadata comparison is not a fresh full-binary download or install test.

The Release has 13 assets: eight packages, three `.sig` files, updater `latest.json`, and `SHA256SUMS.txt`. Updater signatures are distinct from OS code signing; the website manifest's `signed: false` does not mean updater signatures are absent.

The website download manifest and the GitHub updater manifest have different schemas. Generate both from actual artifacts using the release scripts; never hand-invent package links or mark a Debug bundle as a published release. macOS universal builds use the target-specific bundle directory; CI collects all target bundle directories recursively.
