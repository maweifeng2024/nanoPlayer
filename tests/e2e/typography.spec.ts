import { expect, test } from "@playwright/test";

test("module headings and settings use a consistent type scale in both themes", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "首页",
    "本地资料库",
    "歌曲",
    "专辑",
    "艺术家",
    "最近添加",
    "播放最多",
    "高评分",
    "设置",
  ]) {
    await page.getByLabel("主导航").getByRole("button", { name, exact: true }).click();
    await expect(page.locator("main h1").first()).toHaveCSS("font-size", "32px");
  }
  const titleSizes = await page
    .locator(".settings-list strong, .settings-list h3")
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).fontSize));
  expect(new Set(titleSizes)).toEqual(new Set(["13px"]));
  const bodySizes = await page
    .locator(".settings-list p, .settings-list select, .settings-list .secondary-button")
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).fontSize));
  expect(new Set(bodySizes)).toEqual(new Set(["12px"]));
  await page.screenshot({ path: "test-results/settings-typography-dark.png", fullPage: true });
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await page.screenshot({ path: "test-results/settings-typography-light.png", fullPage: true });
  await page.getByLabel("主导航").getByRole("button", { name: "专辑", exact: true }).click();
  await page.getByRole("button", { name: /潮汐与回声/ }).click();
  await expect(page.locator(".collection-detail-hero h1")).toHaveCSS("font-size", "32px");
  await page.getByLabel("主导航").getByRole("button", { name: "艺术家", exact: true }).click();
  await page.getByRole("button", { name: /林岚/ }).click();
  await expect(page.locator(".collection-detail-hero h1")).toHaveCSS("font-size", "32px");
  await page.getByLabel("主导航").getByRole("button", { name: "安静的晚上", exact: true }).click();
  await expect(page.locator(".playlist-hero h1")).toHaveCSS("font-size", "32px");
});

test("home artwork feathers into both backgrounds without a border", async ({ page }) => {
  await page.goto("/");
  for (const theme of ["深色", "浅色"]) {
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: theme, exact: true }).click();
    await page.getByRole("button", { name: "首页", exact: true }).click();
    await page.locator(".page-scroll").evaluate((element) => element.scrollTo(0, 0));
    await expect(page.locator(".hero-art")).toHaveCSS("border-top-width", "0px");
    await expect(page.locator(".hero-art")).toHaveCSS("box-shadow", "none");
    expect(
      await page.locator(".hero-art").evaluate((element) => getComputedStyle(element).maskImage),
    ).toContain("linear-gradient");
    await page.screenshot({
      path: `test-results/home-feather-${theme === "深色" ? "dark" : "light"}.png`,
      fullPage: true,
    });
  }
});
