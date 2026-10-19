import { expect, test } from "@playwright/test";

const clients = [
  {
    name: "desktop",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    widths: [720, 1200],
    limit: 20,
  },
  {
    name: "android",
    ua: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    widths: [360, 390, 600, 840, 1024],
    limit: 12,
  },
  {
    name: "iphone",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
    widths: [360, 390],
    limit: 12,
  },
  {
    name: "ipad",
    ua: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
    widths: [600, 840, 1024],
    limit: 12,
  },
];
for (const client of clients) {
  test.describe(client.name, () => {
    test.use({ userAgent: client.ua, hasTouch: client.name !== "desktop" });
    test("shared controls, home collection limits, alignment and horizontal access", async ({
      page,
    }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const base = useNanoStore.getState().tracks[0];
        const tracks = Array.from({ length: 25 }, (_, i) => ({
          ...base,
          id: i + 1,
          title: `Song ${i + 1}`,
          album: `Album ${i + 1}`,
          addedAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
          hasArtwork: false,
        }));
        useNanoStore.setState({
          tracks,
          roots: [],
          selectedRootIds: null,
          libraryScopes: [],
          page: "home",
          ratings: Object.fromEntries(tracks.map((t) => [t.id, 5])),
          playCounts: Object.fromEntries(tracks.map((t) => [t.id, 3])),
          currentTrackId: 1,
          playing: true,
        });
      });
      for (const width of client.widths) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["dark", "light"]) {
          await page.evaluate(
            async (theme) =>
              (await import("/src/store.ts")).useNanoStore.setState({
                theme: theme as "dark" | "light",
                page: "home",
              }),
            theme,
          );
          await expect(page.locator(".home-album-card")).toHaveCount(client.limit);
          for (const kind of ["popular", "rated"]) {
            const list = page.locator(`.home-track-list-${kind}`);
            await expect(list.locator("li")).toHaveCount(client.limit);
            await expect(list.locator(".home-track-status")).toHaveCount(0);
            await expect(list.locator("button[aria-pressed]")).toHaveCount(0);
            const title = await list.locator(".home-track-heading-copy strong").boundingBox();
            const cover = await list.locator(".recommendation-art").first().boundingBox();
            expect(Math.abs(title!.x - cover!.x)).toBeLessThanOrEqual(1);
          }
          const strip = page.locator(".home-album-grid");
          expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
          await page.locator(".home-album-card").last().scrollIntoViewIfNeeded();
          await expect(page.locator(".home-album-card").last()).toBeInViewport();
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
          await page.screenshot({
            path: `test-results/consistency-home-${client.name}-${width}-${theme}.png`,
          });
          await page.evaluate(async () =>
            (await import("/src/store.ts")).useNanoStore.setState({ page: "settings" }),
          );
          const target = client.name === "desktop" ? 36 : 44;
          for (const cls of [
            ".settings-list .secondary-button",
            ".settings-list .segmented button",
          ]) {
            const control = page.locator(cls).first();
            await expect(control).toHaveCSS(
              "font-size",
              client.name === "desktop" ? "14px" : "16px",
            );
            expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(target);
            await expect(control).toHaveCSS("border-radius", "8px");
          }
          if (client.name !== "desktop" && width >= 600 && width <= 900)
            await expect(page.locator(".sidebar")).toHaveCSS("width", "72px");
          await page.screenshot({
            path: `test-results/consistency-${client.name}-${width}-${theme}.png`,
          });
        }
      }
    });
    test("duplicate playlist targets are unique and same-name destinations stay independent", async ({
      page,
    }) => {
      await page.setViewportSize({
        width: client.name === "desktop" ? 1200 : client.name === "ipad" ? 840 : 390,
        height: 844,
      });
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.setState({
          page: "songs",
          playlists: [
            { id: "one", name: "Night", trackIds: [] },
            { id: "one", name: "Night", trackIds: [] },
            { id: "two", name: "Night", trackIds: [] },
            { id: "three", name: "Day", trackIds: [] },
          ],
        });
      });
      const trigger = page.locator(".more-menu").first();
      const id = Number(
        await trigger.locator("xpath=ancestor::*[@data-track-id]").getAttribute("data-track-id"),
      );
      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: /^添加到“/ })).toHaveCount(3);
      await menu.getByRole("menuitem", { name: "添加到“Night (2)”", exact: true }).click();
      const lists = await page.evaluate(
        async () => (await import("/src/store.ts")).useNanoStore.getState().playlists,
      );
      expect(lists.find((p) => p.id === "two")!.trackIds).toContain(id);
      expect(lists.find((p) => p.id === "one")!.trackIds).toEqual([]);
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(menu).toHaveCount(0);
    });
  });
}
