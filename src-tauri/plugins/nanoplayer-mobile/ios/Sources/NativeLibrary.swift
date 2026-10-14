import Foundation
import CryptoKit

private func failure(_ message: String) -> NSError {
  NSError(domain: "nanoPlayer.Library", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

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
    if !sources.contains(where: { $0.id == "managed" }) {
      sources.insert(LibrarySource(id: "managed", kind: "managed", name: "nanoPlayer",
        originalName: "Music", location: "nanoPlayer", uri: managed.path), at: 0)
    }
    if let i = sources.firstIndex(where: { $0.id == "managed" }) { sources[i].uri = managed.path }
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
      !name.contains("/") && !name.contains("\\") && !name.unicodeScalars.contains(where: { $0.value < 32 })
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
      entries.append(["name": child.lastPathComponent, "path": path, "directory": values.isDirectory == true,
        "sizeBytes": values.fileSize ?? 0, "indexed": Self.indexed(path, paths: source.indexPaths),
        "partial": source.indexPaths?.contains(where: { $0.hasPrefix(path + "/") }) == true && !Self.indexed(path, paths: source.indexPaths),
        "needsDownload": values.ubiquitousItemDownloadingStatus == .notDownloaded])
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
  func createFolder(parent: String, name: String) throws -> [String: Any] {
    let url = try path(sourceId: "managed", relative: parent, writable: true)
    let destination = try unique(url, name: name)!
    try fm.createDirectory(at: destination, withIntermediateDirectories: false)
    return ["name": destination.lastPathComponent]
  }
  func deleteEmpty(_ relative: String) throws {
    let url = try path(sourceId: "managed", relative: relative, writable: true)
    guard url != managed, try fm.contentsOfDirectory(atPath: url.path).isEmpty else { throw failure("仅能删除空文件夹") }
    try fm.removeItem(at: url)
  }
  /// Journal intent is durable before rename; recovery detects either side of an interrupted move.
  func move(paths: [String], target: String, rename: String? = nil, skip: Bool = false) throws -> [String: Any] {
    guard moves.isEmpty else { throw failure("上一批移动待恢复，请重新打开资源库") }
    let parent = try path(sourceId: "managed", relative: target, writable: true)
    var results: [[String: Any]] = []
    for relative in paths {
      do {
        let from = try path(sourceId: "managed", relative: relative, writable: true)
        guard from != managed, !Self.contains(from, parent), from.deletingLastPathComponent() != parent || rename != nil else {
          throw failure("不能移到当前位置、自己或子文件夹")
        }
        guard let to = try unique(parent, name: rename ?? from.lastPathComponent, skip: skip) else {
          results.append(["name": from.lastPathComponent, "skipped": true]); continue
        }
        moves.append(LibraryMove(from: from.path, to: to.path)); try saveMoves()
        do { try fm.moveItem(at: from, to: to) }
        catch { moves.removeLast(); try saveMoves(); throw error }
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
    return mappings
  }
  func acknowledgeMoves() throws {
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
}
