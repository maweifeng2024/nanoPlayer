# Client lifecycle matrix

| Surface | Role | Implementation | Development/build | Release |
| --- | --- | --- | --- | --- |
| Desktop (macOS/Windows/Linux) | Primary installable client | Implemented | Shared frontend + Rust/Tauri | Automated tagged GitHub release |
| Android phone/Pad | Mobile installable client | Implemented, qualification incomplete | Shared frontend/Rust + Android native media/SAF integration | Local verified APK only; no public Android publication |
| iOS/iPadOS | Future mobile client | Not implemented | Architecture preparation only | Not available |
| Website | Product/download surface | Implemented | Independent site build | Deployed as part of the desktop release flow |

Each installable client uses the root package version as the shared product version. Platform stores and package managers may additionally require a monotonic client build number. Current commands and unsupported stages are listed in each client directory; do not infer availability from a planned command name.
