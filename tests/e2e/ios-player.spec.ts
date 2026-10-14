import { expect, test } from "@playwright/test";

for (const device of ["phone", "pad"] as const) {
  test.describe(`iOS player ${device}`, () => {
    test.use({
      userAgent: device === "phone"
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        : "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      hasTouch: true,
    });
    test("expanded playback retains controls and one lyrics entry", async ({ page }) => {
      await page.setViewportSize({ width: device === "phone" ? 390 : 600, height: 900 });
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const state = useNanoStore.getState();
        state.playTrack(state.tracks[0].id, state.tracks.map((track) => track.id));
        state.setPage("now-playing");
      });
      for (const viewport of device === "phone"
        ? [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }]
        : [{ width: 600, height: 900 }, { width: 840, height: 900 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        const player = page.getByRole("contentinfo", { name: "播放器" });
        await expect(player.getByRole("slider", { name: "播放进度" })).toBeVisible();
        await expect(player.getByRole("button", { name: "上一首", exact: true })).toBeVisible();
        await expect(player.getByRole("button", { name: "下一首", exact: true })).toBeVisible();
        await expect(player.getByRole("button", { name: /^播放顺序/ })).toBeVisible();
        await expect(player.getByRole("button", { name: /^循环方式/ })).toBeVisible();
        for (const button of await player.locator("button:visible").all()) {
          const bounds = await button.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        }
        const lyrics = page.locator('button[aria-label="歌词"]:visible');
        await expect(lyrics).toHaveCount(1);
        await expect(page.getByRole("button", { name: "打开歌词抽屉" })).toBeHidden();
        await lyrics.click();
        await expect(page.locator(".player-drawer")).toBeVisible();
        await lyrics.click();
        await expect(page.locator(".player-drawer")).toBeHidden();
        const bounds = await player.boundingBox();
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
        const titleBounds = await page.locator(".now-playing-copy h1").boundingBox();
        expect(titleBounds!.x).toBeGreaterThanOrEqual(0);
        expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(viewport.width);
        await page.screenshot({ path: `test-results/ios-player-${device}-${viewport.width}.png` });
      }
      await page.evaluate(async () => {
        (await import("/src/store.ts")).useNanoStore.getState().setTheme("light");
      });
      await page.setViewportSize({ width: device === "phone" ? 390 : 600, height: 900 });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await expect(page.getByRole("slider", { name: "播放进度" })).toBeVisible();
      await page.screenshot({ path: `test-results/ios-player-${device}-light.png` });
      await page.getByRole("button", { name: "收起正在播放" }).click();
      await expect(page.locator('.app-shell')).not.toHaveAttribute("data-page", "now-playing");
      await expect(page.locator('.player-bar .play-button')).toBeVisible();
    });
  });
}
