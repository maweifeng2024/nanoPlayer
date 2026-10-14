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

