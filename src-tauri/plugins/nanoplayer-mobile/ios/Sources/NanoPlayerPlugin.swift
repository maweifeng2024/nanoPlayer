import AVFoundation
import AVKit
import Foundation
import MediaPlayer
import Tauri
import UIKit
import UniformTypeIdentifiers
import WebKit

struct NativeArgs: Decodable {
  var action: String
  var uri: String?
  var mode: String?
  var kind: String?
  var queue: String?
  var index: Int?
  var positionMs: Double?
  var enabled: Bool?
  var repeatMode: Int?
  var volume: Float?
  var minutes: Int?
  var finishTrack: Bool?
  var events: String?
  var color: String?
  var light: Bool?
  var sourceId: String?
  var relativePath: String?
  var target: String?
  var name: String?
  var location: String?
  var paths: [String]?
  var indexAll: Bool?
  var skip: Bool?
  var confirmed: Bool?
}

/// Owns all audio and authorization outside the WebView lifecycle.
class NanoPlayerPlugin: Plugin, UIDocumentPickerDelegate {
  private let media = NativePlayer()
  private var pickerInvoke: Invoke?
  private var pickerMode = DocumentSelectionMode.copy
  private var pickerKind = "music"
  private var pickerTarget = "收件箱"
  private var pickerSourceKind = "files"
  private var pickerLabel = ""
  private var pickerLocation = ""
  private var pickerReplacing: String?
  private var pickerSkip = false
  private struct ReferenceDraft {
    let url: URL
    let bookmark: Data
    let kind: String
    let label: String
    let location: String
    let replacing: String?
  }
  private var referenceDrafts: [String: ReferenceDraft] = [:]
  private var grants: [String: URL] = [:]
  private let worker = DispatchQueue(label: "app.nanoplayer.ios.documents", qos: .utility)
  private let files = FileManager.default
  private var wifi: WifiReceiver?
  private weak var webview: WKWebView?
  private let libraryResult: Result<NativeLibrary, Error>
  private var imported: URL {
    files.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Music", isDirectory: true)
  }

  override init() {
    libraryResult = Result {
      try NativeLibrary(managed: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Music"),
        support: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0])
    }
    super.init()
    try? files.createDirectory(at: imported, withIntermediateDirectories: true)
    let saved = UserDefaults.standard.dictionary(forKey: "nanoplayer.folderBookmarks") ?? [:]
    for (path, value) in saved {
      guard let data = value as? Data else { continue }
      var stale = false
      if let url = try? URL(resolvingBookmarkData: data, options: [],
        relativeTo: nil, bookmarkDataIsStale: &stale), url.startAccessingSecurityScopedResource() {
        grants[path] = url
        if stale { saveGrant(url) }
      }
    }
    if let library = try? libraryResult.get(), let rules = try? library.participationRules() { media.applyLibrarySelection(rules) }
    NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification,
      object: nil, queue: .main) { [weak self] _ in self?.wifi?.stop() }
  }

  override func load(webview: WKWebView) {
    self.webview = webview
    webview.isOpaque = false
    let gesture = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(backGesture(_:)))
    gesture.edges = .left
    webview.addGestureRecognizer(gesture)
  }

  @objc private func backGesture(_ gesture: UIScreenEdgePanGestureRecognizer) {
    guard gesture.state == .ended, gesture.translation(in: webview).x > 70 else { return }
    // Preserve the existing mobile back event contract and layer close order.
    webview?.evaluateJavaScript("window.dispatchEvent(new Event('android-back', {cancelable:true}))")
  }

  @objc public func dispatch(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(NativeArgs.self)
    if args.action == "stageOpen" {
      worker.async {
        do {
          let directory = try self.libraryResult.get().support.appendingPathComponent("OpenRequests")
          try self.files.createDirectory(at: directory, withIntermediateDirectories: true)
          for path in args.paths ?? [] {
            guard let url = URL(string: path), url.isFileURL, NativeLibrary.audio(url) else { continue }
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let batch = directory.appendingPathComponent(UUID().uuidString)
            try self.files.createDirectory(at: batch, withIntermediateDirectories: false)
            let staging = batch.appendingPathComponent(".staging")
            var coordination: NSError?, error: Error?
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordination) { readable in
              do {
                let digest = try NativeLibrary.digest(readable)
                try self.files.copyItem(at: readable, to: staging)
                guard digest == (try NativeLibrary.digest(staging)), digest == (try NativeLibrary.digest(readable)) else {
                  throw NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "打开文件复制校验失败"])
                }
                try self.files.moveItem(at: staging, to: batch.appendingPathComponent(url.lastPathComponent))
              } catch let cause { error = cause }
            }
            if let error = coordination ?? error as NSError? { try? self.files.removeItem(at: batch); throw error }
          }
          invoke.resolve([:])
        } catch { invoke.reject(error.localizedDescription) }
      }
      return
    }
    DispatchQueue.main.async { [self] in
      do {
        switch args.action {
        case "pickTree", "pickFile":
          guard pickerInvoke == nil else { invoke.reject("文件选择器已打开"); return }
          if args.action == "pickTree", DocumentSelectionMode(rawValue: args.mode ?? "") == nil {
            invoke.reject("请明确选择只读引用或复制导入"); return
          }
          for item in referenceDrafts.values { item.url.stopAccessingSecurityScopedResource() }
          referenceDrafts.removeAll()
          pickerInvoke = invoke
          pickerMode = DocumentSelectionMode(rawValue: args.mode ?? "") ?? .copy
          pickerKind = args.action == "pickFile" ? (args.kind ?? "lyrics") : "music"
          pickerTarget = args.target ?? "收件箱"
          pickerSourceKind = args.kind == "app" ? "app" : "files"
          pickerLabel = args.name ?? ""
          pickerLocation = args.location ?? ""
          pickerReplacing = args.sourceId
          pickerSkip = args.skip == true
          let types: [UTType] = pickerKind == "lyrics" ? [.plainText, .data]
            : pickerKind == "cover" ? [.image] : pickerMode == .reference ? [.folder] : [.folder, .audio]
          let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: false)
          picker.allowsMultipleSelection = pickerKind == "music" && pickerMode != .reference
          picker.delegate = self
          guard let controller = manager.viewController else {
            pickerInvoke = nil; invoke.reject("无法打开文件选择器"); return
          }
          controller.present(picker, animated: true)
        case "libraryCancelReference":
          if let draft = referenceDrafts.removeValue(forKey: args.sourceId ?? "") { draft.url.stopAccessingSecurityScopedResource() }
          invoke.resolve([:])
        case "libraryCommitReference":
          guard let draft = referenceDrafts.removeValue(forKey: args.sourceId ?? "") else { invoke.reject("文件授权已取消，请重新选择"); return }
          worker.async {
            do {
              let library = try self.libraryResult.get()
              let previous = try draft.replacing.map { try library.source($0).uri }
              let existing = library.sources.contains { URL(fileURLWithPath: $0.uri).resolvingSymlinksInPath() == draft.url.resolvingSymlinksInPath() }
              let source = try library.register(draft.url, kind: draft.kind, label: draft.label, location: draft.location, replacing: draft.replacing)
              if !existing, draft.replacing == nil, let name = args.name, !name.isEmpty { try library.editSource(source.id, name: name, indexPaths: nil) }
              DispatchQueue.main.async {
                var saved = UserDefaults.standard.dictionary(forKey: "nanoplayer.folderBookmarks") ?? [:]
                saved[draft.url.path] = draft.bookmark
                if let previous, previous != draft.url.path {
                  self.grants.removeValue(forKey: previous)?.stopAccessingSecurityScopedResource(); saved.removeValue(forKey: previous)
                }
                UserDefaults.standard.set(saved, forKey: "nanoplayer.folderBookmarks")
                if self.grants[draft.url.path] == nil { self.grants[draft.url.path] = draft.url }
                else { draft.url.stopAccessingSecurityScopedResource() }
                invoke.resolve(["uri": source.uri, "sourceId": source.id])
              }
            } catch { draft.url.stopAccessingSecurityScopedResource(); invoke.reject(error.localizedDescription) }
          }
        case "authorizePath":
          let path = args.uri ?? ""
          let url = URL(fileURLWithPath: path).resolvingSymlinksInPath()
          guard url == imported.resolvingSymlinksInPath() || grants.values.contains(where: {
            $0.resolvingSymlinksInPath() == url
          }) else { invoke.reject("目录未授权，请重新选择文件夹"); return }
          worker.async {
            do {
              let library = try self.libraryResult.get()
              let source = library.sources.first { URL(fileURLWithPath: $0.uri).resolvingSymlinksInPath() == url }
              var result: [String: Any] = ["uri": url.path]
              result["name"] = source?.name ?? url.lastPathComponent
              result["indexPaths"] = source?.indexPaths as Any? ?? NSNull()
              invoke.resolve(result)
            } catch { invoke.reject(error.localizedDescription) }
          }
        case "restorePaths":
          var mappings: [String: String] = [:]
          if let previous = UserDefaults.standard.string(forKey: "nanoplayer.importedPath"), previous != imported.path {
            mappings[previous] = imported.path
          }
          for (previous, url) in grants where previous != url.path { mappings[previous] = url.path }
          media.rebasePaths(mappings)
          // Rust acknowledges the mapping after its transaction commits.
          invoke.resolve(mappings)
        case "acknowledgePaths":
          UserDefaults.standard.set(imported.path, forKey: "nanoplayer.importedPath")
          var saved: [String: Data] = [:]
          var resolved: [String: URL] = [:]
          for url in grants.values {
            saved[url.path] = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            resolved[url.path] = url
          }
          grants = resolved
          UserDefaults.standard.set(saved, forKey: "nanoplayer.folderBookmarks")
          invoke.resolve([:])
        case "removeTree":
          if let path = args.uri, let url = grants.removeValue(forKey: path) {
            url.stopAccessingSecurityScopedResource()
            var saved = UserDefaults.standard.dictionary(forKey: "nanoplayer.folderBookmarks") ?? [:]
            saved.removeValue(forKey: path)
            UserDefaults.standard.set(saved, forKey: "nanoplayer.folderBookmarks")
          }
          worker.async {
            do {
              let library = try self.libraryResult.get()
              if let source = library.sources.first(where: { $0.uri == args.uri && $0.kind != "managed" }) {
                try library.removeSource(source.id)
              }
              invoke.resolve([:])
            } catch { invoke.reject(error.localizedDescription) }
          }
        case "libraryForget":
          worker.async {
            do {
              let library = try self.libraryResult.get()
              let source = try library.source(args.sourceId ?? "")
              guard source.kind != "managed" else {
                invoke.reject("不能移除 nanoPlayer 管理区"); return
              }
              try library.removeSource(source.id)
              DispatchQueue.main.async {
                self.grants.removeValue(forKey: source.uri)?.stopAccessingSecurityScopedResource()
                var saved = UserDefaults.standard.dictionary(forKey: "nanoplayer.folderBookmarks") ?? [:]
                saved.removeValue(forKey: source.uri)
                UserDefaults.standard.set(saved, forKey: "nanoplayer.folderBookmarks")
                invoke.resolve([:])
              }
            } catch { invoke.reject(error.localizedDescription) }
          }
        case "deviceInfo":
          invoke.resolve(["versionName": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
            "versionCode": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "",
            "tablet": UIDevice.current.userInterfaceIdiom == .pad])
        case "audioSettings":
          guard let controller = manager.viewController else { invoke.reject("音频面板不可用"); return }
          let picker = AVRoutePickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
          controller.view.addSubview(picker)
          (picker.subviews.first(where: { $0 is UIButton }) as? UIButton)?.sendActions(for: .touchUpInside)
          DispatchQueue.main.asyncAfter(deadline: .now() + 2) { picker.removeFromSuperview() }
          invoke.resolve([:])
        case "wifiStart":
          wifi?.stop()
          worker.async {
            do {
              let library = try self.libraryResult.get()
              let rootId = try library.directoryID("")
              let initialId = try library.directoryID(args.target ?? "收件箱")
              DispatchQueue.main.async {
                let receiver = WifiReceiver(directory: self.imported) { [weak self] action, values, completion in
                  guard let self else { return }
                  DispatchQueue.main.async {
                    let write = !["list", "uploadTarget"].contains(action)
                    if write && !self.media.canRelocate([self.imported.path]) {
                      completion(.failure(NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "请先暂停播放再编辑目录"]))); return
                    }
                    self.worker.async {
                      do { completion(.success(try self.libraryResult.get().browserCommand(action, values: values, rootId: rootId, initialId: initialId))) }
                      catch { completion(.failure(error)) }
                    }
                  }
                }
                self.wifi = receiver
                receiver.start { result in
                  switch result {
                  case .success(var info): info["uri"] = self.imported.path; invoke.resolve(info)
                  case .failure(let error): invoke.reject(error.localizedDescription)
                  }
                }
              }
            } catch { invoke.reject(error.localizedDescription) }
          }
        case "wifiStatus":
          var info = wifi?.snapshot() ?? ["active": false]; info["uri"] = imported.path; invoke.resolve(info)
        case "wifiStop":
          var info = wifi?.stop() ?? ["active": false]; info["uri"] = imported.path; invoke.resolve(info)
        case "systemBars":
          if let color = args.color, color.count == 7, color.first == "#",
            let rgb = UInt32(color.dropFirst(), radix: 16) {
            let surface = UIColor(red: CGFloat((rgb >> 16) & 255) / 255,
              green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1)
            webview?.backgroundColor = surface
            manager.viewController?.view.backgroundColor = surface
            manager.viewController?.overrideUserInterfaceStyle = args.mode == "system"
              ? .unspecified : (args.light == true ? .light : .dark)
            manager.viewController?.setNeedsStatusBarAppearanceUpdate()
          }
          invoke.resolve([:])
        case "background": invoke.resolve([:])
        case "librarySources", "libraryBrowse", "libraryCreate", "libraryMove", "libraryRename", "libraryOpened", "librarySaveOpened",
          "libraryCopy", "libraryEdit", "libraryIndex", "librarySelect", "libraryInitializeSelection", "libraryTrash", "libraryRestore", "libraryPurge", "libraryDiscardOpened", "libraryDeleteEmpty", "libraryPendingMoves", "libraryAckMoves", "libraryRebase":
          if ["libraryMove", "libraryRename", "libraryTrash", "libraryRestore", "libraryPurge"].contains(args.action) {
            guard wifi?.snapshot()["active"] as? Bool != true else { invoke.reject("请先停止 Wi-Fi 接收"); return }
            let moving = (args.action == "libraryTrash" ? [args.relativePath ?? ""] : args.paths ?? [args.relativePath ?? ""]).map { imported.appendingPathComponent($0).standardizedFileURL.path }
            guard media.canRelocate(moving) else { invoke.reject("请先暂停正在播放的歌曲再移动"); return }
          }
          let authorized = Array(grants.values)
          worker.async {
            do {
              let result = try self.libraryCommand(args, authorized: authorized)
              let rules = try self.libraryResult.get().participationRules()
              DispatchQueue.main.async { self.media.applyLibrarySelection(rules); invoke.resolve(result) }
            }
            catch { invoke.reject(error.localizedDescription) }
          }
        default:
          try media.command(args, allowed: { [self] path in
            let url = URL(fileURLWithPath: path).resolvingSymlinksInPath()
            return ([imported] + Array(grants.values)).contains { root in
              let base = root.resolvingSymlinksInPath().path + "/"
              return url.path.hasPrefix(base)
            }
          })
          invoke.resolve(media.snapshot())
        }
      } catch { invoke.reject(error.localizedDescription) }
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    pickerInvoke?.resolve([:]); pickerInvoke = nil
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let invoke = pickerInvoke else { return }
    pickerInvoke = nil
    if pickerMode == .reference && pickerKind == "music" {
      guard let url = urls.first, url.startAccessingSecurityScopedResource() else {
        invoke.reject("无法取得文件夹授权"); return
      }
      do {
        // Keep the security scope, but create no catalog entry or index before confirmation.
        let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
        let token = UUID().uuidString
        referenceDrafts[token] = ReferenceDraft(url: url, bookmark: bookmark, kind: pickerSourceKind,
          label: pickerLabel, location: pickerLocation, replacing: pickerReplacing)
        invoke.resolve(["referenceToken": token, "name": url.lastPathComponent, "location": pickerLocation])
      } catch { url.stopAccessingSecurityScopedResource(); invoke.reject(error.localizedDescription) }
      return
    }
    let kind = pickerKind
    let target = pickerTarget
    let skip = pickerSkip
    worker.async { [self] in
      do {
        if kind == "music" {
          let accesses = urls.map { $0.startAccessingSecurityScopedResource() }
          defer { for (url, access) in zip(urls, accesses) where access { url.stopAccessingSecurityScopedResource() } }
          invoke.resolve(try libraryResult.get().copy(urls, target: target, skip: skip))
          return
        }
        var copied: URL?
        for source in urls {
          let access = source.startAccessingSecurityScopedResource()
          defer { if access { source.stopAccessingSecurityScopedResource() } }
          let directory = kind == "music" ? imported : files.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("Picked")
          try files.createDirectory(at: directory, withIntermediateDirectories: true)
          let destination = directory.appendingPathComponent(UUID().uuidString + "-" + source.lastPathComponent)
          var coordinationError: NSError?
          var copyError: Error?
          NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordinationError) { readable in
            do { try files.copyItem(at: readable, to: destination) } catch { copyError = error }
          }
          if let error = coordinationError ?? copyError as NSError? { throw error }
          copied = destination
        }
        if kind == "music" { invoke.resolve(["uri": imported.path]) }
        else { invoke.resolve(copied.map { ["path": $0.path] } ?? [:]) }
      } catch { invoke.reject(error.localizedDescription) }
    }
  }

  private func saveGrant(_ url: URL) { try? saveGrantThrowing(url) }
  private func saveGrantThrowing(_ url: URL) throws {
    let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
    var saved = UserDefaults.standard.dictionary(forKey: "nanoplayer.folderBookmarks") ?? [:]
    saved[url.path] = bookmark
    UserDefaults.standard.set(saved, forKey: "nanoplayer.folderBookmarks")
  }


  private func libraryCommand(_ args: NativeArgs, authorized: [URL]) throws -> [String: Any] {
    let library = try libraryResult.get()
    let sourceId = args.sourceId ?? "managed"
    if ["libraryBrowse", "libraryCopy", "libraryIndex"].contains(args.action) {
      let source = try library.source(sourceId)
      guard source.kind == "managed" || authorized.contains(where: { $0.path == source.uri }) else {
        throw NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "目录未授权，请重新选择文件夹"])
      }
    }
    switch args.action {
    case "libraryDiscardOpened":
      let pending = library.support.appendingPathComponent("OpenRequests")
      if files.fileExists(atPath: pending.path) { try files.removeItem(at: pending) }
      return [:]
    case "libraryInitializeSelection":
      let data = Data((args.events ?? "{}").utf8)
      try library.initializeParticipation(JSONDecoder().decode([String: Bool].self, from: data))
      return try library.managementSnapshot()
    case "librarySelect":
      try library.setParticipation(sourceId, enabled: args.enabled == true, confirmAll: args.confirmed == true)
      return try library.managementSnapshot()
    case "libraryTrash": return try library.trashDirectory(args.relativePath ?? "")
    case "libraryRestore": return try library.restoreTrash(sourceId, target: args.target)
    case "libraryPurge": try library.purgeTrash(sourceId); return [:]
    case "libraryOpened", "librarySaveOpened":
      let pending = library.support.appendingPathComponent("OpenRequests")
      let folders = (try? files.contentsOfDirectory(at: pending, includingPropertiesForKeys: nil)) ?? []
      let urls = folders.flatMap { (try? files.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil)) ?? [] }.filter(NativeLibrary.audio)
      if args.action == "libraryOpened" { return ["count": urls.count, "names": urls.map(\.lastPathComponent)] }
      let result = try library.copy(urls, target: args.target ?? "收件箱", skip: args.skip == true)
      for row in result["results"] as? [[String: Any]] ?? [] where row["success"] as? Bool == true || row["skipped"] as? Bool == true {
        if let path = row["input"] as? String, let url = urls.first(where: { $0.path == path }) { try files.removeItem(at: url.deletingLastPathComponent()) }
      }
      return result
    case "librarySources":
      // Migrate existing bookmarks into durable source records without touching audio.
      for url in authorized where !library.sources.contains(where: { $0.uri == url.path }) {
        _ = try library.register(url, kind: "files", label: "", location: "", legacy: true)
      }
      var result = try library.snapshot()
      let management = try library.managementSnapshot()
      for (key, value) in management { result[key] = value }
      result["trashPaths"] = library.trashPaths()
      if var sources = result["sources"] as? [[String: Any]] {
        for i in sources.indices where sources[i]["kind"] as? String != "managed" {
          sources[i]["authorized"] = authorized.contains { $0.path == sources[i]["uri"] as? String }
        }
        result["sources"] = sources
      }
      return result
    case "libraryBrowse": return try library.browse(sourceId, relative: args.relativePath ?? "", foldersOnly: args.kind == "folders")
    case "libraryCreate":
      guard sourceId == "managed" else { throw NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "外部来源只读"]) }
      return try library.createFolder(parent: args.relativePath ?? "", name: args.name ?? "")
    case "libraryMove", "libraryRename", "libraryDeleteEmpty":
      guard sourceId == "managed" else { throw NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "外部来源只读"]) }
      if args.action == "libraryDeleteEmpty" { try library.deleteEmpty(args.relativePath ?? ""); return [:] }
      let relative = args.relativePath ?? ""
      let parent = relative.split(separator: "/").dropLast().joined(separator: "/")
      return try library.move(paths: args.action == "libraryRename" ? [relative] : args.paths ?? [],
        target: args.action == "libraryRename" ? parent : args.target ?? "", rename: args.action == "libraryRename" ? args.name : nil, skip: args.skip == true)
    case "libraryCopy":
      return try library.copy((args.paths ?? []).map { try library.path(sourceId: sourceId, relative: $0) }, target: args.target ?? "收件箱", skip: args.skip == true)
    case "libraryEdit": try library.editSource(sourceId, name: args.name, indexPaths: nil)
    case "libraryIndex": try library.editSource(sourceId, name: nil, indexPaths: args.indexAll == true ? nil : args.paths ?? [], setIndex: true)
    case "libraryPendingMoves": return try library.pendingMoves()
    case "libraryAckMoves": try library.acknowledgeMoves()
    case "libraryRebase":
      let data = (args.events ?? "{}").data(using: .utf8)!
      let mappings = try JSONDecoder().decode([String: String].self, from: data)
      try library.rebase(mappings)
      DispatchQueue.main.async { self.media.rebasePaths(mappings) }
    default: break
    }
    return try library.snapshot()
  }
}

@_cdecl("init_plugin_nanoplayer_mobile")
func initPlugin() -> Plugin { NanoPlayerPlugin() }
