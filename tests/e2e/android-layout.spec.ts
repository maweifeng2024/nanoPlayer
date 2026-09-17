import { expect, test } from "@playwright/test";

test.describe("Android layouts", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36", hasTouch: true });

  test("Pad keeps desktop navigation when its window becomes narrow", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1100 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-device", "pad");
    for (const width of [840, 600, 360]) {
      await page.setViewportSize({ width, height: 1100 });
      await expect(page.locator(".phone-navigation")).toBeHidden();
      await expect(page.locator(".menu-button")).toBeVisible();
      await page.locator(".menu-button").click();
      await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
      await expect(page.locator(".sidebar nav .nav-item")).toHaveText([
        "首页", "本地资料库", "歌曲", "专辑", "艺术家", "最近添加", "播放最多", "高评分",
      ]);
      await page.locator(".sidebar-close").click();
      await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
      await expect(page.locator("html")).toHaveAttribute("data-device", "pad");
    }
  });

  test("phone exposes library tabs and playlists without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-device", "phone");
    await expect(page.locator(".phone-navigation button")).toHaveText(["首页", "资料库", "歌单"]);
    await page.locator(".phone-navigation").getByRole("button", { name: "资料库" }).click();
    await expect(page.locator(".phone-library-tabs")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".phone-navigation").getByRole("button", { name: "歌单" }).click();
    await expect(page.locator(".phone-playlists")).toBeVisible();
  });
});
