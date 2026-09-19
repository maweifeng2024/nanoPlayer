import { expect, test } from "@playwright/test";

for (const width of [390, 600]) {
  test.describe(`mobile feedback ${width}`, () => {
    test.use({
      viewport: { width, height: 900 },
      userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      hasTouch: true,
    });
    test("shuffle, repeat, queue and lyrics have immediate persistent state", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const state = useNanoStore.getState();
        state.playTrack(
          state.tracks[0].id,
          state.tracks.map((track) => track.id),
        );
        state.setPage("now-playing");
      });
      const shuffle = page.getByRole("button", { name: /^播放顺序/ });
      await shuffle.click();
      await expect(shuffle).toHaveAttribute("aria-pressed", "true");
      await expect(shuffle).toHaveCSS("color", "rgb(230, 83, 83)");
      const order = await page.evaluate(
        async () => (await import("/src/store.ts")).useNanoStore.getState().shuffleOrder,
      );
      await page.getByRole("button", { name: "下一首", exact: true }).click();
      expect(
        await page.evaluate(
          async () => (await import("/src/store.ts")).useNanoStore.getState().currentTrackId,
        ),
      ).toBe(order[1]);
      const repeat = page.getByRole("button", { name: /^循环方式/ });
      await repeat.click();
      await expect(repeat).toHaveAttribute("aria-pressed", "true");
      await repeat.click();
      await expect(repeat).toHaveAccessibleName("循环方式：单曲循环");
      await repeat.click();
      await expect(repeat).toHaveAttribute("aria-pressed", "false");
      const queue = page.locator('.player-bar button[aria-label="播放队列"]:visible');
      await queue.click();
      await expect(queue).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".queue-playback-status")).toContainText("随机播放");
      await page
        .locator(".player-drawer")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
      await expect(queue).toHaveAttribute("aria-pressed", "false");
      const lyrics = page.locator('.player-bar button[aria-label="歌词"]:visible');
      await lyrics.click();
      await expect(lyrics).toHaveAttribute("aria-pressed", "true");
      await expect(lyrics).toHaveCSS("color", "rgb(230, 83, 83)");
    });
  });
}

test("desktop home lists grow with their songs and only the page scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const base = useNanoStore.getState().tracks[0];
    const tracks = Array.from({ length: 40 }, (_, index) => ({
      ...base,
      id: index + 1,
      title: `Song ${index}`,
    }));
    useNanoStore.setState({
      tracks,
      ratings: Object.fromEntries(tracks.map((t) => [t.id, 5])),
      playCounts: Object.fromEntries(tracks.map((t) => [t.id, 2])),
    });
  });
  for (const list of await page.locator(".home-track-list-body").all()) {
    expect(await list.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    await expect(list).toHaveCSS("overflow-y", "visible");
  }
  expect(
    await page.locator(".page-scroll").evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  await page.locator(".home-track-list-recent li").last().scrollIntoViewIfNeeded();
  const last = await page.locator(".home-track-list-recent li").last().boundingBox();
  const player = await page.locator(".player-bar").boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(player!.y);
});

for (const android of [false, true]) {
  test.describe(android ? "mobile cover background" : "desktop cover background", () => {
    test.use(
      android
        ? {
            viewport: { width: 390, height: 844 },
            userAgent:
              "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          }
        : {},
    );
    test("real cover changes color, placeholder preserves it, edges share the frame color", async ({
      page,
    }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "rgb(190, 65, 45)";
        ctx.fillRect(0, 0, 32, 32);
        const source = canvas.toDataURL();
        Object.assign(window, {
          __TAURI_INTERNALS__: {
            invoke: async (command: string) => (command === "artwork_data_url" ? source : null),
          },
        });
        const base = useNanoStore.getState().tracks[0];
        useNanoStore.setState({
          tracks: [
            { ...base, id: 701, hasArtwork: true, artworkHash: "real-cover-test" },
            { ...base, id: 702, hasArtwork: false, color: "#00ff00" },
          ],
          currentTrackId: 701,
          playing: false,
        });
      });
      await expect(page.locator(".ambient-background")).toHaveCSS(
        "--ambient-primary",
        "rgb(190, 65, 45)",
      );
      await page.evaluate(async () => {
        (await import("/src/store.ts")).useNanoStore.setState({ currentTrackId: 702 });
      });
      await expect(page.locator(".ambient-background")).toHaveCSS(
        "--ambient-primary",
        "rgb(190, 65, 45)",
      );
      expect(
        await page
          .locator(".ambient-background")
          .evaluate((node) => getComputedStyle(node).maskImage),
      ).toContain("linear-gradient");
      const colors = await page.evaluate(() =>
        [".app-shell", ".topbar", ".player-bar"].map(
          (selector) => getComputedStyle(document.querySelector(selector)!).backgroundColor,
        ),
      );
      expect(new Set(colors).size).toBe(1);
      await page.evaluate(async () => {
        (await import("/src/store.ts")).useNanoStore.setState({ theme: "light" });
      });
      await expect(page.locator(".app-shell")).toHaveCSS("background-color", "rgb(248, 247, 245)");
      await expect(page.locator(".ambient-background")).toHaveCSS(
        "--ambient-primary",
        "rgb(190, 65, 45)",
      );
    });
  });
}
