import AVFoundation
import Foundation
import MediaPlayer

/// The native queue, journal and timer remain independent of React polling.
final class NativePlayer {
  private let player = AVPlayer()
  private var queue: [QueueTrack] = []
  private var libraryRules: [LibraryParticipationRule] = []
  private var order: [String] = []
  private var currentId: String?
  private var restoredPosition: Double = 0
  private var shuffle = false
  private var repeatMode = 0
  private var ended = false
  private var error: String?
  private var record: ListeningRecord?
  private var events: [ListeningRecord] = []
  private var tickToken: Any?
  private var endToken: NSObjectProtocol?
  private var previousPosition: Double = 0
  private var seeking = false
  private var seekRevision = 0
  private var lastSave = ProcessInfo.processInfo.systemUptime
  private var sleepDeadline: Date?
  private var finishTrack = false
  private var sleepWaiting = false
  private var sleepTimer: Timer?
  private var remoteTargets: [(MPRemoteCommand, Any)] = []
  private let journal: URL

  init() {
    let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    journal = directory.appendingPathComponent("playback.json")
    if let data = try? Data(contentsOf: journal),
      let saved = try? JSONDecoder().decode(SavedPlayback.self, from: data) {
      queue = saved.queue; order = saved.order; currentId = saved.currentId
      shuffle = saved.shuffle; repeatMode = saved.repeatMode; events = saved.events
      restoredPosition = saved.positionMs
      // Recover pending accounting; playback is always paused on process launch.
      if let active = saved.record { merge(active) }
    }
    tickToken = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 1000),
      queue: .main) { [weak self] _ in self?.advance() }
    endToken = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
      object: nil, queue: .main) { [weak self] note in
      guard let self, let item = note.object as? AVPlayerItem, item === self.player.currentItem else { return }
      self.complete()
    }
    NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification,
      object: nil, queue: .main) { [weak self] _ in self?.pause() }
    NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification,
      object: nil, queue: .main) { [weak self] note in
      if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
        self?.pause()
      }
    }
    let center = MPRemoteCommandCenter.shared()
    bind(center.playCommand) { [weak self] in try? self?.play() }
    bind(center.pauseCommand) { [weak self] in self?.pause() }
    bind(center.nextTrackCommand) { [weak self] in self?.move(1) }
    bind(center.previousTrackCommand) { [weak self] in self?.move(-1) }
    let target = center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.seek(event.positionTime * 1000); return .success
    }
    remoteTargets.append((center.changePlaybackPositionCommand, target))
  }

  private func bind(_ command: MPRemoteCommand, action: @escaping () -> Void) {
    let target = command.addTarget { _ in action(); return .success }
    remoteTargets.append((command, target))
  }

  func rebasePaths(_ mappings: [String: String]) {
    let previousUri = queue.first(where: { $0.id == currentId })?.uri
    let progress = player.currentItem == nil ? restoredPosition : position
    queue = queue.map { track in
      var uri = track.uri
      for (previous, current) in mappings where uri == previous || uri.hasPrefix(previous + "/") {
        uri = current + String(uri.dropFirst(previous.count)); break
      }
      return QueueTrack(id: track.id, uri: uri, title: track.title, artist: track.artist)
    }
    if previousUri != queue.first(where: { $0.id == currentId })?.uri {
      let listening = record
      load(position: progress)
      record = listening; previousPosition = progress
    }
    save()
  }

  func applyLibrarySelection(_ rules: [LibraryParticipationRule]) {
    libraryRules = rules
    let selection = LibraryQueueSelection(queue: queue, order: order, currentId: currentId, rules: rules)
    guard selection.queue.count != queue.count else { return }
    let keep = selection.currentId == currentId
    let playing = player.rate > 0
    if !keep { closeRecord() }
    queue = selection.queue; order = selection.order; currentId = selection.currentId
    if !keep { restoredPosition = 0; load(); nowPlaying(); if playing && currentId != nil { try? play() } }
    ended = false; save()
  }

  func canRelocate(_ paths: [String]) -> Bool {
    guard player.rate > 0, let uri = queue.first(where: { $0.id == currentId })?.uri else { return true }
    return !paths.contains { uri == $0 || uri.hasPrefix($0 + "/") }
  }

  func command(_ args: NativeArgs, allowed: (String) -> Bool) throws {
    switch args.action {
    case "snapshot": break
    case "acknowledge":
      if let text = args.events?.data(using: .utf8),
        let acknowledged = try? JSONDecoder().decode([ListeningRecord].self, from: text) {
        events.removeAll { event in acknowledged.contains { $0.sessionId == event.sessionId &&
          $0.listenedMs >= event.listenedMs && ($0.counted || !event.counted) } }
        save()
      }
    case "setQueue", "updateQueue":
      guard let data = args.queue?.data(using: .utf8) else { throw failure("队列无效") }
      let input = try JSONDecoder().decode([QueueTrack].self, from: data)
      let next = input.filter { LibraryParticipationRule.allows($0.uri, rules: libraryRules) }
      guard Set(next.map(\.id)).count == next.count,
        next.allSatisfy({ allowed($0.uri) }) else { throw failure("队列包含未授权文件") }
      let keep = args.action == "updateQueue" && next.contains(where: { $0.id == currentId })
      let previousPlaying = player.rate > 0
      if !keep { closeRecord() }
      queue = next
      let ids = next.map(\.id)
      let selected = Set(ids)
      order = order.filter { selected.contains($0) }
      let retained = Set(order)
      order.append(contentsOf: ids.filter { !retained.contains($0) })
      if !shuffle { order = ids }
      if !keep {
        let index = min(max(0, args.index ?? 0), max(0, next.count - 1))
        currentId = next.isEmpty ? nil : next[index].id
        load(position: args.positionMs ?? 0)
        if args.enabled ?? previousPlaying { try play() }
      }
      ended = false; save()
    case "play": try play()
    case "pause": pause()
    case "seek": seek(args.positionMs ?? 0)
    case "next": move(1)
    case "previous":
      if position > 3000 { seek(0) } else { move(-1) }
    case "shuffle":
      shuffle = args.enabled ?? false
      order = shuffle ? queue.map(\.id).shuffled() : queue.map(\.id)
      if shuffle, let id = currentId { order.removeAll { $0 == id }; order.insert(id, at: 0) }
      save()
    case "repeat": repeatMode = min(2, max(0, args.repeatMode ?? 0)); save()
    case "volume": player.volume = min(1, max(0, args.volume ?? 1))
    case "sleepTimer":
      let minutes = args.minutes ?? 0
      guard minutes == 0 || (1...1440).contains(minutes) else { throw failure("定时范围为 1–1440 分钟") }
      sleepDeadline = minutes == 0 ? nil : Date().addingTimeInterval(Double(minutes * 60))
      finishTrack = args.finishTrack ?? false; sleepWaiting = false
      sleepTimer?.invalidate()
      sleepTimer = minutes == 0 ? nil : Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.checkSleep() }
    default: throw failure("iOS 不支持此操作：\(args.action)")
    }
  }

  private var position: Double {
    let value = player.currentTime().seconds * 1000
    return value.isFinite ? max(0, value) : 0
  }
  private var duration: Double {
    let value = (player.currentItem?.duration.seconds ?? 0) * 1000
    return value.isFinite ? max(0, value) : 0
  }

  func snapshot() -> [String: Any] {
    advance()
    var result: [String: Any] = ["queue": queue.map(\.id), "playbackOrder": order,
      "positionMs": player.currentItem == nil ? restoredPosition : position, "playWhenReady": player.rate > 0, "shuffle": shuffle,
      "repeatMode": repeatMode, "ended": ended, "playCounts": [:],
      "sleepActive": sleepDeadline != nil || sleepWaiting, "sleepWaiting": sleepWaiting,
      "sleepFinishTrack": finishTrack, "sleepRemainingMs": max(0, (sleepDeadline?.timeIntervalSinceNow ?? 0) * 1000)]
    if let id = currentId { result["trackId"] = id }
    if let error { result["error"] = error }
    if let data = try? JSONEncoder().encode(events), let value = try? JSONSerialization.jsonObject(with: data) { result["events"] = value }
    return result
  }

  private func load(position: Double = 0) {
    seekRevision += 1; seeking = false
    player.pause(); error = nil
    guard let track = queue.first(where: { $0.id == currentId }) else {
      player.replaceCurrentItem(with: nil); currentId = nil; return
    }
    player.replaceCurrentItem(with: AVPlayerItem(url: URL(fileURLWithPath: track.uri)))
    if position > 0 { seek(position) }
    record = ListeningRecord(trackId: track.id)
    if position > 0 { record?.seeked = true }
    previousPosition = 0
    nowPlaying()
  }

  private func play() throws {
    if ended { load() }
    if player.currentItem == nil { load(position: restoredPosition); restoredPosition = 0 }
    guard player.currentItem != nil else { return }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .default)
    try session.setActive(true)
    previousPosition = position
    player.play(); ended = false; nowPlaying(); save()
  }
  private func pause() {
    advance(); player.pause(); nowPlaying(); save()
  }
  private func seek(_ ms: Double) {
    advance(); record?.seeked = true
    seeking = true
    seekRevision += 1
    let revision = seekRevision
    player.seek(to: CMTime(seconds: max(0, ms) / 1000, preferredTimescale: 1000)) { [weak self] _ in
      DispatchQueue.main.async {
        guard let self, self.seekRevision == revision else { return }
        self.previousPosition = self.position; self.seeking = false
      }
    }
    nowPlaying(); save()
  }
  private func advance() {
    let now = ProcessInfo.processInfo.systemUptime
    let currentPosition = position
    record?.advance(from: previousPosition, to: currentPosition,
      playing: player.rate > 0 && player.timeControlStatus == .playing && !seeking)
    previousPosition = currentPosition
    if let item = player.currentItem, item.status == .failed {
      error = item.error?.localizedDescription ?? "无法解码此音频"; player.pause()
    }
    if now - lastSave > 5 { if let record { merge(record) }; save(); lastSave = now }
    checkSleep()
  }
  private func complete() {
    advance()
    if var current = record {
      current.counted = current.completes(durationMs: duration)
      merge(current); record = nil
    }
    if sleepWaiting { cancelSleep(); pause(); return }
    if repeatMode == 1 { load(); try? play() } else { move(1, natural: true) }
  }
  private func move(_ delta: Int, natural: Bool = false) {
    let playing = player.rate > 0 || natural
    closeRecord()
    guard !order.isEmpty else { player.pause(); return }
    var index = (order.firstIndex(of: currentId ?? "") ?? 0) + delta
    if index >= order.count || index < 0 {
      if repeatMode == 2 { index = (index + order.count) % order.count }
      else { ended = true; player.pause(); save(); return }
    }
    currentId = order[index]; load(); if playing { try? play() }; save()
  }
  private func closeRecord() {
    advance(); if let record { merge(record) }; record = nil
  }
  private func merge(_ event: ListeningRecord) {
    if let index = events.firstIndex(where: { $0.sessionId == event.sessionId }) {
      events[index].listenedMs = max(events[index].listenedMs, event.listenedMs)
      events[index].counted = events[index].counted || event.counted
    } else { events.append(event) }
  }
  private func checkSleep() {
    guard let deadline = sleepDeadline, Date() >= deadline else { return }
    sleepDeadline = nil
    if finishTrack && player.rate > 0 { sleepWaiting = true }
    else { cancelSleep(); player.pause(); nowPlaying(); save() }
  }
  private func cancelSleep() { sleepDeadline = nil; sleepWaiting = false; sleepTimer?.invalidate(); sleepTimer = nil }
  private func nowPlaying() {
    guard let track = queue.first(where: { $0.id == currentId }) else {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil; return
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle: track.title,
      MPMediaItemPropertyArtist: track.artist, MPMediaItemPropertyPlaybackDuration: duration / 1000,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: position / 1000,
      MPNowPlayingInfoPropertyPlaybackRate: player.rate]
  }
  private struct SavedPlayback: Codable {
    let queue: [QueueTrack]; let order: [String]; let currentId: String?
    let positionMs: Double; let shuffle: Bool; let repeatMode: Int; let events: [ListeningRecord]; let record: ListeningRecord?
  }
  private func save() {
    let value = SavedPlayback(queue: queue, order: order, currentId: currentId,
      positionMs: player.currentItem == nil ? restoredPosition : position, shuffle: shuffle, repeatMode: repeatMode, events: events, record: record)
    if let data = try? JSONEncoder().encode(value) { try? data.write(to: journal, options: .atomic) }
  }
  private func failure(_ message: String) -> NSError {
    NSError(domain: "nanoPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
