import { expect, test } from "@playwright/test";

test("folder multi-select survives empty results and combines with search", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const state = useNanoStore.getState();
    state.replaceLibrary(
      [
        {
          id: 1,
          path: "/Music/Jazz",
          name: "Jazz",
          availability: "available",
          songCount: 4,
          sizeBytes: 0,
        },
        {
          id: 2,
          path: "/Music/Rock",
          name: "Rock",
          availability: "available",
          songCount: 4,
          sizeBytes: 0,
        },
      ],
      state.tracks.map((track, index) => ({
        ...track,
        path: `/Music/${index < 4 ? "Jazz" : "Rock"}/${index}.flac`,
      })),
      [],
    );
  });
  await page.getByRole("button", { name: "歌曲", exact: true }).click();
  await page.getByLabel("按文件夹筛选", { exact: true }).click();
  await expect(page.getByLabel("所有文件夹", { exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "Rock /Music/Rock" }).uncheck();
  await expect(page.locator(".track-row:not(.track-head)")).toHaveCount(4);
  await page.getByRole("checkbox", { name: "Jazz /Music/Jazz" }).uncheck();
  await expect(page.getByText("这里还没有歌曲", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Rock /Music/Rock" }).check();
  await expect(page.locator(".track-row:not(.track-head)")).toHaveCount(4);
  await page.getByRole("checkbox", { name: "Jazz /Music/Jazz" }).check();
  await expect(page.locator(".track-row:not(.track-head)")).toHaveCount(8);
  await page.getByLabel("所有文件夹", { exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "全局搜索" }).fill("Northbound");
  await expect(page.locator(".track-row:not(.track-head)")).toHaveCount(2);
  await page.screenshot({ path: "test-results/folder-filter.png" });
});

test("home aligns artwork and list; most-played columns respond with other lists", async ({
  page,
}) => {
  await page.goto("/");
  const art = await page.locator(".hero-art").boundingBox();
  const lists = await page.locator(".home-track-columns").boundingBox();
  expect(art?.x).toBe(lists?.x);
  expect(
    await page.locator(".hero-art").evaluate((element) => getComputedStyle(element).boxShadow),
  ).toBe("none");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    useNanoStore.setState({ playCounts: { [-1]: 3 } });
  });
  for (const width of [1440, 1100, 900, 720]) {
    await page.setViewportSize({ width, height: 800 });
    if (width <= 760) await page.getByRole("button", { name: "打开导航", exact: true }).click();
    await page.getByLabel("主导航").getByRole("button", { name: "播放最多", exact: true }).click();
    await expect(page.locator(".duration-cell")).toHaveCount(0);
    const popularWidth = await page
      .locator(".track-table")
      .evaluate((element) => element.getBoundingClientRect().width);
    const popularDate = await page.locator(".added-cell").first().isVisible();
    await page.screenshot({ path: `test-results/most-played-${width}.png` });
    if (width <= 760) await page.getByRole("button", { name: "打开导航", exact: true }).click();
    await page.getByLabel("主导航").getByRole("button", { name: "最近添加", exact: true }).click();
    expect(
      await page
        .locator(".track-table")
        .evaluate((element) => element.getBoundingClientRect().width),
    ).toBe(popularWidth);
    expect(await page.locator(".added-cell").first().isVisible()).toBe(popularDate);
  }
});
