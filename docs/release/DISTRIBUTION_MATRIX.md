# Distribution matrix

Updated: 2026-09-22

The repository source and local tag are v0.1.12. The checked-in website download manifest is v0.1.11, so the currently advertised desktop version must be verified from the live release and website before reporting release completion.

| Client/platform | Package or output | Automation | Current qualification boundary |
| --- | --- | --- | --- |
| macOS 12+ | Universal DMG, updater app archive | Tagged desktop GitHub release | OS signing/notarization and complete clean-machine/cross-version qualification remain evidence-dependent |
| Windows 10+ | x64 NSIS `.exe`, English/Chinese WiX `.msi` | Tagged desktop GitHub release | Code signing and full native install/playback/upgrade qualification remain evidence-dependent |
| Linux x64 | AppImage, `.deb`, `.rpm` | Tagged desktop GitHub release | Distribution/runtime and hardware qualification remain evidence-dependent |
| Android 10+ phone/Pad | arm64 APK | Local `release:android` packaging | Debug signing verified historically; production signing, physical devices, AAB/store and public upload are not complete |
| iOS/iPadOS | None | None | Planning only; no native project, command, signing, artifact, or release |
| Website | Static product/download site | Desktop publication workflow | Must be generated from verified published assets; never hand-edit download claims |

Desktop updater signatures are distinct from operating-system code signing. Android signatures and build numbers are independent of the desktop updater manifest. A future iOS package will likewise require its own monotonic build number and signing verification while sharing the root product version.

Generate download metadata and checksums from actual artifacts. Never advertise a debug package, an older artifact path, or a planned client as a current release.
