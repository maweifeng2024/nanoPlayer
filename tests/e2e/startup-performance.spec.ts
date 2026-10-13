import { expect, test } from "@playwright/test";

test.describe("Android startup and navigation", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36" });
  for (const empty of [false, true]) {
    test(`onboarding waits for native snapshot (empty=${empty})`, async ({ page }) => {
      await page.addInitScript((empty) => {
        const state = { released: false, flashes: 0, saves: [] as any[] };
        Object.assign(window, {
          __startupTest: state,
          __TAURI_INTERNALS__: {
            transformCallback: () => 1,
            unregisterCallback: () => undefined,
            invoke: async (command: string, args: any) => {
              if (command === "library_snapshot") {
                while (!state.released) await new Promise((resolve) => setTimeout(resolve, 10));
                return { roots: empty ? [] : [{ id: 1, path: "content://fixture/tree/music", name: "Fixture", availability: "available", trackCount: 0, sizeBytes: 0 }], tracks: [], issues: [], userState: { ratings: { 1: 4 }, playlists: [] } };
              }
              if (command === "save_user_state") state.saves.push(args.value);
              if (command === "android_playback") return { queue: [], positionMs: 0, playWhenReady: false, shuffle: false, repeatMode: 0, playCounts: {} };
              if (command === "rescan_library_root") return new Promise(() => {});
              return null;
            },
          },
        });
        new MutationObserver(() => {
          if (!state.released && document.querySelector(".onboarding")) state.flashes++;
        }).observe(document, { childList: true, subtree: true });
      }, empty);
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.setState({ roots: [], onboardingDismissed: false });
      });
      await expect(page.locator(".brand")).toBeVisible();
      await expect(page.locator(".onboarding")).toHaveCount(0);
      await page.evaluate(() => { (window as any).__startupTest.released = true; });
      if (empty) await expect(page.locator(".onboarding")).toBeVisible();
      else {
        await expect(page.locator(".empty-state").first()).toBeVisible();
        await expect(page.locator(".onboarding")).toHaveCount(0);
        await page.evaluate(async () => {
          const { useNanoStore } = await import("/src/store.ts");
          useNanoStore.getState().rate(1, 5);
        });
        await expect.poll(() => page.evaluate(() => (window as any).__startupTest.saves.some((s: any) => s.ratings?.[1] === 5))).toBe(true);
      }
      expect(await page.evaluate(() => (window as any).__startupTest.flashes)).toBe(0);
    });
  }

  test("10k queue navigation does not write unchanged persisted data", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/");
    await page.evaluate(async () => {
      const { useNanoStore } = await import("/src/store.ts");
      useNanoStore.setState({ queue: Array.from({ length: 10000 }, (_, i) => i), playing: false });
      (window as any).__writes = 0;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...args) { (window as any).__writes++; return setItem.apply(this, args); };
    });
    for (let i = 0; i < 5; i++) {
      for (const name of ["资料库", "歌单", "首页"]) {
        await page.locator(".phone-navigation").getByRole("button", { name, exact: true }).click();
      }
    }
    expect(await page.evaluate(() => (window as any).__writes)).toBe(0);
    await page.screenshot({ path: "test-results/navigation-390.png" });
  });
});
