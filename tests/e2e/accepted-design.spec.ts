import { expect, test } from "@playwright/test";

for (const width of [1200, 720, 360, 390, 600, 840, 1024]) {
  test.describe(`accepted design ${width}`, () => {
    test.use({
      viewport: { width, height: 900 },
      ...(width !== 1200 && width !== 720
        ? {
            userAgent:
              "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
            hasTouch: true,
          }
        : {}),
    });
    test("recent albums respect selection, open complete collections, and settings size persists", async ({
      page,
    }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const base = useNanoStore.getState().tracks[0];
        useNanoStore.setState({
          roots: [],
          libraryScopes: [],
          selectedRootIds: [1],
          tracks: [
            {
              ...base,
              id: -1,
              rootId: 1,
              album: "Visible album",
              title: "First",
              addedAt: "2026-01-01",
            },
            {
              ...base,
              id: -2,
              rootId: 1,
              album: "Visible album",
              title: "Second",
              addedAt: "2026-03-01",
            },
            { ...base, id: -3, rootId: 2, album: "Excluded album", addedAt: "2026-04-01" },
          ],
        });
      });
      await expect(page.locator(".home-album-card")).toHaveCount(1);
      await expect(page.locator(".home-album-card")).toContainText("2 首");
      await expect(page.getByRole("button", { name: "打开专辑 Excluded album" })).toHaveCount(0);
      await page.getByRole("button", { name: "打开专辑 Visible album" }).click();
      await expect(page.locator(".collection-detail-hero h1")).toHaveText("Visible album");
      await expect(page.locator(".track-row:not(.track-head)")).toHaveCount(2);
      // Use the existing page route; retain native and keyboard navigation coverage elsewhere.
      await page.evaluate(async () => {
        (await import("/src/store.ts")).useNanoStore.getState().setPage("settings");
      });
      for (const name of ["外观与操作", "播放", "歌词", "资料与存储", "应用更新"])
        await expect(
          page.locator(".settings-group").getByRole("heading", { name, exact: true }),
        ).toHaveCount(1);
      await page.getByLabel("歌词字号", { exact: true }).fill("32");
      await expect(page.locator(".lyric-size-value")).toHaveText("32 px");
      for (const theme of ["浅色", "深色"]) {
        await page.getByRole("button", { name: theme, exact: true }).click();
        await expect(page.getByRole("button", { name: theme, exact: true })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
      await page.reload();
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const store = useNanoStore.getState();
        useNanoStore.setState({
          currentTrackId: store.tracks[0].id,
          playing: false,
          tracks: store.tracks.map((t) => ({
            ...t,
            lyrics: "[00:01]First line\n[00:02]Second line",
          })),
          progressMs: 1500,
        });
        store.setPage("now-playing");
      });
      await expect(page.locator(".immersive-lyrics > button").first()).toHaveCSS(
        "font-size",
        "32px",
      );
      await expect(page.locator(".now-playing-reading")).toBeVisible();
      if (width === 360 || width === 390) {
        const line = await page.locator(".immersive-lyrics > button").first().boundingBox();
        const player = await page.locator(".player-bar").boundingBox();
        expect(line!.y + line!.height).toBeLessThanOrEqual(player!.y);
        const timer = page.getByRole("button", { name: "定时停止播放", exact: true });
        await timer.scrollIntoViewIfNeeded();
        const timerBounds = await timer.boundingBox();
        expect(timerBounds!.width).toBeGreaterThan(100);
        expect(timerBounds!.height).toBeGreaterThanOrEqual(44);
        await timer.click();
        await expect(page.getByRole("dialog", { name: "定时停止播放" })).toBeVisible();
        await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
        await expect(timer).toBeFocused();
      }
      await expect(page.getByLabel("播放进度", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `artifacts/ui/accepted-design-playing-${width}.png` });
    });
  });
}
