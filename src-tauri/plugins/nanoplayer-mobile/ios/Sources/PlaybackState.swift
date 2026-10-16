import Foundation

struct QueueTrack: Codable {
  let id: String
  let uri: String
  let title: String
  let artist: String
}

struct ListeningRecord: Codable {
  var sessionId = UUID().uuidString
  let trackId: String
  var listenedMs: Int64 = 0
  var counted = false
  var seeked = false
  var startedAt = String(Int64(Date().timeIntervalSince1970))

  func completes(durationMs: Double) -> Bool {
    !counted && !seeked && durationMs > 0 && Double(listenedMs) >= max(1, durationMs - 750)
  }

  mutating func advance(from: Double, to: Double, playing: Bool) {
    if playing && from.isFinite && to.isFinite && to >= from {
      listenedMs += Int64(to - from)
    }
  }
}

enum UploadRules {
  static let maximumBytes = 512 * 1024 * 1024
  static func valid(name: String, bytes: Int) -> Bool {
    !name.isEmpty && name.utf8.count <= 240 && bytes > 0 && bytes <= maximumBytes &&
      name == URL(fileURLWithPath: name).lastPathComponent &&
      !name.contains("\\") && !name.contains("\0") &&
      ["mp3", "m4a", "aac", "flac", "wav", "aiff", "aif", "alac"]
        .contains(URL(fileURLWithPath: name).pathExtension.lowercased())
  }
}


struct LibraryParticipationRule {
  let path: String
  let enabled: Bool
  var directOnly = false
  static func allows(_ uri: String, rules: [LibraryParticipationRule]) -> Bool {
    for rule in rules where uri.hasPrefix(rule.path + "/") {
      if rule.directOnly && uri.dropFirst(rule.path.count + 1).contains("/") { continue }
      return rule.enabled
    }
    return true
  }
}
struct LibraryQueueSelection {
  let queue: [QueueTrack]
  let order: [String]
  let currentId: String?
  init(queue: [QueueTrack], order: [String], currentId: String?, rules: [LibraryParticipationRule]) {
    self.queue = queue.filter { LibraryParticipationRule.allows($0.uri, rules: rules) }
    let ids = Set(self.queue.map(\.id))
    self.order = order.filter { ids.contains($0) }
    if let currentId, ids.contains(currentId) { self.currentId = currentId }
    else {
      let oldIndex = order.firstIndex(of: currentId ?? "") ?? -1
      self.currentId = order.dropFirst(oldIndex + 1).first { ids.contains($0) } ?? self.order.first ?? self.queue.first?.id
    }
  }
}
