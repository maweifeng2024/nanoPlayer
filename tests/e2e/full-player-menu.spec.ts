import { expect, test } from "@playwright/test";

for (const [width, mobile] of [[1440, false], [390, true], [840, true]] as const) {
  test.describe(`full player ${width}`, () => {
    test.use({
      viewport: { width, height: 800 },
      hasTouch: mobile,
      ...(mobile && { userAgent: "Mozilla/5.0 (Linux; Android 16) Chrome/140 Safari/537.36" }),
    });

    test("expands playback, toggles row actions, and saves a queued song", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const state = useNanoStore.getState();
        state.createPlaylist("队列测试");
        for (let i = 1; i <= 14; i++) state.createPlaylist(`长菜单 ${i}`);
        state.setPage("songs");
        state.playTrack(state.tracks[0].id, state.tracks.map((track) => track.id));
      });
      const search = page.getByRole("textbox", { name: "全局搜索" });
      await expect(search).toBeVisible();

      const trackMore = page.locator(".more-menu").last();
      await trackMore.click();
      await expect(trackMore).toHaveAttribute("aria-expanded", "true");
      await trackMore.click();
      await expect(trackMore).toHaveAttribute("aria-expanded", "false");

      if (mobile) {
        await page.evaluate(async () => {
          const { useNanoStore } = await import("/src/store.ts");
          useNanoStore.getState().toggleDrawer("queue");
        });
      } else {
        await page.getByRole("button", { name: "播放队列", exact: true }).click();
      }
      const queue = page.getByRole("complementary", { name: "播放队列" });
      await expect(queue).toBeVisible();
      if (width === 390) {
        await expect(search).toBeHidden();
        expect((await queue.boundingBox())!.width).toBeCloseTo(width, 0);
      } else {
        await expect(search).toBeVisible();
        await expect(page.getByRole("complementary", { name: "主导航" })).toBeInViewport();
        for (const windowWidth of mobile ? [840, 600] : [1440, 720]) {
          await page.setViewportSize({ width: windowWidth, height: 800 });
          const bounds = (await queue.boundingBox())!;
          expect(bounds.width).toBeCloseTo(windowWidth <= 760 ? 360 : 320, 0);
          expect(bounds.x + bounds.width).toBeCloseTo(windowWidth, 0);
          await expect(page.locator(".content")).toBeVisible();
        }
        await page.setViewportSize({ width, height: 800 });
      }
      const rows = queue.locator(".queue-item");
      for (const row of [rows.first(), queue.locator(".queue-item.active"), rows.last()]) {
        const title = row.locator(".queue-play strong");
        const detail = row.locator(".queue-play small");
        const actions = row.locator(".queue-more");
        await expect(title).toBeVisible();
        await expect(detail).toBeVisible();
        const bounds = (await row.boundingBox())!;
        const titleBox = (await title.boundingBox())!;
        const detailBox = (await detail.boundingBox())!;
        const button = (await actions.boundingBox())!;
        const rightPadding = await row.evaluate((node) => parseFloat(getComputedStyle(node).paddingRight));
        expect(titleBox.width).toBeGreaterThan(70);
        expect(detailBox.width).toBeGreaterThan(70);
        expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(button.x);
        expect(button.x + button.width).toBeCloseTo(bounds.x + bounds.width - rightPadding, 0);
      }
      await queue.screenshot({ path: test.info().outputPath("queue.png") });
      const more = queue.locator(".queue-more").last();
      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await more.click();
      await page.getByRole("menuitem", { name: "添加到“队列测试”" }).click();
      expect(await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const state = useNanoStore.getState();
        return state.playlists.find((list) => list.name === "队列测试")?.trackIds;
      })).toEqual(await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        return useNanoStore.getState().queue.slice(-1);
      }));
      await more.click();
      await page.keyboard.press("Escape");
      await expect(more).toHaveAttribute("aria-expanded", "false");
      if (width === 390) {
        const navigation = page.locator(".phone-navigation");
        await expect(navigation.getByRole("button")).toHaveCount(3);
        await navigation.getByRole("button", { name: "歌单" }).click();
        await expect(queue).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "歌单", exact: true })).toBeVisible();
      } else {
        await queue.getByRole("button", { name: "关闭" }).click();
      }
      await expect(search).toBeVisible();

      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.getState().setPage("now-playing");
      });
      await expect(search).toHaveCount(0);
      if (!mobile) {
        const sidebar = page.getByRole("complementary", { name: "主导航" });
        for (const windowWidth of [1440, 720]) {
          await page.setViewportSize({ width: windowWidth, height: 800 });
          await expect(sidebar).toBeVisible();
          const navigation = (await sidebar.boundingBox())!;
          const playing = (await page.locator(".now-playing-page").boundingBox())!;
          expect(playing.x).toBeGreaterThanOrEqual(navigation.x + navigation.width);
        }
        await page.setViewportSize({ width: 1440, height: 800 });
        await page.screenshot({ path: test.info().outputPath("desktop-now-playing.png") });
      }
      await expect(page.getByRole("button", { name: "收起正在播放" })).toHaveCSS("border-top-width", "0px");
      if (width === 390) {
        const navigation = page.locator(".phone-navigation");
        await expect(navigation.getByRole("button")).toHaveCount(3);
        await expect(navigation.getByRole("button", { name: "资料库" })).toBeInViewport();
        await page.getByRole("button", { name: "隐藏封面" }).click();
        await expect(page.locator(".now-playing-art")).toBeHidden();
        await page.getByRole("button", { name: "显示封面" }).click();
        await expect(page.locator(".now-playing-art")).toBeVisible();
      }
      await page.getByRole("button", { name: "收起正在播放" }).click();
      await expect(search).toBeVisible();
    });
  });
}

for (const [tablet, userAgent] of [
  ["Android", "Mozilla/5.0 (Linux; Android 16) Chrome/140 Safari/537.36"],
  ["iPad", "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15"],
] as const) {
  test.describe(`${tablet} queue resizing`, () => {
    test.use({ viewport: { width: 840, height: 800 }, hasTouch: true, userAgent });

    test("keeps the current page and adapts an open queue to the device layout", async ({ page }) => {
      await page.goto("/");
      const search = page.getByRole("textbox", { name: "全局搜索" });
      const queue = page.getByRole("complementary", { name: "播放队列" });
      await page.getByRole("button", { name: "播放队列", exact: true }).filter({ visible: true }).click();
      await expect(queue).toBeVisible();
      await expect(search).toBeVisible();

      await page.setViewportSize({ width: 599, height: 800 });
      if (tablet === "Android") {
        await expect(search).toBeHidden();
        await expect(page.locator(".phone-navigation")).toBeVisible();
        expect((await queue.boundingBox())!.width).toBeCloseTo(599, 0);
      } else {
        await expect(search).toBeVisible();
        expect((await queue.boundingBox())!.width).toBeLessThan(599);
      }

      await page.setViewportSize({ width: 600, height: 800 });
      await expect(search).toBeVisible();
      const bounds = (await queue.boundingBox())!;
      expect(bounds.width).toBeLessThan(600);
      expect(bounds.x + bounds.width).toBeCloseTo(600, 0);
      await queue.getByRole("button", { name: "关闭" }).click();
      await expect(queue).toHaveCount(0);
      await expect(search).toBeVisible();
    });
  });
}
