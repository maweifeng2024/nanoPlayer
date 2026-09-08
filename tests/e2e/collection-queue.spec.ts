import { expect, test } from "@playwright/test";

test("home collections match module default order, including ties", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const tracks = useNanoStore.getState().tracks.map((track, index) => ({
      ...track, addedAt: index < 4 ? "2026-09-01" : "2026-09-02",
    }));
    useNanoStore.setState({ tracks, ratings: { [-1]: 5, [-2]: 5, [-3]: 4 },
      playCounts: { [-1]: 2, [-2]: 10, [-3]: 3 },
      lastPlayedAt: { [-1]: "2026-09-08", [-2]: "2026-09-07", [-3]: "2026-09-08" } });
  });
  for (const [kind, name] of [["recent", "最近添加"], ["popular", "播放最多"], ["rated", "高评分"]]) {
    const home = page.locator(`.home-track-list-${kind}`);
    const titles = await home.locator("li button > span").allTextContents();
    const icon = await home.locator(".home-track-heading-icon svg").getAttribute("class");
    const nav = page.getByLabel("主导航").getByRole("button", { name, exact: true });
    expect(await nav.locator("svg").getAttribute("class")).toBe(icon);
    await home.locator(".home-track-list-heading").click();
    const ids = await page.locator("[data-track-id]").evaluateAll(nodes => nodes.map(n => Number(n.getAttribute("data-track-id"))));
    const actual = await page.evaluate(async ids => {
      const { useNanoStore } = await import("/src/store.ts");
      return ids.map(id => useNanoStore.getState().tracks.find(track => track.id === id)?.title);
    }, ids);
    expect(actual).toEqual(titles);
    await page.getByLabel("主导航").getByRole("button", { name: "首页", exact: true }).click();
  }
});

test("queue centers current track each time it opens and when playback changes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const base = useNanoStore.getState().tracks[0];
    const tracks = Array.from({ length: 100 }, (_, i) => ({ ...base, id: i + 1, title: `Queue ${i + 1}` }));
    useNanoStore.setState({ tracks, queue: tracks.map(t => t.id), currentTrackId: 80, playing: false });
  });
  const toggle = page.getByRole("button", { name: "播放队列", exact: true });
  const checkVisible = async () => {
    await expect.poll(() => page.locator(".queue-list").evaluate(list => {
      const active = list.querySelector(".active")!.getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      return active.top >= bounds.top && active.bottom <= bounds.bottom;
    })).toBe(true);
  };
  await toggle.click();
  await checkVisible();
  await page.locator(".queue-list").evaluate(list => { list.scrollTop = 0; });
  await toggle.click();
  await toggle.click();
  await checkVisible();
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    useNanoStore.setState({ currentTrackId: 95 });
  });
  await checkVisible();
  await page.screenshot({ path: "test-results/queue-current-track.png" });
  await toggle.click();
  for (const key of ["Meta+Shift+Q", "Meta+O", "Meta+N", "Meta+,"]) await page.keyboard.press(key);
  await expect(page.locator(".player-drawer")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".hero")).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("textbox", { name: "全局搜索" })).toBeFocused();
  await page.keyboard.press("Meta+l");
  await expect(page.getByRole("complementary", { name: "歌词" })).toBeVisible();
});
