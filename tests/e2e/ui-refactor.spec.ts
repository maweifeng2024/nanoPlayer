import { expect, test } from "@playwright/test";

for (const width of [560, 640]) {
  test(`compact desktop keeps search, playback and queue reachable at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.locator(".search-box input")).toBeVisible();
    await expect(page.locator(".play-button")).toBeVisible();
    await expect(page.locator(".player-tools > button").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator(".menu-button").click();
    await page.getByLabel("主导航").getByRole("button", { name: "歌曲", exact: true }).click();
    const row = await page.locator(".track-row").first().boundingBox();
    expect(row!.x + row!.width).toBeLessThanOrEqual(width);
  });
}

test("row keyboard controls, menu cycling, selection and modal focus work together", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("主导航").getByRole("button", { name: "歌曲", exact: true }).click();
  const rows = page.locator(".track-row");
  await rows.first().focus();
  await page.keyboard.press("Enter");
  await expect(rows.first()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press("m");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem").last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(rows.nth(1)).toBeFocused();
  await rows.nth(1).locator(".track-title-button").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const controls = dialog.locator(
    "button:visible:not(:disabled), input:visible:not(:disabled), select:visible:not(:disabled)",
  );
  await controls.last().focus();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(rows.nth(1).locator(".track-title-button")).toBeFocused();
});

test("collection return restores scroll and measured virtual columns", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const base = useNanoStore.getState().tracks[0];
    useNanoStore.setState({
      tracks: Array.from({ length: 10000 }, (_, id) => ({ ...base, id, album: `Album ${id}` })),
      page: "albums",
    });
  });
  const scroller = page.locator(".page-scroll");
  await scroller.evaluate((node) => {
    node.scrollTop = 4000;
  });
  await expect
    .poll(() => page.locator(".collection-card").first().innerText())
    .not.toContain("Album 0\n");
  // Virtualization changes DOM indices when scrolling. Keep the same album
  // through scrollIntoView and click instead of resolving nth(8) a second time.
  const album = await page
    .locator(".collection-card")
    .filter({ hasText: /Album / })
    .nth(8)
    .locator("strong")
    .innerText();
  const card = page.locator(".collection-card").filter({
    has: page.getByText(album, { exact: true }),
  });
  await card.scrollIntoViewIfNeeded();
  await card.click({ trial: true });
  const before = await scroller.evaluate((node) => node.scrollTop);
  await card.click();
  await expect(page.locator(".collection-detail-hero h1")).toHaveText(album);
  await page.locator(".collection-back").click();
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeCloseTo(before, 0);
  expect(await page.locator(".collection-card").count()).toBeLessThan(100);
});

test.describe("touch layouts", () => {
  test.use({
    userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    hasTouch: true,
  });
  for (const width of [360, 600, 1024]) {
    test(`cover rows fit and final row clears player at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.getState().setPage("songs");
      });
      const table = page.locator(".track-table");
      expect(await table.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.locator(".page-scroll").evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      const last = await page.locator(".track-row").last().boundingBox();
      const player = await page.locator(".player-bar").boundingBox();
      expect(last!.y + last!.height).toBeLessThanOrEqual(player!.y);
      const more = page.locator(".track-row .more-menu").last();
      const box = await more.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(48);
      expect(box!.height).toBeGreaterThanOrEqual(48);
      await more.click();
      const bounds = await page.getByRole("menu").boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    });
  }
});

test("range selection and select-all work from rows and toolbar", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("主导航").getByRole("button", { name: "歌曲", exact: true }).click();
  await page.getByRole("button", { name: "批量选择", exact: true }).click();
  const selects = page.locator(".row-leading button");
  await selects.first().click();
  await selects.nth(2).click({ modifiers: ["Shift"] });
  await expect(page.locator(".table-toolbar")).toContainText("已选择 3 首");
  await page.getByRole("button", { name: "全选", exact: true }).focus();
  await page.keyboard.press("Control+a");
  await expect(page.locator(".table-toolbar")).toContainText(`已选择 ${await selects.count()} 首`);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "批量选择", exact: true })).toBeVisible();
  await page.locator(".row-play").first().click();
  await page.locator(".artwork-button").click();
  await page.locator(".collapse-player").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-page", "songs");
});
