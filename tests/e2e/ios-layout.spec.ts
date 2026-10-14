import { expect, test } from "@playwright/test";

test.describe("iPhone", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15", hasTouch: true });
  test("phone navigation, landscape and Wi-Fi dialog", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-platform", "ios");
    await expect(page.locator("html")).toHaveAttribute("data-device", "phone");
    await page.locator(".phone-navigation").getByRole("button", { name: "资料库" }).click();
    await page.locator(".phone-library-tabs").getByRole("button", { name: "本地资料库" }).click();
    await expect(page.getByRole("button", { name: "添加来源" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Files 来源" })).toBeVisible();
    await page.getByRole("button", { name: "Wi-Fi 传歌" }).click();
    const dialog = page.getByRole("dialog", { name: "Wi-Fi 传歌" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "开启接收" }).click();
    await expect(dialog.getByRole("alert")).toContainText("需要安装 iOS 应用");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Wi-Fi 传歌" })).toBeFocused();
    await page.screenshot({ path: "test-results/ios-phone-library.png" });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator("html")).toHaveAttribute("data-device", "phone");
    await expect(page.locator(".phone-navigation")).toBeVisible();
  });
});

test.describe("iPad desktop user agent", () => {
  test.use({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15", hasTouch: true });
  test("Pad sidebar survives narrow windows and overlay preserves navigation", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 }));
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-platform", "ios");
    await expect(page.locator("html")).toHaveAttribute("data-device", "pad");
    await expect(page.locator(".phone-navigation")).toBeHidden();
    await page.screenshot({ path: "test-results/ios-pad-home.png" });
    for (const width of [840, 600]) {
      await page.setViewportSize({ width, height: 900 });
      expect((await page.locator(".sidebar").boundingBox())?.width).toBeCloseTo(72, 2);
      await expect(page.locator(".sidebar .nav-label").first()).toBeHidden();
      await expect(page.locator(".phone-navigation")).toBeHidden();
    }
    await page.screenshot({ path: "test-results/ios-pad-600.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("html")).toHaveAttribute("data-device", "pad");
    await expect(page.locator(".phone-navigation")).toBeHidden();
    await page.getByRole("button", { name: "打开导航" }).click();
    await expect(page.locator(".sidebar .nav-label").first()).toBeVisible();
    await page.locator(".sidebar").getByRole("button", { name: "本地资料库" }).click();
    await expect(page.getByRole("heading", { name: "本地资料库" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
