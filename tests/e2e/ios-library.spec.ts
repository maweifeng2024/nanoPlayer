import { expect, test } from "@playwright/test";
test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15", hasTouch: true, viewport: { width: 390, height: 844 } });
async function library(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator(".phone-navigation").getByRole("button", { name: "资料库" }).click();
  await page.locator(".phone-library-tabs").getByRole("button", { name: "本地资料库" }).click();
  await expect(page.getByText("浏览器演示：文件操作仅影响示例，不读取设备文件。")).toBeVisible();
  await expect(page.locator('.ios-library input:not([type="checkbox"])')).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "全局搜索" })).toHaveCount(0);
}
test("first-level only selection and single-entry managed operations", async ({ page }) => {
  await library(page);
  await expect(page.getByRole("region", { name: "外部只读来源" })).toBeVisible();
  const choice = page.getByRole("checkbox", { name: "加入音乐库 演唱会", exact: true });
  await choice.uncheck(); await expect(choice).not.toBeChecked();
  await page.getByRole("button", { name: "浏览 nanoPlayer 根目录", exact: true }).click();
  await expect(page.locator(".ios-file-browser input[type=checkbox]")).toHaveCount(0);
  await page.getByRole("button", { name: "新建文件夹", exact: true }).click();
  await page.getByRole("dialog").getByLabel("名称", { exact: true }).fill("测试专辑");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  const more = page.getByRole("button", { name: "更多操作 测试专辑", exact: true });
  await more.click(); await expect(page.getByRole("menu")).toBeVisible();
  await more.click(); await expect(page.getByRole("menu")).toBeHidden();
  await more.click(); await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  await page.getByRole("dialog").getByLabel("名称", { exact: true }).fill("现场录音");
  await page.getByRole("dialog").getByRole("button", { name: "保存" }).click();
  await page.getByRole("button", { name: "更多操作 现场录音", exact: true }).click();
  await page.getByRole("menuitem", { name: "移动到", exact: true }).click();
  const destination = page.getByRole("dialog", { name: "选择 nanoPlayer 目标文件夹" });
  await expect(destination.getByRole("button", { name: "现场录音", exact: true })).toBeDisabled();
  await destination.getByRole("button", { name: "演唱会", exact: true }).click();
  await destination.getByRole("button", { name: "选择此文件夹" }).click();
  await expect(page.getByRole("status")).toContainText("完成 1 项");
  await page.locator(".ios-file-open").filter({ hasText: "演唱会" }).click();
  await expect(page.locator(".ios-file-open").filter({ hasText: "现场录音" })).toBeVisible();
  await page.screenshot({ path: "test-results/ios-library-phone-managed.png" });
});
test("external references are explicit and offer copy without child checkboxes", async ({ page }) => {
  await library(page);
  await page.locator(".ios-source-open").filter({ hasText: "Files · iCloud Drive" }).click();
  await expect(page.getByText("只读引用 · 音频存储于外部，不创建 nanoPlayer 副本。", { exact: true })).toBeVisible();
  await expect(page.locator(".ios-file-browser input[type=checkbox]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新建文件夹", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "更多操作 示例.flac", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "移动到", exact: true })).toBeHidden();
  await page.getByRole("menuitem", { name: "复制到 nanoPlayer", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "选择此文件夹" }).click();
  await expect(page.getByRole("status")).toContainText("完成 1 项");
  await page.getByRole("button", { name: "全部来源", exact: true }).click();
  await page.getByRole("button", { name: "添加 ＋", exact: true }).click();
  await expect(page.getByRole("button", { name: "引用 Files 文件夹（只读）" })).toBeVisible();
  await expect(page.getByRole("button", { name: "复制文件到 nanoPlayer", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Wi-Fi 传输", exact: true }).click();
  const wifi = page.getByRole("dialog", { name: "Wi-Fi 传输", exact: true });
  await expect(wifi).toContainText("选择任意层级上传");
  await wifi.getByRole("button", { name: "开启 Wi-Fi 传输" }).click();
  await expect(wifi.getByRole("alert")).toContainText("需要安装 iOS 应用");
  await page.keyboard.press("Escape"); await expect(wifi).toBeHidden();
});
test("managed first-level menus rename directly without opening the file browser", async ({ page }) => {
  await library(page);
  await page.getByRole('button', { name: '更多操作 演唱会', exact: true }).click();
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
  await page.getByRole('dialog').getByLabel('名称', { exact: true }).fill('一级现场');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '浏览 一级现场', exact: true })).toBeVisible();
  await expect(page.locator('.ios-file-browser')).toHaveCount(0);
});
test("a reference creates no record until the explicit confirmation", async ({ page }) => {
  await library(page);
  const originalCount = await page.locator('.ios-source-open').count();
  await page.getByRole('button', { name: '添加 ＋', exact: true }).click();
  await page.getByRole('button', { name: '引用 Files 文件夹（只读）' }).click();
  const draft = page.getByRole('dialog', { name: '确认只读引用' });
  await expect(draft).toContainText('不会复制到 nanoPlayer');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ios-source-open')).toHaveCount(originalCount);
  await page.getByRole('button', { name: '添加 ＋', exact: true }).click();
  await page.getByRole('button', { name: '引用 Files 文件夹（只读）' }).click();
  await draft.getByLabel('名称', { exact: true }).fill('只读爵士乐');
  await draft.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '浏览 只读爵士乐', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('未创建 nanoPlayer 音频副本');
});
test.describe("iPad resource browser", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15", viewport: { width: 1024, height: 1000 } });
  test("source tree adapts to narrow windows and both themes", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar").getByRole("button", { name: "本地资料库", exact: true }).click();
    await page.getByRole("button", { name: "浏览 收件箱", exact: true }).click();
    for (const theme of ["dark", "light"]) {
      await page.evaluate(async (theme) => (await import("/src/store.ts")).useNanoStore.getState().setTheme(theme as "dark" | "light"), theme);
      for (const width of [1024, 840, 600, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width >= 1000) await expect(page.locator(".ios-source-list")).toBeVisible();
        else await expect(page.locator(".ios-source-list")).toBeHidden();
        const browser = await page.locator(".ios-file-browser").boundingBox();
        expect(browser!.x).toBeGreaterThanOrEqual(0);
        expect(browser!.x + browser!.width).toBeLessThanOrEqual(width);
        await page.screenshot({ path: `test-results/ios-library-pad-${theme}-${width}.png` });
      }
    }
  });
});

test("read-only songs use first-level selection instead of obsolete root IDs", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const { demoRoot, demoTracks } = await import("/src/domain.ts");
    const tracks = [3, 4, 5].map((id) => ({ ...demoTracks[0], id, rootId: id,
      title: `Referenced song ${id}`, path: `/external/source-${id}/song.wav` }));
    useNanoStore.setState({ roots: [3, 4, 5].map((id) => ({ ...demoRoot, id, path: `/external/source-${id}` })),
      tracks, selectedRootIds: [1, 3], libraryScopes: [3, 4, 5].map((id) => ({ id: `source-${id}`, path: `/external/source-${id}`, selected: true })),
      page: "songs", queue: [], currentTrackId: undefined, playing: false });
  });
  await expect(page.locator('.track-row')).toHaveCount(3);
  await expect(page.locator('.track-row.is-excluded')).toHaveCount(0);
  await page.locator('[data-track-id="4"] .track-title').dblclick();
  await expect.poll(() => page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    return useNanoStore.getState().currentTrackId;
  })).toBe(4);
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    useNanoStore.getState().setPage("playlist", "mixed-reference");
    useNanoStore.setState({ playlists: [{ id: "mixed-reference", name: "References", trackIds: [3, 4, 5] }] });
    useNanoStore.getState().setLibraryScopes(useNanoStore.getState().libraryScopes.map((scope) => ({ ...scope, selected: scope.id !== "source-4" })));
  });
  await expect(page.locator('[data-track-id="4"]')).toHaveClass(/is-excluded/);
  await expect(page.locator('[data-track-id="5"]')).not.toHaveClass(/is-excluded/);
});
