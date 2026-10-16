import Foundation
import CryptoKit

private func failure(_ message: String) -> NSError {
  NSError(domain: "nanoPlayer.Library", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

enum DocumentSelectionMode: String { case reference, copy }

struct LibrarySource: Codable {
  var id: String
  var kind: String
  var name: String
  var originalName: String
  var location: String
  var uri: String
  var indexPaths: [String]?
  var previousUri: String?
}

struct ManagedDirectory: Codable {
  var id: String
  var path: String
  var enabled: Bool?
  var identity: String?
}
private struct TrashRecord: Codable {
  var id: String
  var path: String
  var stored: String
  var pending: Bool?
  var restoring: String?
}
private struct LibraryMove: Codable {
  var from: String
  var to: String
}
private struct LibraryCatalog: Codable {
  var schemaVersion = 1
  var sources: [LibrarySource]
}

/// Only this store may mutate Documents/Music. Authorized external roots are read-only.
/// Access is serialized by the plugin's documents worker; records live outside Music.
final class NativeLibrary {
  let managed: URL
  let support: URL
  private let fm = FileManager.default
  private(set) var sources: [LibrarySource] = []
  private var moves: [LibraryMove] = []
  private var directories: [ManagedDirectory] = []
  private var sourceEnabled: [String: Bool] = [:]
  private var selectionInitialized = false
  private var trash: [TrashRecord] = []
  private(set) var revision = 0
  private var stateFile: URL { support.appendingPathComponent("library-management.json") }
  private struct Management: Codable {
    var schemaVersion = 1
    var directories: [ManagedDirectory]
    var enabled: [String: Bool]
    var trash: [TrashRecord]
    var selectionInitialized: Bool?
  }
  private func saveManagement() throws {
    try JSONEncoder().encode(Management(directories: directories, enabled: sourceEnabled, trash: trash, selectionInitialized: selectionInitialized))
      .write(to: stateFile, options: .atomic)
    revision += 1
  }
  private var sourceFile: URL { support.appendingPathComponent("library-sources.json") }
  private var moveFile: URL { support.appendingPathComponent("library-moves.json") }

  init(managed: URL, support: URL) throws {
    self.managed = managed.standardizedFileURL
    self.support = support.standardizedFileURL
    try fm.createDirectory(at: managed, withIntermediateDirectories: true)
    try fm.createDirectory(at: support, withIntermediateDirectories: true)
    if fm.fileExists(atPath: sourceFile.path) {
      let data = try Data(contentsOf: sourceFile)
      if let legacy = try? JSONDecoder().decode([LibrarySource].self, from: data) { sources = legacy }
      else {
        let catalog = try JSONDecoder().decode(LibraryCatalog.self, from: data)
        guard catalog.schemaVersion == 1 else { throw failure("资源库配置版本较新，请升级 nanoPlayer") }
        sources = catalog.sources
      }
    }
    if fm.fileExists(atPath: moveFile.path) {
      moves = try JSONDecoder().decode([LibraryMove].self, from: Data(contentsOf: moveFile))
    }
    for leftover in (try? fm.contentsOfDirectory(at: support, includingPropertiesForKeys: nil)) ?? [] where leftover.lastPathComponent.hasPrefix(".copy-") {
      try fm.removeItem(at: leftover)
    }
    if fm.fileExists(atPath: stateFile.path) {
      let state = try JSONDecoder().decode(Management.self, from: Data(contentsOf: stateFile))
      guard state.schemaVersion == 1 else { throw failure("资源库管理配置版本较新，请升级") }
      directories = state.directories; sourceEnabled = state.enabled; trash = state.trash
      selectionInitialized = state.selectionInitialized == true
    }
    if !sources.contains(where: { $0.id == "managed" }) {
      sources.insert(LibrarySource(id: "managed", kind: "managed", name: "nanoPlayer",
        originalName: "Music", location: "nanoPlayer", uri: managed.path), at: 0)
    }
    if let i = sources.firstIndex(where: { $0.id == "managed" }) { sources[i].uri = managed.path }
    trash.removeAll { item in
      item.restoring == nil && !fm.fileExists(atPath: support.appendingPathComponent("LibraryTrash").appendingPathComponent(item.stored).path)
    }
    try saveManagement()
    try saveSources()
    let inbox = managed.appendingPathComponent("收件箱")
    if !fm.fileExists(atPath: inbox.path) { try fm.createDirectory(at: inbox, withIntermediateDirectories: false) }
  }

  func saveSources() throws { try JSONEncoder().encode(LibraryCatalog(sources: sources)).write(to: sourceFile, options: .atomic) }
  private func saveMoves() throws { try JSONEncoder().encode(moves).write(to: moveFile, options: .atomic) }
  func source(_ id: String) throws -> LibrarySource {
    guard let source = sources.first(where: { $0.id == id }) else { throw failure("来源不存在") }
    return source
  }
  static func nameKey(_ name: String) -> String {
    name.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping.lowercased()
  }
  static func validName(_ name: String) -> Bool {
    !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name != "." && name != ".." &&
      !name.hasPrefix(".") && !name.contains("/") && !name.contains("\\") && !name.unicodeScalars.contains(where: { $0.value < 32 })
  }
  private func displayName(_ base: String, except: String? = nil) -> String {
    let used = Set(sources.filter { $0.id != except }.map { Self.nameKey($0.name) })
    var result = base.trimmingCharacters(in: .whitespacesAndNewlines)
    var number = 2
    while used.contains(Self.nameKey(result)) { result = "\(base)（\(number)）"; number += 1 }
    return result
  }
  static func contains(_ root: URL, _ child: URL) -> Bool {
    let base = root.resolvingSymlinksInPath().standardizedFileURL.path
    let path = child.resolvingSymlinksInPath().standardizedFileURL.path
    return path == base || path.hasPrefix(base + "/")
  }
  func path(sourceId: String, relative: String, writable: Bool = false) throws -> URL {
    let source = try source(sourceId)
    guard !writable || source.kind == "managed" else { throw failure("外部来源只读") }
    guard !relative.hasPrefix("/"), !relative.contains("\\"),
      !relative.split(separator: "/").contains(".."), !relative.contains("\0") else { throw failure("路径无效") }
    let root = URL(fileURLWithPath: source.uri).standardizedFileURL
    let url = root.appendingPathComponent(relative).standardizedFileURL
    guard Self.contains(root, url) else { throw failure("路径超出授权目录") }
    return url
  }
  func register(_ url: URL, kind: String, label: String, location: String, replacing: String? = nil, legacy: Bool = false) throws -> LibrarySource {
    guard kind == "files" || kind == "app", kind != "app" || !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw failure("请选择来源类型并填写 App 名称")
    }
    guard !Self.contains(managed, url), !Self.contains(url, managed) else { throw failure("nanoPlayer 文件夹已在自有资源中") }
    if let existing = sources.first(where: { $0.id != replacing && URL(fileURLWithPath: $0.uri).resolvingSymlinksInPath() == url.resolvingSymlinksInPath() }) {
      guard replacing == nil else { throw failure("此文件夹已属于其他来源，请使用已有来源") }
      return existing
    }
    guard legacy || !sources.contains(where: { $0.id != replacing && $0.kind != "managed" &&
      (Self.contains(URL(fileURLWithPath: $0.uri), url) || Self.contains(url, URL(fileURLWithPath: $0.uri))) }) else {
      throw failure("已添加重叠的父级或子文件夹，请使用已有来源")
    }
    let id = replacing ?? UUID().uuidString
    let name = kind == "app" ? "\(label) · \(url.lastPathComponent)" :
      "Files · \(location.isEmpty ? "" : location + " · ")\(url.lastPathComponent)"
    var source = LibrarySource(id: id, kind: kind, name: displayName(name, except: replacing),
      originalName: url.lastPathComponent, location: kind == "app" ? label : location, uri: url.path)
    if let i = sources.firstIndex(where: { $0.id == id }) {
      source.name = sources[i].name; source.indexPaths = sources[i].indexPaths
      source.previousUri = sources[i].previousUri ?? (sources[i].uri != url.path ? sources[i].uri : nil)
      sources[i] = source
    } else { sources.append(source) }
    try saveSources()
    return source
  }
  func rebase(_ mappings: [String: String]) throws {
    for i in sources.indices {
      if let next = mappings[sources[i].uri] { sources[i].uri = next }
    }
    // Move journal absolute paths must survive iOS container relocation too.
    for i in moves.indices {
      for (old, new) in mappings {
        if moves[i].from.hasPrefix(old + "/") { moves[i].from = new + moves[i].from.dropFirst(old.count) }
        if moves[i].to.hasPrefix(old + "/") { moves[i].to = new + moves[i].to.dropFirst(old.count) }
      }
    }
    try saveSources(); try saveMoves()
  }
  func editSource(_ id: String, name: String?, indexPaths: [String]?, setIndex: Bool = false) throws {
    guard let i = sources.firstIndex(where: { $0.id == id }), id != "managed" else { throw failure("此来源不可编辑") }
    if let name {
      guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw failure("名称不能为空") }
      sources[i].name = displayName(name, except: id)
    }
    if setIndex {
      for item in indexPaths ?? [] { _ = try path(sourceId: id, relative: item) }
      sources[i].indexPaths = indexPaths
    }
    try saveSources()
  }
  func removeSource(_ id: String) throws {
    guard id != "managed" else { throw failure("不能移除 nanoPlayer 管理区") }
    sources.removeAll { $0.id == id }; try saveSources()
  }
  static func indexed(_ relative: String, paths: [String]?) -> Bool {
    guard let paths else { return true }
    return paths.contains { $0 == "" || relative == $0 || relative.hasPrefix($0 + "/") }
  }
  func snapshot() throws -> [String: Any] {
    let data = try JSONEncoder().encode(sources)
    var rows = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
    for i in rows.indices {
      rows[i]["available"] = fm.fileExists(atPath: sources[i].uri)
      rows[i]["indexPaths"] = sources[i].indexPaths as Any? ?? NSNull()
    }
    return ["managedUri": managed.path, "sources": rows]
  }
  func directorySummary(_ url: URL) throws -> [String: Int] {
    var audio = 0, folders = 0
    if let iterator = fm.enumerator(at: url, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey], options: .skipsHiddenFiles) {
      for case let item as URL in iterator {
        let values = try item.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        if values.isSymbolicLink == true { iterator.skipDescendants(); continue }
        if values.isDirectory == true { folders += 1 }
        else if Self.audio(item) { audio += 1 }
      }
    }
    return ["audioCount": audio, "directoryCount": folders]
  }
  func browse(_ id: String, relative: String, foldersOnly: Bool = false) throws -> [String: Any] {
    let source = try source(id)
    let url = try path(sourceId: id, relative: relative)
    let children = try fm.contentsOfDirectory(at: url,
      includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey, .ubiquitousItemDownloadingStatusKey], options: .skipsHiddenFiles)
    var entries: [[String: Any]] = []
    for child in children {
      let values = try child.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey, .ubiquitousItemDownloadingStatusKey])
      guard values.isSymbolicLink != true, values.isDirectory == true || (!foldersOnly && Self.audio(child)) else { continue }
      let path = relative.isEmpty ? child.lastPathComponent : relative + "/" + child.lastPathComponent
      var row: [String: Any] = ["name": child.lastPathComponent, "path": path, "directory": values.isDirectory == true,
        "sizeBytes": values.fileSize ?? 0, "indexed": Self.indexed(path, paths: source.indexPaths),
        "partial": source.indexPaths?.contains(where: { $0.hasPrefix(path + "/") }) == true && !Self.indexed(path, paths: source.indexPaths),
        "needsDownload": values.ubiquitousItemDownloadingStatus == .notDownloaded]
      if source.kind == "managed", values.isDirectory == true, !foldersOnly {
        for (key, value) in try directorySummary(child) { row[key] = value }
      }
      entries.append(row)
    }
    entries.sort {
      if ($0["directory"] as! Bool) != ($1["directory"] as! Bool) { return $0["directory"] as! Bool }
      return ($0["name"] as! String).localizedStandardCompare($1["name"] as! String) == .orderedAscending
    }
    return ["entries": entries]
  }
  static func audio(_ url: URL) -> Bool {
    ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "aiff", "aif", "alac"].contains(url.pathExtension.lowercased())
  }
  func unique(_ parent: URL, name: String, skip: Bool = false) throws -> URL? {
    guard Self.validName(name) else { throw failure("文件名无效") }
    let names = try fm.contentsOfDirectory(atPath: parent.path)
    let used = Set(names.map(Self.nameKey))
    if !used.contains(Self.nameKey(name)) { return parent.appendingPathComponent(name) }
    if skip { return nil }
    let url = URL(fileURLWithPath: name)
    let ext = url.pathExtension
    let base = ext.isEmpty ? name : url.deletingPathExtension().lastPathComponent
    var n = 2
    while used.contains(Self.nameKey("\(base)（\(n)）" + (ext.isEmpty ? "" : "." + ext))) { n += 1 }
    return parent.appendingPathComponent("\(base)（\(n)）" + (ext.isEmpty ? "" : "." + ext))
  }
  private func ensureSettled() throws {
    guard moves.isEmpty, !trash.contains(where: { $0.pending == true || $0.restoring != nil }) else { throw failure("路径同步中，请稍后刷新重试") }
  }
  func createFolder(parent: String, name: String) throws -> [String: Any] {
    try ensureSettled()
    let url = try path(sourceId: "managed", relative: parent, writable: true)
    let destination = try unique(url, name: name)!
    try fm.createDirectory(at: destination, withIntermediateDirectories: false)
    try saveManagement()
    return ["name": destination.lastPathComponent]
  }
  func deleteEmpty(_ relative: String) throws {
    let url = try path(sourceId: "managed", relative: relative, writable: true)
    guard url != managed, relative != "收件箱", try fm.contentsOfDirectory(atPath: url.path).isEmpty else { throw failure("仅能删除空文件夹") }
    try fm.removeItem(at: url)
  }
  /// Journal intent is durable before rename; recovery detects either side of an interrupted move.
  func move(paths: [String], target: String, rename: String? = nil, skip: Bool = false) throws -> [String: Any] {
    try ensureSettled()
    guard moves.isEmpty else { throw failure("上一批移动待恢复，请重新打开资源库") }
    let parent = try path(sourceId: "managed", relative: target, writable: true)
    var results: [[String: Any]] = []
    for relative in paths {
      do {
        let from = try path(sourceId: "managed", relative: relative, writable: true)
        guard from != managed, relative != "收件箱", !Self.contains(from, parent), from.deletingLastPathComponent() != parent || rename != nil else {
          throw failure("不能移到当前位置、自己或子文件夹")
        }
        guard let to = try unique(parent, name: rename ?? from.lastPathComponent, skip: skip) else {
          results.append(["name": from.lastPathComponent, "skipped": true]); continue
        }
        moves.append(LibraryMove(from: from.path, to: to.path)); try saveMoves()
        do { try fm.moveItem(at: from, to: to) }
        catch { moves.removeLast(); try saveMoves(); throw error }
        let next = String(to.path.dropFirst(managed.path.count + 1))
        for i in directories.indices where directories[i].path == relative || directories[i].path.hasPrefix(relative + "/") {
          directories[i].path = next + directories[i].path.dropFirst(relative.count)
        }
        try saveManagement()
        results.append(["name": to.lastPathComponent, "success": true])
      } catch { results.append(["name": relative, "error": error.localizedDescription]) }
    }
    return ["results": results, "mappings": try pendingMoves(), "uri": managed.path]
  }
  func pendingMoves() throws -> [String: String] {
    var mappings: [String: String] = [:]
    for move in moves {
      let fromExists = fm.fileExists(atPath: move.from), toExists = fm.fileExists(atPath: move.to)
      if !fromExists && toExists { mappings[move.from] = move.to }
      else if !fromExists || toExists { throw failure("移动恢复状态冲突，请保留文件并重试") }
    }
    for source in sources { if let previous = source.previousUri { mappings[previous] = source.uri } }
    for item in trash {
      let stored = support.appendingPathComponent("LibraryTrash").appendingPathComponent(item.stored)
      let virtual = managed.appendingPathComponent(".nanoplayer-trash/" + item.id).path
      if let restoring = item.restoring, fm.fileExists(atPath: managed.appendingPathComponent(restoring).path), !fm.fileExists(atPath: stored.path) {
        mappings[virtual] = managed.appendingPathComponent(restoring).path
      } else if item.pending == true && fm.fileExists(atPath: stored.path) {
        mappings[managed.appendingPathComponent(item.path).path] = virtual
      }
    }
    return mappings
  }
  func acknowledgeMoves() throws {
    guard !moves.isEmpty || sources.contains(where: { $0.previousUri != nil }) || trash.contains(where: { $0.pending == true || $0.restoring != nil }) else { return }
    for move in moves where fm.fileExists(atPath: move.to) && move.from.hasPrefix(managed.path + "/") && move.to.hasPrefix(managed.path + "/") {
      let old = String(move.from.dropFirst(managed.path.count + 1)), next = String(move.to.dropFirst(managed.path.count + 1))
      for i in directories.indices where directories[i].path == old || directories[i].path.hasPrefix(old + "/") {
        directories[i].path = next + directories[i].path.dropFirst(old.count)
      }
    }
    for item in trash {
      if let restored = item.restoring, fm.fileExists(atPath: managed.appendingPathComponent(restored).path) {
        for i in directories.indices where directories[i].path == item.path || directories[i].path.hasPrefix(item.path + "/") {
          let candidate = managed.appendingPathComponent(restored + directories[i].path.dropFirst(item.path.count))
          let attrs = try? fm.attributesOfItem(atPath: candidate.path)
          if directories[i].identity == (attrs?[.systemFileNumber] as? NSNumber)?.stringValue {
            directories[i].path = restored + directories[i].path.dropFirst(item.path.count)
          }
        }
      }
    }
    trash.removeAll { item in item.restoring.map { fm.fileExists(atPath: managed.appendingPathComponent($0).path) } == true }
    for i in trash.indices { trash[i].pending = false }
    try saveManagement()
    for i in sources.indices { sources[i].previousUri = nil }
    try saveSources(); moves = []; try saveMoves()
  }
  /// Hash each file in bounded chunks. Compare the complete tree before committing copied content.
  static func digest(_ url: URL) throws -> [String: String] {
    let fm = FileManager.default
    let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard values.isSymbolicLink != true else { throw failure("不导入符号链接") }
    if values.isDirectory == true {
      var result: [String: String] = ["": "directory"]
      for item in try fm.contentsOfDirectory(at: url, includingPropertiesForKeys: nil) {
        for (path, hash) in try digest(item) { result[item.lastPathComponent + (path.isEmpty ? "" : "/" + path)] = hash }
      }
      return result
    }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hash = SHA256()
    while let bytes = try handle.read(upToCount: 1024 * 1024), !bytes.isEmpty { hash.update(data: bytes) }
    return ["": hash.finalize().map { String(format: "%02x", $0) }.joined()]
  }
  func copy(_ urls: [URL], target: String, skip: Bool = false) throws -> [String: Any] {
    try ensureSettled()
    let parent = try path(sourceId: "managed", relative: target, writable: true)
    var results: [[String: Any]] = []
    for original in urls {
      let staging = support.appendingPathComponent(".copy-" + UUID().uuidString)
      defer { try? fm.removeItem(at: staging) }
      do {
        guard !Self.contains(managed, original), !Self.contains(original, managed) else { throw failure("自有文件请使用移动操作") }
        guard let destination = try unique(parent, name: original.lastPathComponent, skip: skip) else {
          results.append(["name": original.lastPathComponent, "input": original.path, "skipped": true]); continue
        }
        var coordinationError: NSError?, copyError: Error?
        NSFileCoordinator().coordinate(readingItemAt: original, options: [], error: &coordinationError) { readable in
          do {
            let before = try Self.digest(readable)
            try fm.copyItem(at: readable, to: staging)
            guard before == (try Self.digest(staging)), before == (try Self.digest(readable)) else { throw failure("源文件变化或复制校验失败") }
            try fm.moveItem(at: staging, to: destination)
          } catch { copyError = error }
        }
        if let error = coordinationError ?? copyError as NSError? { throw error }
        results.append(["name": destination.lastPathComponent, "input": original.path, "success": true])
      } catch { results.append(["name": original.lastPathComponent, "error": error.localizedDescription]) }
    }
    return ["uri": managed.path, "results": results]
  }
  func directoryID(_ relative: String, persist: Bool = true) throws -> String {
    let url = try path(sourceId: "managed", relative: relative)
    guard (try url.resourceValues(forKeys: [.isDirectoryKey])).isDirectory == true else { throw failure("目标不是文件夹") }
    let identity = (try fm.attributesOfItem(atPath: url.path)[.systemFileNumber] as? NSNumber)?.stringValue
    if let item = directories.first(where: { $0.path == relative && ($0.identity == nil || $0.identity == identity) }) { return item.id }
    let item = ManagedDirectory(id: UUID().uuidString, path: relative, enabled: nil, identity: identity)
    directories.append(item); if persist { try saveManagement() }; return item.id
  }
  func directoryPath(_ id: String) throws -> String {
    guard let item = directories.first(where: { $0.id == id }) else { throw failure("文件夹不存在，请刷新后重新选择") }
    guard try directoryID(item.path) == item.id else { throw failure("目标已变化，请刷新后重新选择") }
    return item.path
  }
  func participationRules() throws -> [LibraryParticipationRule] {
    let snapshot = try managementSnapshot()
    var rules = [LibraryParticipationRule(path: managed.appendingPathComponent(".nanoplayer-trash").path, enabled: false)]
    for row in snapshot["directories"] as! [[String: Any]] {
      rules.append(LibraryParticipationRule(path: managed.path + ((row["path"] as! String).isEmpty ? "" : "/" + (row["path"] as! String)),
        enabled: row["enabled"] as? Bool ?? true, directOnly: row["directOnly"] as? Bool ?? false))
    }
    for source in sources where source.kind != "managed" {
      rules.append(LibraryParticipationRule(path: source.uri, enabled: sourceEnabled[source.id] ?? true))
    }
    return rules
  }
  func managementSnapshot() throws -> [String: Any] {
    let oldCount = directories.count
    var rows: [[String: Any]] = []
    for child in try fm.contentsOfDirectory(at: managed, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey], options: .skipsHiddenFiles) {
      let values = try child.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
      guard values.isDirectory == true, values.isSymbolicLink != true else { continue }
      let relative = child.lastPathComponent, id = try directoryID(relative, persist: false)
      let item = directories.first { $0.id == id }!
      rows.append(["id": id, "name": relative, "path": relative, "enabled": item.enabled as Any? ?? NSNull()])
    }
    rows.sort { ($0["name"] as! String).localizedStandardCompare($1["name"] as! String) == .orderedAscending }
    // Root audio is a virtual first-level record; do not move existing files.
    rows.append(["id": "root-audio", "name": "根目录音乐", "path": "", "enabled": sourceEnabled["root-audio"] as Any? ?? NSNull(), "directOnly": true])
    if directories.count != oldCount { try saveManagement() }
    let enabled = sourceEnabled.mapValues { $0 as Any }
    return ["directories": rows, "sourceEnabled": enabled, "selectionInitialized": selectionInitialized, "revision": revision]
  }
  func initializeParticipation(_ enabled: [String: Bool]) throws {
    guard !selectionInitialized else { return }
    for i in directories.indices where directories[i].enabled == nil && !directories[i].path.contains("/") {
      directories[i].enabled = enabled[directories[i].id] ?? true
    }
    for (id, value) in enabled where !directories.contains(where: { $0.id == id }) { sourceEnabled[id] = value }
    selectionInitialized = true; try saveManagement()
  }
  func setParticipation(_ id: String, enabled: Bool, confirmAll: Bool = false) throws {
    if id == "root-audio" { sourceEnabled[id] = enabled }
    else if let i = directories.firstIndex(where: { $0.id == id }) {
      guard !directories[i].path.isEmpty, !directories[i].path.contains("/") else { throw failure("只能勾选一级目录") }
      directories[i].enabled = enabled
    } else {
      let item = try source(id)
      guard item.kind != "managed" else { throw failure("请选择一级目录") }
      if enabled && item.indexPaths != nil {
        guard confirmAll else { throw failure("旧来源有部分索引范围，请确认包含整个一级来源") }
        let backup = support.appendingPathComponent("legacy-index-" + item.id + ".json")
        if !fm.fileExists(atPath: backup.path) { try JSONEncoder().encode(item.indexPaths).write(to: backup, options: .atomic) }
        try editSource(id, name: nil, indexPaths: nil, setIndex: true)
      }
      sourceEnabled[id] = enabled
    }
    try saveManagement()
  }
  func browserList(_ id: String) throws -> [String: Any] {
    let relative = try directoryPath(id)
    var result = try browse("managed", relative: relative)
    let oldCount = directories.count
    var rows = result["entries"] as! [[String: Any]]
    for i in rows.indices {
      let path = rows[i]["path"] as! String
      // IDs are only issued for validated in-container entries.
      if rows[i]["directory"] as? Bool == true { rows[i]["id"] = try directoryID(path, persist: false) }
      else { rows[i]["id"] = path } // File entries are display-only in the browser.
      rows[i].removeValue(forKey: "path")
    }
    if directories.count != oldCount { try saveManagement() }
    result["entries"] = rows; result["currentId"] = id
    result["path"] = "nanoPlayer" + (relative.isEmpty ? "" : "/" + relative)
    result["parentId"] = try directoryID(relative.split(separator: "/").dropLast().joined(separator: "/"))
    result["revision"] = revision
    result["trash"] = trash.map { ["id": $0.id, "name": URL(fileURLWithPath: $0.path).lastPathComponent] }
    return result
  }
  func trashDirectory(_ relative: String) throws -> [String: Any] {
    try ensureSettled()
    guard moves.isEmpty else { throw failure("路径同步中，请稍后重试") }
    let from = try path(sourceId: "managed", relative: relative, writable: true)
    guard !relative.isEmpty, relative != "收件箱", (try from.resourceValues(forKeys: [.isDirectoryKey])).isDirectory == true else { throw failure("此目录不可删除") }
    let id = UUID().uuidString, container = support.appendingPathComponent("LibraryTrash")
    try fm.createDirectory(at: container, withIntermediateDirectories: true)
    let to = container.appendingPathComponent(id)
    // Store intent before moving. Startup/list recovery recognizes either side.
    trash.append(TrashRecord(id: id, path: relative, stored: id, pending: true)); try saveManagement()
    do { try fm.moveItem(at: from, to: to) }
    catch { trash.removeAll { $0.id == id }; try saveManagement(); throw error }
    return ["uri": managed.path, "mappings": try pendingMoves()]
  }
  func restoreTrash(_ id: String, target: String? = nil) throws -> [String: Any] {
    try ensureSettled()
    guard moves.isEmpty, let item = trash.first(where: { $0.id == id }) else { throw failure("请刷新回收站后重试") }
    let original = managed.appendingPathComponent(item.path)
    let stored = support.appendingPathComponent("LibraryTrash").appendingPathComponent(item.stored)
    let parent = try path(sourceId: "managed", relative: target ?? item.path.split(separator: "/").dropLast().joined(separator: "/"), writable: true)
    let to = try unique(parent, name: original.lastPathComponent)!
    guard fm.fileExists(atPath: stored.path) else { throw failure("回收站内容不可用；原目录可能尚未移除") }
    guard let index = trash.firstIndex(where: { $0.id == id }), trash[index].pending != true else { throw failure("删除记录同步中，请稍后重试") }
    let relative = String(to.path.dropFirst(managed.path.count + 1))
    trash[index].restoring = relative; try saveManagement()
    do { try fm.moveItem(at: stored, to: to) }
    catch { trash[index].restoring = nil; try saveManagement(); throw error }
    return ["uri": managed.path, "mappings": try pendingMoves()]
  }

  func purgeTrash(_ id: String) throws {
    try ensureSettled()
    guard let item = trash.first(where: { $0.id == id }) else { throw failure("回收站记录不存在") }
    let stored = support.appendingPathComponent("LibraryTrash").appendingPathComponent(item.stored)
    if fm.fileExists(atPath: stored.path) { try fm.removeItem(at: stored) }
    trash.removeAll { $0.id == id }; try saveManagement()
  }
  func trashPaths() -> [String] { trash.map { ".nanoplayer-trash/" + $0.id } }

  func browserCommand(_ action: String, values: [String: Any], rootId: String, initialId: String) throws -> [String: Any] {
    let library = self
    let id = values["id"] as? String ?? initialId
    if action == "list" {
      var result = try library.browserList(id)
      result["rootId"] = rootId; return result
    }
    let relative = try library.directoryPath(id)
    if action == "uploadTarget" {
      return ["directory": try library.path(sourceId: "managed", relative: relative, writable: true).path]
    }
    guard values["revision"] as? Int == library.revision else {
      throw NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "目录已变化，请刷新后重试"])
    }
    let result: [String: Any]
    switch action {
    case "create": result = try library.createFolder(parent: relative, name: values["name"] as? String ?? "")
    case "rename", "move":
      let target = action == "rename" ? relative.split(separator: "/").dropLast().joined(separator: "/") : try library.directoryPath(values["targetId"] as? String ?? "")
      result = try library.move(paths: [relative], target: target, rename: action == "rename" ? values["name"] as? String : nil)
      if let row = (result["results"] as? [[String: Any]])?.first, let error = row["error"] as? String {
        throw NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: error])
      }
    case "trash": result = try library.trashDirectory(relative)
    case "restore": result = try library.restoreTrash(values["trashId"] as? String ?? "", target: try (values["targetId"] as? String).map { try library.directoryPath($0) })
    case "purge": try library.purgeTrash(values["trashId"] as? String ?? ""); result = [:]
    default: throw NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "不支持的目录操作"])
    }
    return result
  }

}
