import XCTest

final class LaunchTests: XCTestCase {
  func testLaunchAndLibraryNavigation() {
    let app = XCUIApplication()
    // XCTest's console forwarding feeds unified logs back into Tauri's stderr reader.
    app.launchEnvironment["OS_ACTIVITY_DT_MODE"] = "NO"
    app.launch()
    XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
    let dismiss = app.buttons["稍后再说"]
    if dismiss.waitForExistence(timeout: 5) { dismiss.tap() }
    let navigation = app.buttons["打开导航"]
    if navigation.exists && navigation.isHittable { navigation.tap() }
    let folders = app.buttons["本地资料库"].firstMatch
    XCTAssertTrue(folders.waitForExistence(timeout: 5))
    folders.tap()
    XCTAssertTrue(app.buttons["Wi-Fi 传输"].waitForExistence(timeout: 10))
    app.buttons["Wi-Fi 传输"].tap()
    XCTAssertTrue(app.buttons["开启 Wi-Fi 传输"].waitForExistence(timeout: 5))
    app.buttons["关闭"].firstMatch.tap()
    XCTAssertFalse(app.buttons["开启 Wi-Fi 传输"].exists)
    let managed = app.buttons["浏览 nanoPlayer 根目录"]
    XCTAssertTrue(managed.waitForExistence(timeout: 10))
    managed.tap()
    let create = app.buttons["新建文件夹"]
    XCTAssertTrue(create.waitForExistence(timeout: 5))
    create.tap()
    let field = app.textFields["名称"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    let folderName = "原生回归-\(Int(Date().timeIntervalSince1970))"
    field.tap(); field.typeText(folderName)
    app.buttons["保存"].tap()
    let more = app.buttons["更多操作 \(folderName)"]
    XCTAssertTrue(more.waitForExistence(timeout: 10))
    more.tap()
    app.buttons["移动到"].tap()
    let inbox = app.buttons["收件箱"]
    XCTAssertTrue(inbox.waitForExistence(timeout: 5))
    inbox.tap()
    app.buttons["选择此文件夹"].tap()
    XCTAssertTrue(more.waitForNonExistence(timeout: 10))
    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "收件箱")).firstMatch.tap()
    XCTAssertTrue(more.waitForExistence(timeout: 10))
    more.tap()
    let remove = app.buttons["删除目录"]
    XCTAssertTrue(remove.waitForExistence(timeout: 5))
    remove.tap()
    app.buttons["确认"].tap()
    XCTAssertTrue(more.waitForNonExistence(timeout: 10))
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "ios-library"; attachment.lifetime = .keepAlways
    add(attachment)
  }
  func testWifiTransferUploadsIntoChosenDirectory() throws {
    let app = XCUIApplication()
    app.launchEnvironment["OS_ACTIVITY_DT_MODE"] = "NO"
    app.launch()
    XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
    let later = app.buttons["稍后再说"]
    if later.waitForExistence(timeout: 2) { later.tap() }
    if app.buttons["打开导航"].exists && app.buttons["打开导航"].isHittable { app.buttons["打开导航"].tap() }
    app.buttons["本地资料库"].firstMatch.tap()
    app.buttons["Wi-Fi 传输"].tap()
    app.buttons["开启 Wi-Fi 传输"].tap()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    for label in ["Allow", "允许"] {
      let allow = springboard.buttons[label]
      if allow.waitForExistence(timeout: 2) { allow.tap() }
    }
    let addressLabel = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "http://")).firstMatch
    XCTAssertTrue(addressLabel.waitForExistence(timeout: 15), "Receiver must expose a real LAN address")
    let rawAddress = addressLabel.label
    let addressRange = try XCTUnwrap(rawAddress.range(of: "http://[0-9.]+:[0-9]+", options: .regularExpression))
    let address = String(rawAddress[addressRange])
    let labels = app.staticTexts.allElementsBoundByIndex.map(\.label)
    let code = try XCTUnwrap(labels.compactMap { label -> String? in
      guard let range = label.range(of: "[0-9]{8}", options: .regularExpression) else { return nil }
      return String(label[range])
    }.first)
    func request(_ route: String, body: Data = Data(), headers: [String: String] = [:]) throws -> (Data, Int) {
      var req = URLRequest(url: try XCTUnwrap(URL(string: address + route)))
      req.httpMethod = "POST"; req.httpBody = body
      req.setValue(address, forHTTPHeaderField: "Origin")
      for (key, value) in headers { req.setValue(value, forHTTPHeaderField: key) }
      let finished = expectation(description: route)
      var answer: (Data, Int)?, failure: Error?
      URLSession.shared.dataTask(with: req) { data, response, error in
        failure = error
        answer = (data ?? Data(), (response as? HTTPURLResponse)?.statusCode ?? 0)
        finished.fulfill()
      }.resume()
      wait(for: [finished], timeout: 20)
      if let failure { throw failure }
      return try XCTUnwrap(answer)
    }
    let paired = try request("/pair", headers: ["X-Pairing-Code": code])
    XCTAssertEqual(paired.1, 200)
    let token = try XCTUnwrap((JSONSerialization.jsonObject(with: paired.0) as? [String: Any])?["token"] as? String)
    func api(_ action: String, _ values: [String: Any] = [:]) throws -> [String: Any] {
      var args = values; args["action"] = action
      let response = try request("/api", body: JSONSerialization.data(withJSONObject: args), headers: ["X-Session-Token": token])
      XCTAssertEqual(response.1, 200, String(decoding: response.0, as: UTF8.self))
      return try XCTUnwrap(JSONSerialization.jsonObject(with: response.0) as? [String: Any])
    }
    var listing = try api("list")
    let parentId = try XCTUnwrap(listing["currentId"] as? String)
    let name = "WiFi回归-\(Int(Date().timeIntervalSince1970))"
    _ = try api("create", ["id": parentId, "revision": listing["revision"]!, "name": name])
    listing = try api("list", ["id": parentId])
    let entries = try XCTUnwrap(listing["entries"] as? [[String: Any]])
    let target = try XCTUnwrap(entries.first { $0["name"] as? String == name }?["id"] as? String)
    var wave = Data("RIFF".utf8)
    func append<T: FixedWidthInteger>(_ number: T) { var n = number.littleEndian; withUnsafeBytes(of: &n) { wave.append(contentsOf: $0) } }
    append(UInt32(16036)); wave.append(Data("WAVEfmt ".utf8)); append(UInt32(16)); append(UInt16(1)); append(UInt16(1))
    append(UInt32(8000)); append(UInt32(16000)); append(UInt16(2)); append(UInt16(16)); wave.append(Data("data".utf8)); append(UInt32(16000)); wave.append(Data(repeating: 0, count: 16000))
    let uploaded = try request("/upload", body: wave, headers: ["X-Session-Token": token, "X-Directory-Id": target, "X-File-Name": "fixture.wav"])
    XCTAssertEqual(uploaded.1, 201)
    let content = try api("list", ["id": target])
    XCTAssertTrue((content["entries"] as? [[String: Any]])?.contains { $0["name"] as? String == "fixture.wav" } == true)
    app.buttons["停止传输"].tap()
    app.buttons["关闭"].firstMatch.tap()
    app.buttons["浏览 nanoPlayer 根目录"].tap()
    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "收件箱")).firstMatch.tap()
    let more = app.buttons["更多操作 \(name)"]
    XCTAssertTrue(more.waitForExistence(timeout: 10))
    more.tap(); app.buttons["删除目录"].tap(); app.buttons["确认"].tap()
    XCTAssertTrue(more.waitForNonExistence(timeout: 10))
  }

}
