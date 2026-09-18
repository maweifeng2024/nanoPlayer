import { expect, test } from "@playwright/test";

test("update notice dismisses for this launch and returns on next launch", async ({ page }) => {
  await page.goto("/");
  await page.clock.install();
  const available = () =>
    page.evaluate(async () => {
      const { useUpdateStore } = await import("/src/updates/updater.ts");
      useUpdateStore.setState({ phase: "available", update: { version: "9.0.0" } });
    });
  await available();
  await expect(page.locator(".update-notice")).toBeVisible();
  await page.clock.fastForward(10_100);
  await expect(page.locator(".update-notice")).toHaveCount(0);
  await page.evaluate(async () => {
    const { useUpdateStore } = await import("/src/updates/updater.ts");
    useUpdateStore.setState({ phase: "checking" });
  });
  await available();
  await expect(page.locator(".update-notice")).toHaveCount(0);
  await page.reload();
  await available();
  await expect(page.locator(".update-notice")).toBeVisible();
  await page.locator(".update-notice").getByRole("button", { name: "关闭提示" }).click();
  await expect(page.locator(".update-notice")).toHaveCount(0);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("button", { name: "下载并安装" })).toBeVisible();
});

for (const width of [390, 600, 1024]) {
  test.describe(`review at ${width}px`, () => {
    test.use({
      userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      hasTouch: true,
    });
    test("home, single-line cover rows, menus and player return", async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const hero = await page.locator(".hero-art").boundingBox();
      const title = await page.locator(".hero h1").boundingBox();
      expect(hero!.x + hero!.width).toBeLessThan(title!.x);
      await expect(page.locator(".hero .hero-copy")).toBeHidden();
      const cards = await page
        .locator(".home-track-list li button")
        .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().width));
      if (width < 600) expect(Math.max(...cards) - Math.min(...cards)).toBeLessThan(1);
      await page.screenshot({ path: `test-results/review-home-${width}.png` });
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.getState().setPage("songs");
      });
      const row = page.locator("[data-track-id]").first();
      const cover = await row.locator(".track-cover").boundingBox();
      const more = await row.locator(".more-menu").boundingBox();
      expect(Math.abs(cover!.y + cover!.height / 2 - more!.y - more!.height / 2)).toBeLessThan(1);
      expect(more!.x + more!.width).toBeLessThanOrEqual(width);
      await row.locator(".more-menu").click();
      const stars = page.locator(".context-menu .phone-rating button");
      await expect(stars).toHaveCount(5);
      const fifth = await stars.nth(4).boundingBox();
      expect(fifth!.x + fifth!.width).toBeLessThanOrEqual(width - 8);
      await stars.nth(4).click();
      await row.locator(".row-play").click();
      if (width < 600) {
        const bar = await page.locator(".player-bar").boundingBox();
        const play = await page.locator(".play-button").boundingBox();
        expect(Math.abs(play!.y + play!.height / 2 - bar!.y - bar!.height / 2)).toBeLessThan(1);
        await expect(
          page.locator(".phone-library-tabs").getByRole("button", { name: "高评分" }),
        ).toBeAttached();
      }
      await page.locator(".artwork-button").click();
      await page.getByRole("button", { name: "收起正在播放" }).click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-page", "songs");
      await page.screenshot({ path: `test-results/review-songs-${width}.png` });
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.getState().toggleDrawer("queue");
      });
      await page
        .locator(".queue-item")
        .first()
        .getByRole("button", { name: /更多操作/ })
        .click();
      await expect(page.locator(".queue-menu button")).toHaveText(["上移", "下移", "移除"]);
      await page.locator(".queue-menu").getByRole("button", { name: "下移" }).click();
      await page
        .locator(".queue-item")
        .first()
        .getByRole("button", { name: /更多操作/ })
        .click();
      const before = await page.locator(".queue-item").count();
      await page.locator(".queue-menu").getByRole("button", { name: "移除", exact: true }).click();
      await expect(page.locator(".queue-item")).toHaveCount(before - 1);
    });
  });
}

test.describe("phone library and playlists", () => {
  test.use({
    userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    hasTouch: true,
  });
  test("large library is virtualized and folders stay inside viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.evaluate(async () => {
      const { useNanoStore } = await import("/src/store.ts");
      const base = useNanoStore.getState().tracks[0];
      useNanoStore.setState({
        tracks: Array.from({ length: 1329 }, (_, i) => ({
          ...base,
          id: i + 1,
          title: `Track ${i + 1}`,
        })),
        page: "songs",
      });
    });
    await expect(page.locator("[data-track-id]").first()).toBeVisible();
    expect(await page.locator("[data-track-id]").count()).toBeLessThan(50);
    await page.locator(".page-scroll").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.locator('[data-track-id="1329"]')).toBeVisible();
    await page.evaluate(async () => {
      const { useNanoStore } = await import("/src/store.ts");
      const root = useNanoStore.getState().roots[0];
      useNanoStore.setState({
        roots: [{ ...root, path: "content://folder/" + "long-directory/".repeat(30) }],
        page: "library",
      });
    });
    expect(
      await page.locator(".page-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: "test-results/review-folders-phone.png" });
  });
  test("playlist list supports play, rename, cancellation and deletion", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".phone-navigation").getByRole("button", { name: "歌单" }).click();
    const row = page.locator(".playlist-list-row").first();
    await row.getByRole("button", { name: /^播放 / }).click();
    await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
    await row.getByRole("button", { name: /^重命名 / }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("新的歌单");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(row.locator("strong")).toHaveText("新的歌单");
    await row.getByRole("button", { name: /^删除 / }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "取消" }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /^删除 / }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "删除歌单", exact: true })
      .click();
    await expect(page.locator(".playlist-list-row")).toHaveCount(0);
  });
});
