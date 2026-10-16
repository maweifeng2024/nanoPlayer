import Foundation
let directory = URL(fileURLWithPath: CommandLine.arguments[1])
let library = try NativeLibrary(managed: directory.appendingPathComponent("Music"), support: directory.appendingPathComponent("Support"))
let worker = DispatchQueue(label: "nanoplayer.wifi.test.library")
let rootId = try library.directoryID("")
let receiver = WifiReceiver(directory: library.managed) { action, args, completion in
  worker.async {
    do {
      let result = try library.browserCommand(action, values: args, rootId: rootId, initialId: rootId)
      // Production Rust consumes mappings before acknowledgement; DB identity has its own regression.
      _ = try library.pendingMoves()
      try library.acknowledgeMoves()
      completion(.success(result))
    } catch { completion(.failure(error)) }
  }
}
receiver.start { result in
  do {
    let value = try result.get()
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: ["address": value["address"]!, "code": value["code"]!]))
    FileHandle.standardOutput.write(Data("\n".utf8))
  } catch { FileHandle.standardError.write(Data(error.localizedDescription.utf8)); exit(1) }
}
RunLoop.main.run()
