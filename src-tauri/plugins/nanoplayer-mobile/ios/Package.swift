// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "tauri-plugin-nanoplayer-mobile",
  platforms: [.iOS(.v16)],
  products: [.library(name: "tauri-plugin-nanoplayer-mobile", type: .static,
    targets: ["tauri-plugin-nanoplayer-mobile"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-nanoplayer-mobile",
    dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
