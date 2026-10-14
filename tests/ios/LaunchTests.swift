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
    XCTAssertTrue(app.buttons["Wi-Fi 传歌"].waitForExistence(timeout: 10))
    app.buttons["Wi-Fi 传歌"].tap()
    XCTAssertTrue(app.buttons["开启接收"].waitForExistence(timeout: 5))
    app.buttons["关闭"].firstMatch.tap()
    XCTAssertFalse(app.buttons["开启接收"].exists)
    let managed = app.buttons["浏览 nanoPlayer"]
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
    app.buttons["选择"].tap()
    let selectFolder = app.descendants(matching: .any).matching(identifier: "选择 \(folderName)").firstMatch
    XCTAssertTrue(selectFolder.waitForExistence(timeout: 5))
    selectFolder.tap()
    app.buttons["移动到"].tap()
    let inbox = app.buttons["收件箱"]
    XCTAssertTrue(inbox.waitForExistence(timeout: 5))
    inbox.tap()
    app.buttons["选择此文件夹"].tap()
    XCTAssertTrue(more.waitForNonExistence(timeout: 10))
    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "收件箱")).firstMatch.tap()
    XCTAssertTrue(more.waitForExistence(timeout: 10))
    more.tap()
    let remove = app.buttons["删除空文件夹"]
    XCTAssertTrue(remove.waitForExistence(timeout: 5))
    remove.tap()
    XCTAssertTrue(more.waitForNonExistence(timeout: 10))
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "ios-library"; attachment.lifetime = .keepAlways
    add(attachment)
  }
}
