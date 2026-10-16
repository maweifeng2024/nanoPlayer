import Foundation

var checks = 0
func expect(_ value: @autoclosure () throws -> Bool, _ message: String) {
  checks += 1
  guard (try? value()) == true else { fatalError(message) }
}
var record = ListeningRecord(trackId: "42")
record.advance(from: 0, to: 250, playing: true)
expect(record.listenedMs == 250, "Count actual played media time")
record.advance(from: 250, to: 250, playing: true)
expect(record.listenedMs == 250, "A stall must not add elapsed wall time")
record.advance(from: 250, to: 500, playing: false)
expect(record.listenedMs == 250, "Paused progress must not count")
record.advance(from: 500, to: 0, playing: true)
expect(record.listenedMs == 250, "Backward seeks must not add time")
record.listenedMs = 0
expect(!record.completes(durationMs: 10_000), "A fresh session must not count")
record.listenedMs = 9250
expect(record.completes(durationMs: 10_000), "Natural completion permits the 750ms tolerance")
record.seeked = true
expect(!record.completes(durationMs: 10_000), "Seeking prevents natural-completion credit")
record.seeked = false; record.counted = true
expect(!record.completes(durationMs: 10_000), "A session must count once")
expect(!record.completes(durationMs: 0), "Unknown duration must not count")
expect(UploadRules.valid(name: "歌曲.MP3", bytes: 1024), "Unicode audio names should upload")
for name in ["../song.mp3", "/song.mp3", "a\\song.mp3", "song\0.mp3", "script.html", ""] {
  expect(!UploadRules.valid(name: name, bytes: 1024), "Reject unsafe/non-audio filename: \(name)")
}
expect(!UploadRules.valid(name: "song.mp3", bytes: 0), "Reject empty upload")
expect(!UploadRules.valid(name: "song.mp3", bytes: UploadRules.maximumBytes + 1), "Reject oversized upload")
let encoded = try JSONEncoder().encode(record)
let json = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
expect((json["listenedMs"] as? Int64) == 9250, "Rust journal requires integer listenedMs")
expect(UInt64(json["startedAt"] as! String) != nil, "Rust last-played timestamp requires epoch seconds")
print("iOS native state/upload rules: \(checks) checks passed. Audio, network and UI device acceptance are separate.")

let sandbox = FileManager.default.temporaryDirectory.appendingPathComponent("nanoplayer-library-" + UUID().uuidString)
let music = sandbox.appendingPathComponent("Documents/Music")
let support = sandbox.appendingPathComponent("Support")
let external = sandbox.appendingPathComponent("External/Music")
let fm = FileManager.default
try fm.createDirectory(at: external, withIntermediateDirectories: true)
defer { try? fm.removeItem(at: sandbox) }
let bytes = Data((0..<4096).map { UInt8($0 % 251) })
let original = external.appendingPathComponent("原曲.wav")
try bytes.write(to: original)
let library = try NativeLibrary(managed: music, support: support)
let firstSource = try library.register(external, kind: "files", label: "", location: "iCloud Drive")
expect(firstSource.name == "Files · iCloud Drive · Music", "Source name preserves selected folder and location")
let sameSource = try library.register(external, kind: "files", label: "", location: "Other")
expect(sameSource.id == firstSource.id, "Repeated authorization keeps source identity")
func rejects(_ message: String, _ action: () throws -> Void) {
  do { try action(); expect(false, message) } catch { expect(true, message) }
}
rejects("External roots must never be writable") { _ = try library.path(sourceId: firstSource.id, relative: "原曲.wav", writable: true) }
rejects("Reject traversal") { _ = try library.path(sourceId: "managed", relative: "../outside") }
rejects("Reject absolute paths") { _ = try library.path(sourceId: "managed", relative: external.path) }
rejects("Do not add the managed folder as an external source") { _ = try library.register(music, kind: "files", label: "", location: "") }
rejects("Do not index overlapping roots twice") { _ = try library.register(external.deletingLastPathComponent(), kind: "files", label: "", location: "") }
let otherMusic = sandbox.appendingPathComponent("Other/Music")
try fm.createDirectory(at: otherMusic, withIntermediateDirectories: true)
let secondSource = try library.register(otherMusic, kind: "files", label: "", location: "iCloud Drive")
expect(secondSource.name == "Files · iCloud Drive · Music（2）", "Duplicate source names use stable suffixes")
try library.editSource(firstSource.id, name: "手动名称", indexPaths: ["原曲.wav"], setIndex: true)
let restored = try NativeLibrary(managed: music, support: support)
expect(try restored.source(firstSource.id).name == "手动名称", "Edited source name persists")
expect(try restored.source(firstSource.id).indexPaths == ["原曲.wav"], "Partial index selection persists")
expect(NativeLibrary.indexed("Album/a.wav", paths: ["Album"]), "Directory selection includes descendants")
expect(!NativeLibrary.indexed("Album2/a.wav", paths: ["Album"]), "Selection uses component boundaries")
expect(!NativeLibrary.indexed("a.wav", paths: []), "Empty selection excludes all")
let copied = try library.copy([original], target: "收件箱")
expect((copied["results"] as! [[String: Any]])[0]["success"] as? Bool == true, "External audio can copy into selected folder")
expect(try Data(contentsOf: original) == bytes, "Copy leaves every source byte unchanged")
expect(try Data(contentsOf: music.appendingPathComponent("收件箱/原曲.wav")) == bytes, "Copy preserves every audio byte")
_ = try library.copy([original], target: "收件箱")
expect(fm.fileExists(atPath: music.appendingPathComponent("收件箱/原曲（2）.wav").path), "Keep both places suffix before extension")
let skipped = try library.copy([original], target: "收件箱", skip: true)
expect((skipped["results"] as! [[String: Any]])[0]["skipped"] as? Bool == true, "Skip never overwrites existing audio")
_ = try library.createFolder(parent: "", name: "演唱会")
let moved = try library.move(paths: ["收件箱/原曲.wav"], target: "演唱会")
expect((moved["mappings"] as! [String: String]).count == 1, "Moves return recoverable path mapping")
expect(try Data(contentsOf: music.appendingPathComponent("演唱会/原曲.wav")) == bytes, "Moving preserves every audio byte")
let recovering = try NativeLibrary(managed: music, support: support)
expect(try recovering.pendingMoves().count == 1, "Interrupted database sync recovers the completed move")
try recovering.acknowledgeMoves()
expect(try recovering.pendingMoves().isEmpty, "Acknowledgement is idempotent")
let invalidMove = try recovering.move(paths: ["演唱会"], target: "演唱会")
expect((invalidMove["results"] as! [[String: Any]])[0]["error"] != nil, "Cannot move a folder into itself")
rejects("Nonempty directories are never deleted") { try recovering.deleteEmpty("演唱会") }
let link = music.appendingPathComponent("逃逸")
try fm.createSymbolicLink(at: link, withDestinationURL: external)
rejects("Reject symlink escapes") { _ = try recovering.path(sourceId: "managed", relative: "逃逸/原曲.wav", writable: true) }
let unsafeCopy = try recovering.copy([link], target: "收件箱")
expect((unsafeCopy["results"] as! [[String: Any]])[0]["error"] != nil, "Never copy symlinks into managed storage")
try recovering.removeSource(firstSource.id)
expect(try Data(contentsOf: original) == bytes, "Removing an index leaves source bytes unchanged")
let reauthorized = try recovering.register(external, kind: "files", label: "", location: "Files")
try recovering.editSource(reauthorized.id, name: "保留名称", indexPaths: ["原曲.wav"], setIndex: true)
let replacement = sandbox.appendingPathComponent("Relink/Music")
try fm.createDirectory(at: replacement, withIntermediateDirectories: true)
let relinked = try recovering.register(replacement, kind: "files", label: "", location: "New", replacing: reauthorized.id)
expect(relinked.id == reauthorized.id && relinked.name == "保留名称", "Reauthorization preserves durable source identity and alias")
expect(relinked.indexPaths == ["原曲.wav"], "Reauthorization preserves the relative index selection")
expect(try recovering.pendingMoves()[external.path] == replacement.path, "Reauthorization journals root remapping for stable database IDs")
try recovering.acknowledgeMoves()
expect(try recovering.pendingMoves().isEmpty, "Reauthorization is acknowledged only after database commit")
let failedCopy = try recovering.copy([external.appendingPathComponent("missing.wav")], target: "收件箱")
expect((failedCopy["results"] as! [[String: Any]])[0]["error"] != nil, "Missing external files fail without partial publication")
expect(try Data(contentsOf: original) == bytes, "Failed operations never change original audio")

// Only first-level participation changes; the same native rules serve LAN requests.
expect(DocumentSelectionMode(rawValue: "") == nil, "A music picker must explicitly choose reference or copy")
expect(DocumentSelectionMode(rawValue: "import") == nil, "Unknown music picker modes cannot silently copy")
let management = try NativeLibrary(managed: music, support: support)
let initialChoices = try management.managementSnapshot()["directories"] as! [[String: Any]]
try management.initializeParticipation(Dictionary(uniqueKeysWithValues: initialChoices.map { ($0["id"] as! String, false) }))
expect(try management.managementSnapshot()["selectionInitialized"] as? Bool == true, "Legacy selection migrates exactly once")
let inboxId = try management.directoryID("收件箱")
let concertId = try management.directoryID("演唱会")
try management.setParticipation(concertId, enabled: false)
let again = try NativeLibrary(managed: music, support: support)
let topRows = try again.managementSnapshot()["directories"] as! [[String: Any]]
expect(topRows.first { $0["id"] as? String == concertId }?["enabled"] as? Bool == false, "First-level choice persists by UUID")
_ = try again.createFolder(parent: "演唱会", name: "深层")
let deepId = try again.directoryID("演唱会/深层")
rejects("Reject subdirectory participation") { try again.setParticipation(deepId, enabled: false) }
let rootId = try again.directoryID("")
let listed = try again.browserList(rootId)
expect(listed["currentId"] as? String == rootId, "LAN browser uses opaque directory IDs")
rejects("Reject forged browser target") { _ = try again.directoryPath("../../External") }
rejects("Reject stale directory edits") { _ = try again.browserCommand("create", values: ["id": rootId, "name": "stale", "revision": -1], rootId: rootId, initialId: inboxId) }
let trashResult = try again.trashDirectory("演唱会")
expect(!fm.fileExists(atPath: music.appendingPathComponent("演唱会").path), "Trash removes directory from scanned Music")
let trashMappings = trashResult["mappings"] as! [String: String]
expect(trashMappings[music.appendingPathComponent("演唱会").path]?.contains(".nanoplayer-trash/") == true, "Trash journals virtual DB tombstone for stable IDs")
let restarted = try NativeLibrary(managed: music, support: support)
expect(try restarted.pendingMoves() == trashMappings, "Interrupted trash DB sync is recoverable")
try restarted.acknowledgeMoves()
let trashRows = try restarted.browserList(rootId)["trash"] as! [[String: Any]]
let trashId = trashRows[0]["id"] as! String
_ = try restarted.restoreTrash(trashId)
expect(try Data(contentsOf: music.appendingPathComponent("演唱会/原曲.wav")) == bytes, "Trash restore preserves every byte")
expect(try restarted.pendingMoves().values.contains(music.appendingPathComponent("演唱会").path), "Restore remaps the tombstone to original path")
try restarted.acknowledgeMoves()
expect(try restarted.directoryID("演唱会") == concertId, "Restored first-level directory retains UUID and selection")
rejects("System inbox cannot be deleted") { _ = try restarted.trashDirectory("收件箱") }
let referenceTree = try NativeLibrary.digest(external)
let ownTree = try NativeLibrary.digest(music.appendingPathComponent("收件箱"))
_ = try restarted.register(external, kind: "files", label: "", location: "")
expect(try NativeLibrary.digest(external) == referenceTree, "Referencing an external source never changes source bytes")
expect(try NativeLibrary.digest(music.appendingPathComponent("收件箱")) == ownTree, "Referencing never copies audio into managed storage")

let policy = [LibraryParticipationRule(path: "/Music/.nanoplayer-trash", enabled: false),
  LibraryParticipationRule(path: "/Music/A", enabled: false), LibraryParticipationRule(path: "/Music/B", enabled: true),
  LibraryParticipationRule(path: "/Music", enabled: false, directOnly: true)]
let nativeQueue = [QueueTrack(id: "1", uri: "/Music/A/deep/a.wav", title: "A", artist: "fixture"),
  QueueTrack(id: "2", uri: "/Music/B/b.wav", title: "B", artist: "fixture"),
  QueueTrack(id: "3", uri: "/Music/root.wav", title: "Root", artist: "fixture")]
let filteredNativeQueue = LibraryQueueSelection(queue: nativeQueue, order: ["1", "2", "3"], currentId: "1", rules: policy)
expect(filteredNativeQueue.queue.map(\.id) == ["2"] && filteredNativeQueue.currentId == "2", "Native queue skips excluded first-level descendants after WebView loss")
expect(!LibraryParticipationRule.allows("/Music/.nanoplayer-trash/id/a.wav", rules: policy), "Trash tombstones cannot return to native playback")
expect(LibraryParticipationRule.allows("/Music/AB/song.wav", rules: policy), "Native selection respects component boundaries and root audio scope")
expect(LibraryQueueSelection(queue: nativeQueue, order: ["1", "2", "3"], currentId: "2", rules: policy).currentId == "2", "Native queue retains the selected current track")
try Data("{\"schemaVersion\":99,\"sources\":[]}".utf8).write(to: support.appendingPathComponent("library-sources.json"))
rejects("Reject future catalog schema without silently resetting") { _ = try NativeLibrary(managed: music, support: support) }
print("Native library rules and byte preservation: \(checks) total checks passed.")
