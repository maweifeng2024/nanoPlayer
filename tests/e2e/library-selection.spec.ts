import { expect, test } from "@playwright/test";
for (const android of [false, true]) {
  test.describe(android ? "Android library selection" : "Desktop library selection", () => {
    test.use(
      android
        ? {
            viewport: { width: 390, height: 844 },
            userAgent:
              "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
            hasTouch: true,
          }
        : {},
    );
    test("filters every collection, keeps mixed playlist rows and skips excluded tracks", async ({
      page,
    }) => {
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const { demoRoot, demoTracks } = await import("/src/domain.ts");
        useNanoStore.setState({
          selectedRootIds: null,
          roots: [1, 2].map((id) => ({
            ...demoRoot,
            id,
            name: `Root ${id}`,
            path: `/fixtures/root-${id}`,
            addedAt: "2026-09-27T00:00:00Z",
          })),
          tracks: [1, 2].map((id) => ({
            ...demoTracks[0],
            id,
            rootId: id,
            title: `Song ${id}`,
            album: `Album ${id}`,
            artist: `Artist ${id}`,
            path: `content://documents/${id}`,
          })),
          playlists: [
            { id: "mixed", name: "Mixed", trackIds: [2, 1] },
            { id: "excluded", name: "Excluded", trackIds: [2] },
          ],
          page: "library",
          queue: [2, 1],
          currentTrackId: undefined,
        });
      });
      await expect(page.getByLabel("勾选资源库 Root 1")).toBeChecked();
      await expect(page.getByText("/fixtures/root-1", { exact: true })).toHaveCount(0);
      await page.getByLabel("更多信息 Root 1").click();
      await expect(page.getByText("/fixtures/root-1", { exact: true })).toBeVisible();
      await page.getByLabel("勾选资源库 Root 2").uncheck();
      for (const destination of ["songs", "albums", "artists"] as const) {
        await page.evaluate(async (destination) => {
          const { useNanoStore } = await import("/src/store.ts");
          useNanoStore.getState().setPage(destination);
        }, destination);
        await expect(page.locator(".content")).toContainText(
          destination === "songs" ? "Song 1" : destination === "albums" ? "Album 1" : "Artist 1",
        );
        await expect(page.locator(".content")).not.toContainText(
          destination === "songs" ? "Song 2" : destination === "albums" ? "Album 2" : "Artist 2",
        );
      }
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.getState().setPage("playlists");
      });
      await expect(page.locator(".phone-playlists")).toContainText("Mixed");
      await expect(page.locator(".phone-playlists")).not.toContainText("Excluded");
      await page.locator(".playlist-open").click();
      await expect(page.locator('[data-track-id="2"]')).toHaveClass(/is-excluded/);
      await expect(page.locator('[data-track-id="1"]')).not.toHaveClass(/is-excluded/);
      await page.locator(".playlist-hero .primary-button").click();
      expect(
        await page.evaluate(async () => {
          const { useNanoStore } = await import("/src/store.ts");
          return useNanoStore.getState().queue;
        }),
      ).toEqual([1]);
      await page.reload();
      expect(
        await page.evaluate(async () => {
          const { useNanoStore } = await import("/src/store.ts");
          return useNanoStore.getState().selectedRootIds;
        }),
      ).toEqual([1]);
    });
  });
}
