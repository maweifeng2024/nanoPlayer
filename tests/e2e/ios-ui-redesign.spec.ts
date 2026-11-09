import { expect, test } from "@playwright/test";

const agents = {
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
  pad: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36",
  desktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36",
};
for (const [client, widths] of Object.entries({
  ios: [360, 390, 844],
  pad: [600, 840, 1024],
  android: [390, 600, 1024],
  desktop: [720, 1440],
})) {
  test.describe(client, () => {
    test.use({ userAgent: agents[client as keyof typeof agents], hasTouch: client !== "desktop" });
    test("home cover cap, frameless lists and responsive menus", async ({ page }) => {
      if (client === "desktop") await page.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 }));
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const s = useNanoStore.getState();
        const base = s.tracks[0];
        const tracks = Array.from({ length: 35 }, (_, i) => ({
          ...base,
          id: i + 1,
          title: `测试歌曲 ${i + 1}`,
          album: `专辑 ${i % 4}`,
          hasArtwork: false,
        }));
        useNanoStore.setState({
          tracks,
          roots: [],
          selectedRootIds: null,
          libraryScopes: [],
          playlists: Array.from({ length: 20 }, (_, i) => ({
            id: `p${i}`,
            name: `测试歌单 ${i}`,
            trackIds: [],
          })),
          ratings: { 1: 5, 2: 4 },
          playCounts: { 1: 4, 2: 3 },
          currentTrackId: 1,
          page: "home",
          query: "",
        });
      });
      for (const width of widths) {
        await page.setViewportSize({
          width,
          height: width === 844 && client === "ios" ? 390 : 900,
        });
        for (const theme of ["dark", "light"] as const) {
          await page.evaluate(async (theme) => {
            const { useNanoStore } = await import("/src/store.ts");
            useNanoStore.getState().setTheme(theme);
          }, theme);
          const maxCover = await page.locator(".home-page").evaluate((el) => Math.max(120, parseFloat(getComputedStyle(el).getPropertyValue("--home-hero-size")) * 2 / 3));
          const covers = await page.locator(".home-album-art").all();
          for (const cover of covers)
            expect((await cover.boundingBox())!.width).toBeLessThanOrEqual(
              maxCover + 1,
            );
          await expect(page.locator(".home-track-list").first()).toHaveCSS(
            "border-top-width",
            "0px",
          );
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
          await page.screenshot({ path: `test-results/redesign-${client}-${width}-${theme}.png` });
        }
      }
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.setState({ page: "songs", query: "" });
      });
      const row = page.locator('[data-track-id="35"]');
      await row.scrollIntoViewIfNeeded();
      const trigger = row.getByRole("button", { name: "测试歌曲 35 更多操作" });
      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      if (client === "ios" || client === "pad") {
        await page.setViewportSize({ width: client === "ios" ? 390 : 600, height: 844 });
        await expect
          .poll(async () => {
            const r = await menu.boundingBox();
            return (
              !!r &&
              r.x >= 0 &&
              r.y >= 0 &&
              r.x + r.width <= (client === "ios" ? 391 : 601) &&
              r.y + r.height <= 845
            );
          })
          .toBe(true);
      }
      expect(await menu.evaluate((el) => el.parentElement === document.body)).toBe(true);
      const box = await menu.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      await menu
        .getByRole("menuitem", { name: "添加到“测试歌单 19”", exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        menu.getByRole("menuitem", { name: "添加到“测试歌单 19”", exact: true }),
      ).toBeInViewport();
      await page.screenshot({ path: `test-results/redesign-${client}-bottom-menu.png` });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.locator(".app-shell")).not.toHaveAttribute("inert", "");
      await trigger.click();
      if (client === "ios") await menu.getByRole("menuitem", { name: "取消", exact: true }).click();
      else await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
    });
  });
}

test.describe("iOS home artwork", () => {
  test.use({ userAgent: agents.ios, hasTouch: true });
  test("tint follows the recommendation, resets missing art and ignores a late old request", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.goto("/");
    await page.evaluate(async () => {
      const { useNanoStore } = await import("/src/store.ts");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 10;
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#be412d";
      c.fillRect(0, 0, 10, 10);
      const source = canvas.toDataURL();
      Object.assign(window, {
        __TAURI_INTERNALS__: {
          invoke: async (command: string) => (command === "artwork_data_url" ? source : null),
        },
      });
      const base = useNanoStore.getState().tracks[0];
      useNanoStore.setState({
        tracks: [{ ...base, id: 701, hasArtwork: true, artworkHash: "home-real" }],
        page: "home",
        selectedRootIds: null,
        libraryScopes: [],
        lastPlayedAt: {},
        playCounts: {},
        ratings: {},
      });
    });
    const tint = page.locator(".home-artwork-tint");
    await expect(tint).toHaveCSS("--home-tint-primary", "rgb(138, 78, 68)");
    await page.evaluate(async () => {
      (await import("/src/store.ts")).useNanoStore.setState({ currentTrackId: 999 });
    });
    await expect(tint).toHaveCSS("--home-tint-primary", "rgb(138, 78, 68)");
    await page.evaluate(async () => {
      const { useNanoStore } = await import("/src/store.ts");
      const base = useNanoStore.getState().tracks[0];
      Object.assign(window, {
        __TAURI_INTERNALS__: {
          invoke: async () => {
            await new Promise((r) => setTimeout(r, 200));
            return null;
          },
        },
      });
      useNanoStore.setState({ tracks: [{ ...base, id: 702, artworkHash: "late" }] });
    });
    await page.evaluate(async () => {
      const { useNanoStore } = await import("/src/store.ts");
      useNanoStore.setState({
        tracks: [{ ...useNanoStore.getState().tracks[0], id: 703, hasArtwork: false }],
      });
    });
    await expect(tint).toHaveCSS("--home-tint-primary", "rgb(102, 118, 140)");
    await expect(page.locator(".app-shell > .ambient-background")).toBeHidden();
  });
});
