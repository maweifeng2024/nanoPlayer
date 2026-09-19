import { expect, test } from "@playwright/test";

const screens = [
  { name: "desktop-dark", width: 1200, height: 800, theme: "dark", android: false },
  { name: "desktop-light", width: 1200, height: 800, theme: "light", android: false },
  { name: "desktop-720", width: 720, height: 800, theme: "dark", android: false },
  { name: "phone-360", width: 360, height: 800, theme: "dark", android: true },
  { name: "pad-600", width: 600, height: 900, theme: "dark", android: true },
  { name: "pad-1024", width: 1024, height: 900, theme: "dark", android: true },
] as const;

for (const screen of screens) {
  test.describe(screen.name, () => {
    test.use({
      viewport: { width: screen.width, height: screen.height },
      ...(screen.android
        ? {
            userAgent:
              "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
            hasTouch: true,
          }
        : {}),
    });
    test("visual baseline", async ({ page }) => {
      test.skip(
        process.platform !== "darwin",
        "Reference images use macOS system fonts; other platforms retain layout/interaction checks.",
      );
      await page.clock.setFixedTime(new Date("2026-09-19T08:00:00Z"));
      await page.addInitScript(() => {
        Math.random = () => 0.42;
      });
      await page.goto("/");
      await page.evaluate(async (theme) => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.setState({ theme });
      }, screen.theme);
      if (screen.theme === "light")
        await expect(page.locator(".home-track-list").first()).toHaveCSS(
          "background-color",
          "rgba(0, 0, 0, 0)",
        );
      await expect(page.locator(".hero-art img")).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, (image) => image.decode()));
      });
      await expect(page).toHaveScreenshot(`${screen.name}.png`, {
        animations: "disabled",
        threshold: 0.1,
        maxDiffPixelRatio: 0.01,
      });
    });
  });
}
