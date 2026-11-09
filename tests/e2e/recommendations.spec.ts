import { expect, test } from "@playwright/test";

test("background inference sends rotating metadata and stages a validated result", async ({
  page,
}) => {
  const endpoint = process.env.VITE_RECOMMENDATIONS_URL;
  test.skip(!endpoint, "Run with a test endpoint/token; request is intercepted locally.");
  let returned = 0;
  let requests = 0;
  await page.route(endpoint!, async (route) => {
    requests++;
    const body = route.request().postDataJSON();
    expect(body.candidates.map((track: { id: number }) => track.id)).not.toContain(-2);
    expect(JSON.stringify(body)).not.toContain("path");
    expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(12000);
    returned = body.candidates[0].id;
    await route.fulfill({
      json: {
        ids: [returned, returned, 999999],
        title: "雨后散步",
        description: "让熟悉的声音带来新的发现。",
      },
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "nanoplayer.recommendations.v1",
      JSON.stringify({
        version: 1,
        active: [-1],
        generatedAt: 0,
        sentIds: [-2],
      }),
    );
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    useNanoStore.setState({
      lastPlayedAt: { [-1]: new Date().toISOString() },
      playCounts: { [-1]: 6 },
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("nanoplayer.recommendations.v1")!).pending,
      ),
    )
    .toEqual([returned || expect.any(Number)]);
  const cache = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nanoplayer.recommendations.v1")!),
  );
  expect(cache.pending).toEqual([returned]);
  expect(cache.active).toEqual([-1]);
  expect(cache.pendingTitle).toBe("雨后散步");
  expect(cache.pendingDescription).toBe("让熟悉的声音带来新的发现。");
  expect(cache.sentIds).toContain(-2);
  expect(cache.sentIds).toContain(returned);
  expect(requests).toBe(1);
});

for (const client of [
  {
    name: "desktop",
    width: 1280,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36",
  },
  {
    name: "phone",
    width: 390,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
  },
  {
    name: "pad",
    width: 840,
    ua: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  },
]) {
  test.describe(`recommendation save ${client.name}`, () => {
    test.use({
      userAgent: client.ua,
      hasTouch: client.name !== "desktop",
      viewport: { width: client.width, height: 900 },
    });
    test("pending discovery promotes only on launch, obeys selection, and plays its own queue", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        if (!localStorage.getItem("recommendations-test-seeded")) {
          localStorage.setItem("recommendations-test-seeded", "true");
          localStorage.setItem(
            "nanoplayer.recommendations.v1",
            JSON.stringify({
              version: 1,
              active: [-1],
              pending: [-3, -2],
              pendingTitle: "夜间漫游",
              pendingDescription: "在收藏里寻找久未听过的旋律。",
              generatedAt: Date.now(),
            }),
          );
        }
      });
      await page.goto("/");
      const readCache = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem("nanoplayer.recommendations.v1")!));
      await expect.poll(async () => (await readCache()).pending).toBeUndefined();
      const list = page.locator(".home-discovery");
      await expect(list.locator("ol, li")).toHaveCount(0);
      await expect(list.locator("h1")).toHaveText("夜间漫游");
      await expect(list.locator(".hero-copy")).toHaveText("在收藏里寻找久未听过的旋律。");
      const original = await list.locator("h1").textContent();
      await page.evaluate(() => {
        const cache = JSON.parse(localStorage.getItem("nanoplayer.recommendations.v1")!);
        localStorage.setItem(
          "nanoplayer.recommendations.v1",
          JSON.stringify({ ...cache, pending: [-4] }),
        );
      });
      await page.evaluate(async () =>
        (await import("/src/store.ts")).useNanoStore.getState().setPage("songs"),
      );
      await page.evaluate(async () =>
        (await import("/src/store.ts")).useNanoStore.getState().setPage("home"),
      );
      expect(await list.locator("h1").textContent()).toEqual(original);
      const expectedIds = await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        const state = useNanoStore.getState();
        const { eligibleTracks } = await import("/src/recommendations/recommendations.ts");
        const eligible = eligibleTracks(state.tracks, state);
        return [
          -3,
          -2,
          ...eligible.map((track) => track.id).filter((id) => ![-3, -2].includes(id)),
        ].slice(0, 12);
      });
      await list.getByRole("button", { name: "播放推荐歌单", exact: true }).click();
      expect(
        await page.evaluate(
          async () => (await import("/src/store.ts")).useNanoStore.getState().queue,
        ),
      ).toEqual(expectedIds);
      await page.evaluate(async () =>
        (await import("/src/store.ts")).useNanoStore.getState().setPage("now-playing"),
      );
      await page.getByRole("button", { name: "保存歌单", exact: true }).click();
      await expect(page.getByRole("button", { name: "已保存", exact: true })).toBeDisabled();
      const saved = await page.evaluate(async () =>
        (await import("/src/store.ts")).useNanoStore
          .getState()
          .playlists.filter((item) => item.name === "夜间漫游"),
      );
      expect(saved).toHaveLength(1);
      expect(saved[0].trackIds).toEqual(expectedIds);
      expect(saved[0].description).toBe("在收藏里寻找久未听过的旋律。");
      await page.screenshot({
        path: `test-results/recommendation-saved-playing-${client.name}.png`,
      });
      await page.reload();
      await expect.poll(async () => (await readCache()).active[0]).toBe(-4);
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.setState({ selectedRootIds: [], page: "home" });
      });
      await expect(list).toHaveCount(0);
    });
  });
}

test("recommendations setting defaults on and preserves an explicit opt-out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("switch", { name: "开启推荐", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "开启推荐", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});
