import { expect, test } from "@playwright/test";

test("supports the first-version library and playback journey", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero h1")).toBeVisible();
  await expect(page.locator(".stats-grid")).toHaveCount(0);
  await expect(page.locator(".brand")).toHaveText("nanoPlayer");
  await expect(page.locator(".brand img")).toHaveCount(0);
  await expect(page.getByText("资料库", { exact: true })).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/nanoplayer-designed-home.png", fullPage: true });
  await page.getByRole("button", { name: "本地资料库" }).click();
  await expect(page.getByRole("button", { name: "本地资料库" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "本地资料库" })).toBeVisible();
  await expect(page.getByText("不会修改、移动或删除")).toBeVisible();
  await expect(page.getByText("8 首歌曲").first()).toBeVisible();

  await page.getByRole("button", { name: "歌曲", exact: true }).click();
  await expect(page.getByRole("table", { name: "歌曲列表" })).toBeVisible();
  await page.getByRole("button", { name: "播放 海平面以下" }).click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await page.getByRole("button", { name: "打开正在播放页" }).click();
  await expect(page.getByRole("heading", { name: "海平面以下" })).toBeVisible();
  await page.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "歌词" })).toContainText("光沉入蓝色的森林");
  await page.screenshot({ path: "test-results/nanoplayer-first-version.png", fullPage: true });
});

test("filters tracks globally and exposes privacy settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "歌曲", exact: true }).click();
  await page.getByRole("textbox", { name: "全局搜索" }).fill("Northbound");
  await expect(page.getByRole("row")).toHaveCount(3);
  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByText("源文件只读")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "立即备份" })).toBeVisible();
  await page.getByRole("button", { name: "立即备份" }).click();
  await expect(page.getByRole("status")).toContainText("仅在桌面版可用");
});

test("opens collection details and keyboard queue", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("主导航").getByRole("button", { name: "专辑", exact: true }).click();
  await page.getByRole("button", { name: /潮汐与回声/ }).click();
  await expect(page.getByRole("heading", { name: "潮汐与回声" })).toBeVisible();
  await expect(page.getByRole("table", { name: "歌曲列表" })).toBeVisible();
  await page.keyboard.press("Meta+Shift+Q");
  await expect(page.getByRole("complementary", { name: "播放队列" })).toBeVisible();
  expect(
    await page
      .locator(".content")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});

test("supports sorting, batch playlist actions and theme choice", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.getByLabel("主导航").getByRole("button", { name: "歌曲", exact: true }).click();
  await page.getByRole("button", { name: "添加日期" }).click();
  await expect(page.getByRole("button", { name: /添加日期 ↑/ })).toBeVisible();
  await page.getByRole("button", { name: "批量选择" }).click();
  await page.getByRole("button", { name: "选择 迟到的风" }).click();
  await page.getByText("添加到歌单", { exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "安静的晚上" }).click();
  await expect(page.getByRole("status")).toContainText("已将 1 首歌曲添加到歌单");

  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: "浅色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("shows three title-only home lists and keeps rating as the second song column", async ({
  page,
}) => {
  await page.goto("/");
  const homeLists = page.getByLabel("首页歌曲推荐");
  await expect(homeLists.getByRole("region")).toHaveCount(3);
  await expect(homeLists.getByRole("region", { name: "最近添加" })).toBeVisible();
  await expect(homeLists.getByRole("region", { name: "播放最多" })).toBeVisible();
  await expect(homeLists.getByRole("region", { name: "高评分" })).toBeVisible();
  await expect(homeLists.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByLabel("主导航").getByRole("button", { name: "最近播放" }),
  ).toHaveCount(0);

  await page.getByLabel("主导航").getByRole("button", { name: "歌曲", exact: true }).click();
  const headers = page.locator(".track-head > *");
  await expect(headers.nth(1)).toHaveText("标题");
  await expect(headers.nth(2)).toHaveText("评分");
});

test("keeps the core controls usable at the 720px minimum width", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
  await expect(page.getByRole("button", { name: "播放", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "打开导航" }).click();
  const navigation = page.getByLabel("主导航");
  await expect(navigation).toBeVisible();
  await expect(navigation).toHaveCSS("transform", "none");
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: "test-results/nanoplayer-720.png", fullPage: true });
});

test("opens track details, keeps genre metadata, and saves an app-local override", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "歌曲", exact: true }).click();
  const titleButton = page.getByRole("button", { name: /海平面以下.*查看详情/ });
  await titleButton.dblclick();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await titleButton.click();
  const dialog = page.getByRole("dialog", { name: "海平面以下" });
  await expect(dialog).toContainText("氛围");
  await dialog.getByRole("button", { name: "编辑元数据" }).click();
  await expect(dialog.getByRole("button", { name: "恢复标题原值" })).toBeVisible();
  await dialog.getByText("标题").locator("..").getByRole("textbox").fill("海平面以下（珍藏版）");
  await dialog.getByRole("button", { name: "保存覆盖" }).click();
  await expect(page.getByRole("status")).toContainText("源音乐文件未修改");
  await expect(page.getByRole("heading", { name: "海平面以下（珍藏版）" })).toBeVisible();
});

test("switches album and artist on the first click and flattens artist tracks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("主导航").getByRole("button", { name: "专辑", exact: true }).click();
  await page.getByRole("button", { name: /潮汐与回声/ }).click();
  await expect(page.getByRole("heading", { name: "潮汐与回声" })).toBeVisible();
  await page.getByLabel("主导航").getByRole("button", { name: "艺术家", exact: true }).click();
  await expect(page.getByRole("heading", { name: "艺术家" })).toBeVisible();
  await page.getByRole("button", { name: /林岚/ }).click();
  await expect(page.getByRole("heading", { name: "林岚" })).toBeVisible();
  await expect(page.getByRole("table", { name: "歌曲列表" })).toHaveCount(1);
  await expect(page.getByText("热门曲目")).toHaveCount(0);
});

test("creates, renames, and fills a playlist through app dialogs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建歌单" }).click();
  const createDialog = page.getByRole("dialog", { name: "新建歌单" });
  await createDialog.getByRole("textbox").fill("通勤");
  await createDialog.getByRole("button", { name: "创建" }).click();
  await expect(page.getByRole("heading", { name: "通勤" })).toBeVisible();
  await page.getByRole("button", { name: "添加歌曲" }).click();
  const picker = page.getByRole("dialog", { name: /添加歌曲到/ });
  await picker.getByRole("checkbox", { name: /迟到的风/ }).check();
  await picker.getByRole("button", { name: "添加 1 首" }).click();
  await expect(page.getByRole("row", { name: /迟到的风/ })).toBeVisible();
  await page.getByRole("button", { name: "重命名" }).click();
  const renameDialog = page.getByRole("dialog", { name: "重命名歌单" });
  await renameDialog.getByRole("textbox").fill("夜间通勤");
  await renameDialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: "夜间通勤" })).toBeVisible();
  const deleteButton = page.getByRole("button", { name: "删除歌单" });
  await deleteButton.click();
  await expect(page.getByRole("alertdialog", { name: "删除歌单" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog", { name: "删除歌单" })).toHaveCount(0);
  await expect(deleteButton).toBeFocused();
});

test("shows only played tracks in most-played and paints playback progress", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("主导航").getByRole("button", { name: "播放最多", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(4);
  await expect(page.getByRole("row", { name: /迟到的风/ })).toHaveCount(0);
  await page.getByRole("button", { name: "播放 海平面以下" }).click();
  await expect
    .poll(async () => Number(await page.getByRole("slider", { name: "播放进度" }).inputValue()))
    .toBeGreaterThan(0);
  await expect(page.getByRole("slider", { name: "播放进度" })).toHaveAttribute(
    "style",
    /--range-progress:/,
  );
});

test("shows volume continuously and keeps playback order separate from repeat mode", async ({
  page,
}) => {
  await page.goto("/");
  const volume = page.getByRole("slider", { name: "音量" });
  await expect(volume).toHaveAttribute("style", /--range-progress: 72%/);
  await expect(page.locator(".volume-value")).toHaveText("72%");
  await expect(page.locator(".volume-value")).toBeVisible();

  const order = page.getByRole("button", { name: "播放顺序：顺序播放" });
  const repeat = page.getByRole("button", { name: "循环方式：不循环" });
  await order.click();
  await expect(page.getByRole("button", { name: "播放顺序：随机播放" })).toBeVisible();
  await repeat.click();
  await expect(page.getByRole("button", { name: "循环方式：全部循环" })).toBeVisible();
  await page.getByRole("button", { name: "循环方式：全部循环" }).click();
  await expect(page.getByRole("button", { name: "循环方式：单曲循环" })).toBeVisible();
  await page.getByRole("button", { name: "循环方式：单曲循环" }).click();
  await expect(page.getByRole("button", { name: "循环方式：不循环" })).toBeVisible();
});

test("reorders playlist tracks from a visible drag handle and keeps the new order", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "安静的晚上" }).click();
  const rows = page.locator(".track-row:not(.track-head)");
  const titles = page.locator(".track-row:not(.track-head) .track-title strong");
  const before = await titles.allTextContents();
  expect(before.length).toBeGreaterThan(2);

  const handleBox = await rows
    .nth(2)
    .getByRole("button", { name: /拖动排序/ })
    .boundingBox();
  const targetBox = await rows.nth(0).boundingBox();
  expect(handleBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(targetBox!.x + 8, targetBox!.y + 4);
  await expect(page.locator('[class*="is-drag-target"]')).toHaveCount(0);
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + 8, targetBox!.y + 4, { steps: 6 });
  await expect(rows.nth(0)).toHaveClass(/is-drag-target-before/);
  await page.mouse.up();
  await expect(titles.first()).toHaveText(before[2]);
  await expect(page.locator('[class*="is-drag-target"]')).toHaveCount(0);
  await page.getByRole("button", { name: `下移 ${before[2]}` }).click();
  await expect(titles.nth(1)).toHaveText(before[2]);
  const movedRow = page.getByRole("row", { name: new RegExp(before[2]) });
  await expect(movedRow).toHaveClass(/is-order-selected/);
  await expect(movedRow).toHaveClass(/order-moved-down/);
  await page.waitForTimeout(500);
  await expect(movedRow).toHaveClass(/is-order-selected/);
  await expect(movedRow).not.toHaveClass(/order-moved-down/);
  await page.getByRole("button", { name: `上移 ${before[2]}` }).click();
  await expect(titles.first()).toHaveText(before[2]);
  await expect(movedRow).toHaveClass(/is-order-selected/);
  await expect(movedRow).toHaveClass(/order-moved-up/);
  await page.getByRole("button", { name: "歌曲", exact: true }).click();
  await page.getByRole("button", { name: "安静的晚上" }).click();
  await expect(titles.first()).toHaveText(before[2]);
});

test("updates playlist selection immediately and separates title clicks from row double clicks", async ({
  page,
}) => {
  await page.goto("/");
  const firstPlaylist = page.getByRole("button", { name: "安静的晚上" });
  await page.getByRole("button", { name: "新建歌单" }).click();
  const createDialog = page.getByRole("dialog", { name: "新建歌单" });
  await createDialog.getByRole("textbox").fill("测试切换");
  await createDialog.getByRole("button", { name: "创建" }).click();
  const secondPlaylist = page.getByRole("button", { name: "测试切换" });
  await firstPlaylist.click();
  await expect(firstPlaylist).toHaveAttribute("aria-current", "page");
  await secondPlaylist.click();
  await expect(secondPlaylist).toHaveAttribute("aria-current", "page");
  await expect(firstPlaylist).not.toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "歌曲", exact: true }).click();
  const row = page.getByRole("row", { name: /海平面以下/ });
  await row.locator(".album-cell").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row.locator(".album-cell").dblclick();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row.locator(".track-title-button").click();
  await expect(page.getByRole("dialog", { name: "海平面以下" })).toBeVisible();
});
