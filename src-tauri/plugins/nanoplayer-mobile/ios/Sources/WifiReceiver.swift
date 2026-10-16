import CoreImage
import Darwin
import Foundation
import Network
#if canImport(UIKit)
import UIKit
#endif

/// A foreground-only, explicitly started LAN receiver. Each request streams to
/// a staging file; authenticated, complete files are moved into app-owned music.
final class WifiReceiver {
  typealias Handler = (String, [String: Any], @escaping (Result<[String: Any], Error>) -> Void) -> Void
  private let directory: URL
  private let handler: Handler
  private var sessions = Set<String>()
  private var changes = 0
  private var uploadRequests = Set<UUID>()
  private var editing = false
  private let work = DispatchQueue(label: "app.nanoplayer.ios.wifi", qos: .utility)
  private var listener: NWListener?
  private var connections: [UUID: NWConnection] = [:]
  private var pending: [UUID: URL] = [:]
  private var reserved: [UUID: URL] = [:]
  private var code = ""
  private var address = ""
  private var uploaded = 0
  private var failedAttempts = 0
  private var lastFailure = Date.distantPast
  private var active = false
  private var startCompletion: ((Result<[String: Any], Error>) -> Void)?
  private let maxFileBytes = 512 * 1024 * 1024

  init(directory: URL, handler: @escaping Handler) { self.directory = directory; self.handler = handler }

  func start(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    work.async { [self] in
      do {
        guard let host = wifiAddress() else { throw failure("请先连接 Wi-Fi，再开启传歌") }
        sessions.removeAll()
        code = String(format: "%08u", arc4random_uniform(100_000_000))
        startCompletion = completion
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .wifi
        let server = try NWListener(using: parameters, on: .any)
        listener = server
        server.stateUpdateHandler = { [weak self] state in
          guard let self else { return }
          switch state {
          case .ready:
            guard let port = self.listener?.port else { return }
            self.active = true
            self.address = "http://\(host):\(port.rawValue)"
            self.startCompletion?(.success(self.info()))
            self.startCompletion = nil
          case .failed(let error):
            self.startCompletion?(.failure(error)); self.startCompletion = nil; self.shutdown()
          default: break
          }
        }
        server.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        server.start(queue: work)
      } catch { completion(.failure(error)) }
    }
  }

  func snapshot() -> [String: Any] { work.sync { info() } }
  @discardableResult
  func stop() -> [String: Any] {
    work.sync { shutdown(); return info() }
  }
  private func shutdown() {
    active = false; sessions.removeAll(); listener?.cancel(); listener = nil
    connections.values.forEach { $0.cancel() }; connections.removeAll()
    pending.values.forEach { try? FileManager.default.removeItem(at: $0) }; pending.removeAll()
    reserved.removeAll(); uploadRequests.removeAll(); editing = false
    startCompletion?(.failure(failure("接收已停止"))); startCompletion = nil
  }
  private func info() -> [String: Any] {
    let base: [String: Any] = ["active": active, "address": address, "code": code,
      "uploaded": uploaded, "changes": changes, "uri": directory.path]
    #if canImport(UIKit)
    var value = base
    if active, let data = address.data(using: .utf8), let filter = CIFilter(name: "CIQRCodeGenerator") {
      filter.setValue(data, forKey: "inputMessage")
      if let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 6, y: 6)),
        let cg = CIContext().createCGImage(output, from: output.extent),
        let png = UIImage(cgImage: cg).pngData() {
        value["qr"] = "data:image/png;base64," + png.base64EncodedString()
      }
    }
    return value
    #else
    return base
    #endif
  }

  private func accept(_ connection: NWConnection) {
    guard active, connections.count < 2 else { connection.cancel(); return }
    let id = UUID()
    connections[id] = connection
    connection.start(queue: work)
    work.asyncAfter(deadline: .now() + 120) { [weak self] in
      guard let self, self.connections[id] != nil else { return }
      self.close(connection, id: id)
    }
    receiveHeader(connection, id: id, buffer: Data())
  }

  private func receiveHeader(_ connection: NWConnection, id: UUID, buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, ended, error in
      guard let self, self.connections[id] != nil else { return }
      var bytes = buffer
      if let data { bytes.append(data) }
      guard bytes.count <= 32 * 1024 else { self.respond(connection, id: id, status: 431, text: "请求头过大"); return }
      guard let boundary = bytes.range(of: Data("\r\n\r\n".utf8)) else {
        if ended || error != nil { self.close(connection, id: id) }
        else { self.receiveHeader(connection, id: id, buffer: bytes) }
        return
      }
      guard boundary.lowerBound <= 16 * 1024,
        let text = String(data: bytes[..<boundary.lowerBound], encoding: .utf8) else {
        self.respond(connection, id: id, status: 400, text: "请求无效"); return
      }
      let lines = text.components(separatedBy: "\r\n")
      let request = (lines.first ?? "").split(separator: " ")
      guard request.count == 3, request[2] == "HTTP/1.1" else {
        self.respond(connection, id: id, status: 400, text: "请求无效"); return
      }
      var headers: [String: String] = [:]
      for line in lines.dropFirst() {
        guard let colon = line.firstIndex(of: ":") else { self.respond(connection, id: id, status: 400, text: "请求无效"); return }
        let key = line[..<colon].lowercased()
        guard headers[key] == nil else { self.respond(connection, id: id, status: 400, text: "重复请求头"); return }
        headers[key] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      }
      if request[0] == "GET" && request[1] == "/" {
        self.respond(connection, id: id, status: 200, text: WifiPage.html, html: true); return
      }
      guard request[0] == "POST", ["/pair", "/api", "/upload", "/logout"].contains(String(request[1])),
        headers["host"] == self.address.replacingOccurrences(of: "http://", with: ""),
        headers["origin"] == self.address else {
        self.respond(connection, id: id, status: 403, text: "请求来源不匹配"); return
      }
      if request[1] == "/pair" {
        if self.failedAttempts >= 5 && Date().timeIntervalSince(self.lastFailure) < 30 {
          self.respond(connection, id: id, status: 429, text: "配对失败次数过多，30 秒后重试"); return
        }
        guard headers["x-pairing-code"] == self.code else {
          self.failedAttempts += 1; self.lastFailure = Date()
          self.respond(connection, id: id, status: 403, text: "配对码错误"); return
        }
        self.failedAttempts = 0
        guard self.sessions.count < 8 else { self.respond(connection, id: id, status: 429, text: "连接过多，请先断开其他浏览器或重启 Wi-Fi 传输"); return }
        let token = UUID().uuidString + UUID().uuidString
        self.sessions.insert(token)
        self.respondJSON(connection, id: id, value: ["token": token]); return
      }
      guard self.active, let session = headers["x-session-token"], self.sessions.contains(session) else {
        self.respond(connection, id: id, status: 401, text: "请先配对，或会话已失效"); return
      }
      if request[1] == "/logout" {
        self.sessions.remove(session); self.respondJSON(connection, id: id, value: [:]); return
      }
      if request[1] == "/api" {
        guard headers["transfer-encoding"] == nil, let length = Int(headers["content-length"] ?? ""), length > 0, length <= 65536 else {
          self.respond(connection, id: id, status: 400, text: "请求大小无效"); return
        }
        self.receiveJSON(connection, id: id, bytes: Data(bytes[boundary.upperBound...]), length: length, ended: ended)
        return
      }
      guard headers["transfer-encoding"] == nil,
        let length = Int(headers["content-length"] ?? ""), length > 0, length <= self.maxFileBytes,
        let name = headers["x-file-name"]?.removingPercentEncoding,
        UploadRules.valid(name: name, bytes: length) else {
        self.respond(connection, id: id, status: 400, text: "支持音频文件，单个文件最大 512MB"); return
      }
      guard !self.editing, let target = headers["x-directory-id"] else {
        self.respond(connection, id: id, status: 400, text: "请选择上传目录"); return
      }
      let first = Data(bytes[boundary.upperBound...])
      self.uploadRequests.insert(id)
      self.handler("uploadTarget", ["id": target, "name": name]) { result in
        self.work.async {
          guard self.connections[id] != nil, self.active else { return }
          do {
            let info = try result.get()
            guard let path = info["directory"] as? String else { throw self.failure("目标不可用") }
            let parent = URL(fileURLWithPath: path)
            let existing = try FileManager.default.contentsOfDirectory(atPath: path)
            let names = Set((existing + self.reserved.values.filter { $0.deletingLastPathComponent() == parent }.map(\.lastPathComponent)).map(NativeLibrary.nameKey))
            let file = URL(fileURLWithPath: name), ext = file.pathExtension
            let base = file.deletingPathExtension().lastPathComponent
            var finalName = name, suffix = 2
            while names.contains(NativeLibrary.nameKey(finalName)) {
              finalName = "\(base)（\(suffix)）" + (ext.isEmpty ? "" : "." + ext); suffix += 1
            }
            let staging = parent.appendingPathComponent(".upload-\(id.uuidString)")
            guard FileManager.default.createFile(atPath: staging.path, contents: nil), let handle = try? FileHandle(forWritingTo: staging) else {
              throw self.failure("无法写入，请检查可用空间")
            }
            self.pending[id] = staging
            let destination = parent.appendingPathComponent(finalName)
            self.reserved[id] = destination
            self.receiveBody(connection, id: id, handle: handle, received: 0, length: length, bytes: first, ended: ended, destination: destination)
          } catch { self.respond(connection, id: id, status: 409, text: error.localizedDescription) }
        }
      }

    }
  }

  private func receiveJSON(_ connection: NWConnection, id: UUID, bytes: Data, length: Int, ended: Bool) {
    guard bytes.count <= length else { respond(connection, id: id, status: 400, text: "请求长度无效"); return }
    if bytes.count < length {
      guard !ended else { close(connection, id: id); return }
      connection.receive(minimumIncompleteLength: 1, maximumLength: min(65536, length - bytes.count)) { [weak self] data, _, ended, error in
        guard let self, self.connections[id] != nil else { return }
        if error != nil { self.close(connection, id: id); return }
        self.receiveJSON(connection, id: id, bytes: bytes + (data ?? Data()), length: length, ended: ended)
      }
      return
    }
    do {
      guard let args = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], let action = args["action"] as? String else { throw failure("请求无效") }
      let readOnly = action == "list"
      guard readOnly || (uploadRequests.isEmpty && !editing) else { throw failure("正在上传，请等待当前上传完成再编辑目录") }
      if !readOnly { editing = true }
      handler(action, args) { result in
        self.work.async {
          if !readOnly { self.editing = false }
          guard self.connections[id] != nil, self.active else { return }
          do { let value = try result.get(); if !readOnly { self.changes += 1 }; self.respondJSON(connection, id: id, value: value) }
          catch { self.respond(connection, id: id, status: 409, text: error.localizedDescription) }
        }
      }
    } catch { respond(connection, id: id, status: 400, text: error.localizedDescription) }
  }
  private func respondJSON(_ connection: NWConnection, id: UUID, value: [String: Any]) {
    do {
      let bytes = try JSONSerialization.data(withJSONObject: value)
      respond(connection, id: id, status: 200, text: String(decoding: bytes, as: UTF8.self), json: true)
    } catch { respond(connection, id: id, status: 500, text: "响应失败") }
  }

  private func receiveBody(_ connection: NWConnection, id: UUID, handle: FileHandle,
    received: Int, length: Int, bytes: Data, ended: Bool, destination: URL) {
    do {
      guard received + bytes.count <= length else { throw failure("文件长度无效") }
      try handle.write(contentsOf: bytes)
      let total = received + bytes.count
      if total == length {
        try handle.close()
        guard let source = pending[id] else { throw failure("上传已取消") }
        try FileManager.default.moveItem(at: source, to: destination)
        pending.removeValue(forKey: id); uploaded += 1; changes += 1
        respond(connection, id: id, status: 201, text: "上传完成"); return
      }
      guard !ended else { throw failure("上传中断，请重新上传") }
      connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, ended, error in
        guard let self, self.connections[id] != nil else { try? handle.close(); return }
        if error != nil { try? handle.close(); self.close(connection, id: id); return }
        self.receiveBody(connection, id: id, handle: handle, received: total, length: length,
          bytes: data ?? Data(), ended: ended, destination: destination)
      }
    } catch {
      try? handle.close(); respond(connection, id: id, status: 400, text: error.localizedDescription)
    }
  }
  private func respond(_ connection: NWConnection, id: UUID, status: Int, text: String, html: Bool = false, json: Bool = false) {
    let body = Data(text.utf8)
    let header = "HTTP/1.1 \(status) Response\r\nContent-Type: \(html ? "text/html" : json ? "application/json" : "text/plain"); charset=utf-8\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n"
    connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { [weak self] _ in self?.close(connection, id: id) })
  }
  private func close(_ connection: NWConnection, id: UUID) {
    connection.cancel(); connections.removeValue(forKey: id)
    reserved.removeValue(forKey: id); uploadRequests.remove(id)
    if let url = pending.removeValue(forKey: id) { try? FileManager.default.removeItem(at: url) }
  }
  private func failure(_ message: String) -> NSError {
    NSError(domain: "nanoPlayer.wifi", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  private func wifiAddress() -> String? {
    var interfaces: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&interfaces) == 0 else { return nil }
    defer { freeifaddrs(interfaces) }
    var cursor = interfaces
    while let current = cursor {
      let entry = current.pointee
      if String(cString: entry.ifa_name) == "en0", let sockaddr = entry.ifa_addr,
        sockaddr.pointee.sa_family == UInt8(AF_INET) {
        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        if getnameinfo(sockaddr, socklen_t(sockaddr.pointee.sa_len), &hostname,
          socklen_t(hostname.count), nil, 0, NI_NUMERICHOST) == 0 { return String(cString: hostname) }
      }
      cursor = entry.ifa_next
    }
    return nil
  }

}
