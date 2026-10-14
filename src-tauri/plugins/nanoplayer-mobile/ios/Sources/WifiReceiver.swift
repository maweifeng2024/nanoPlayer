import CoreImage
import Darwin
import Foundation
import Network
import UIKit

/// A foreground-only, explicitly started LAN receiver. Each request streams to
/// a staging file; authenticated, complete files are moved into app-owned music.
final class WifiReceiver {
  private let directory: URL
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

  init(directory: URL) { self.directory = directory }

  func start(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    work.async { [self] in
      do {
        guard let host = wifiAddress() else { throw failure("请先连接 Wi-Fi，再开启传歌") }
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
    active = false; listener?.cancel(); listener = nil
    connections.values.forEach { $0.cancel() }; connections.removeAll()
    pending.values.forEach { try? FileManager.default.removeItem(at: $0) }; pending.removeAll()
    reserved.removeAll()
    startCompletion?(.failure(failure("接收已停止"))); startCompletion = nil
  }
  private func info() -> [String: Any] {
    var value: [String: Any] = ["active": active, "address": address, "code": code,
      "uploaded": uploaded, "uri": directory.path]
    if active, let data = address.data(using: .utf8), let filter = CIFilter(name: "CIQRCodeGenerator") {
      filter.setValue(data, forKey: "inputMessage")
      if let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 6, y: 6)),
        let cg = CIContext().createCGImage(output, from: output.extent),
        let png = UIImage(cgImage: cg).pngData() {
        value["qr"] = "data:image/png;base64," + png.base64EncodedString()
      }
    }
    return value
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
        self.respond(connection, id: id, status: 200, text: Self.page, html: true); return
      }
      guard request[0] == "POST", request[1] == "/upload" else {
        self.respond(connection, id: id, status: 404, text: "页面不存在"); return
      }
      if self.failedAttempts >= 5 && Date().timeIntervalSince(self.lastFailure) < 30 {
        self.respond(connection, id: id, status: 429, text: "配对失败次数过多，30 秒后重试"); return
      }
      guard headers["x-pairing-code"] == self.code else {
        self.failedAttempts += 1; self.lastFailure = Date()
        self.respond(connection, id: id, status: 403, text: "配对码错误"); return
      }
      self.failedAttempts = 0
      // Browser requests are same-origin. No CORS support or unauthenticated writes.
      if let origin = headers["origin"], origin != self.address {
        self.respond(connection, id: id, status: 403, text: "来源不匹配"); return
      }
      guard headers["transfer-encoding"] == nil,
        let length = Int(headers["content-length"] ?? ""), length > 0, length <= self.maxFileBytes,
        let name = headers["x-file-name"]?.removingPercentEncoding,
        UploadRules.valid(name: name, bytes: length) else {
        self.respond(connection, id: id, status: 400, text: "支持音频文件，单个文件最大 512MB"); return
      }
      let staging = self.directory.appendingPathComponent(".upload-\(id.uuidString)")
      guard FileManager.default.createFile(atPath: staging.path, contents: nil),
        let handle = try? FileHandle(forWritingTo: staging) else {
        self.respond(connection, id: id, status: 507, text: "无法写入，检查可用空间"); return
      }
      self.pending[id] = staging
      let existing = (try? FileManager.default.contentsOfDirectory(atPath: self.directory.path)) ?? []
      let names = Set((existing + self.reserved.values.map(\.lastPathComponent)).map(NativeLibrary.nameKey))
      let file = URL(fileURLWithPath: name), ext = file.pathExtension
      let base = file.deletingPathExtension().lastPathComponent
      var finalName = name, suffix = 2
      while names.contains(NativeLibrary.nameKey(finalName)) {
        finalName = "\(base)（\(suffix)）" + (ext.isEmpty ? "" : "." + ext); suffix += 1
      }
      let destination = self.directory.appendingPathComponent(finalName)
      self.reserved[id] = destination
      let first = Data(bytes[boundary.upperBound...])
      self.receiveBody(connection, id: id, handle: handle, received: 0, length: length,
        bytes: first, ended: ended, destination: destination)
    }
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
        pending.removeValue(forKey: id); uploaded += 1
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
  private func respond(_ connection: NWConnection, id: UUID, status: Int, text: String, html: Bool = false) {
    let body = Data(text.utf8)
    let header = "HTTP/1.1 \(status) Response\r\nContent-Type: \(html ? "text/html" : "text/plain"); charset=utf-8\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n"
    connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { [weak self] _ in self?.close(connection, id: id) })
  }
  private func close(_ connection: NWConnection, id: UUID) {
    connection.cancel(); connections.removeValue(forKey: id)
    reserved.removeValue(forKey: id)
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

  private static let page = """
  <!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>nanoPlayer · Wi-Fi 传歌</title><style>
  body{font:16px system-ui;background:#18181b;color:#fafafa;margin:0;padding:32px;max-width:640px;margin-inline:auto}
  h1{font-size:28px}input,button{font:inherit;padding:12px;border-radius:8px;margin:8px 0;max-width:100%;box-sizing:border-box}
  button{background:#fb7185;color:#18181b;border:0}p{line-height:1.6;color:#c4c4cc}pre{white-space:pre-wrap;overflow-wrap:anywhere}
  </style><h1>nanoPlayer · Wi-Fi 传歌</h1>
  <p>保持手机接收页打开。在同一可信 Wi-Fi 内上传音乐，单个文件最大 512MB。传输使用本地 HTTP，配对码仅用于本次接收。文件复制到应用资料库。</p>
  <form id="form"><label>手机上显示的配对码 <input id="code" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required autocomplete="off"></label>
  <p><input id="files" type="file" multiple accept=".mp3,.m4a,.aac,.flac,.wav,.aiff,.aif,.alac" required></p>
  <button id="send">开始上传</button></form><pre id="result" role="status" aria-live="polite"></pre>
  <script>
  const form=document.querySelector('#form'),button=document.querySelector('#send'),result=document.querySelector('#result');
  form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;result.textContent='';
  try{for(const file of document.querySelector('#files').files){
  result.textContent+='正在上传 '+file.name+'…\\n';
  const response=await fetch('/upload',{method:'POST',headers:{'X-Pairing-Code':document.querySelector('#code').value,'X-File-Name':encodeURIComponent(file.name)},body:file});
  const text=await response.text();result.textContent+=file.name+'：'+text+'\\n';if(!response.ok)break;
  }}catch(error){result.textContent+='连接中断，请确认手机接收页仍打开后重试。';}finally{button.disabled=false;}});
  </script></html>
  """
}
