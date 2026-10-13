import { expect, test } from "@playwright/test";

for (const width of [1200, 600, 390]) {
  test.describe(`upgrade UI ${width}`, () => {
    test.use({
      viewport: { width, height: 900 },
      ...(width < 1200
        ? {
            userAgent:
              "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          }
        : {}),
    });
    test("active stripe stays clear of artwork in song and artist lists", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.getState().setPage("tracks");
        useNanoStore.getState().playTrack(-1);
      });
      for (const artist of [false, true]) {
        if (artist)
          await page.evaluate(async () =>
            (await import("/src/store.ts")).useNanoStore
              .getState()
              .openCollection("artist", "林岚"),
          );
        const row = page.locator(".track-row.is-playing").first();
        await expect(row).toBeVisible();
        const bounds = await row.boundingBox();
        const cover = await row.locator(".track-cover").boundingBox();
        expect(cover!.x - bounds!.x).toBeGreaterThanOrEqual(8);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `artifacts/ui/october-artist-${width}.png` });
    });
    test("word lyrics support size and per-song timing controls", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const store = useNanoStore.getState();
        useNanoStore.setState({
          tracks: store.tracks.map((track) =>
            track.id === -1
              ? { ...track, lyrics: "[00:01]<00:01>Hello <00:02>world\n[00:04]Next line" }
              : track,
          ),
          currentTrackId: -1,
          progressMs: 1500,
          drawer: "lyrics",
        });
      });
      await expect(page.locator(".lyric-word").first()).toHaveText("Hello ");
      await expect(page.locator(".lyric-word").first()).toHaveCSS("--word-fill", "50%");
      await page.getByLabel("歌词字号").fill("32");
      await expect(page.locator(".lyrics-panel > button").first()).toHaveCSS("font-size", "32px");
      await page.getByLabel("歌词提前 0.2 秒").click();
      await expect(page.locator(".lyrics-controls")).toContainText("0.2s");
      await page.screenshot({ path: `artifacts/ui/october-lyrics-${width}.png` });
    });
    if (width < 1200)
      test("sleep timer validates custom duration and closes with focus recovery", async ({
        page,
      }) => {
        await page.goto("/");
        await page.evaluate(async () => {
          const { useNanoStore } = await import("/src/store.ts");
          useNanoStore.setState({ currentTrackId: -1, page: "now-playing" });
        });
        const trigger = page.getByRole("button", { name: "定时停止播放", exact: true });
        await trigger.click();
        const panel = page.getByRole("dialog", { name: "定时停止播放" });
        await expect(panel.getByRole("button", { name: "15 分钟", exact: true })).toBeVisible();
        await expect(panel.getByRole("button", { name: "30 分钟", exact: true })).toBeVisible();
        await expect(panel.getByRole("button", { name: "60 分钟", exact: true })).toBeVisible();
        await panel.getByLabel("自定义分钟（1–1440）").fill("0");
        await expect(panel.getByRole("button", { name: "开始计时" })).toBeDisabled();
        await panel.getByLabel("自定义分钟（1–1440）").fill("7");
        await expect(panel.getByRole("button", { name: "开始计时" })).toBeEnabled();
        await panel.getByLabel("停止方式").selectOption("finish");
        await page.screenshot({ path: `artifacts/ui/october-timer-${width}.png` });
        await panel.getByRole("button", { name: "关闭", exact: true }).click();
        await expect(panel).toBeHidden();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
      });
  });
}
