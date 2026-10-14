import { expect, test } from "@playwright/test";

test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15", hasTouch: true, viewport: { width: 390, height: 844 } });

async function library(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator(".phone-navigation").getByRole("button", { name: "资料库" }).click();
  await page.locator(".phone-library-tabs").getByRole("button", { name: "本地资料库" }).click();
  await expect(page.getByText("浏览器演示：文件操作仅影响示例，不读取设备文件。")).toBeVisible();
}

test("three sources, managed folder creation, rename and move", async ({ page }) => {
  await library(page);
  for (const name of ["nanoPlayer 资源", "Files 来源", "其他音乐 App 来源"]) await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  await page.locator(".ios-source-open").filter({ hasText: "nanoPlayer" }).click();
  await page.getByRole("button", { name: "新建文件夹", exact: true }).click();
  const create = page.getByRole("dialog", { name: "新建文件夹", exact: true });
  await create.getByLabel("名称", { exact: true }).fill("测试专辑");
  await create.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".ios-file-open").filter({ hasText: "测试专辑" })).toBeVisible();
  const more = page.getByRole("button", { name: "更多操作 测试专辑", exact: true });
  await more.click(); await expect(page.getByRole("menu")).toBeVisible();
  await more.click(); await expect(page.getByRole("menu")).toBeHidden();
  await more.click(); await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "重命名", exact: true });
  await rename.getByLabel("名称", { exact: true }).fill("现场录音");
  await rename.getByRole("button", { name: "保存" }).click();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择 现场录音", exact: true }).check();
  await page.getByRole("button", { name: "移动到", exact: true }).click();
  const destination = page.getByRole("dialog", { name: "选择 nanoPlayer 目标文件夹" });
  await expect(destination.getByRole("button", { name: "现场录音", exact: true })).toBeDisabled();
  await destination.getByRole("button", { name: "演唱会", exact: true }).click();
  await destination.getByRole("button", { name: "选择此文件夹" }).click();
  await expect(page.getByRole("status")).toContainText("完成 1 项");
  await page.locator(".ios-file-open").filter({ hasText: "演唱会" }).click();
  await expect(page.locator(".ios-file-open").filter({ hasText: "现场录音" })).toBeVisible();
  await page.screenshot({ path: "test-results/ios-library-phone-managed.png" });
});

test("external content offers only copy/index and Wi-Fi locks destination", async ({ page }) => {
  await library(page);
  await page.locator(".ios-source-open").filter({ hasText: "Files · iCloud Drive" }).click();
  await expect(page.getByRole("button", { name: "新建文件夹", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: /^更多操作 示例/ })).toBeHidden();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择 示例.flac", exact: true }).check();
  await expect(page.getByRole("button", { name: "移动到", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "仅索引选中项", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("索引范围");
  await expect(page.locator(".ios-file-open").filter({ hasText: "专辑" })).toContainText("未索引");
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择 示例.flac", exact: true }).check();
  await page.getByRole("button", { name: "复制到 nanoPlayer", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "选择此文件夹" }).click();
  await expect(page.getByRole("status")).toContainText("完成 1 项");
  await page.getByRole("button", { name: "全部来源", exact: true }).click();
  await page.getByRole("button", { name: "Wi-Fi 传歌", exact: true }).click();
  const wifi = page.getByRole("dialog", { name: "Wi-Fi 传歌", exact: true });
  await wifi.getByRole("button", { name: "选择接收文件夹" }).click();
  const picker = page.getByRole("dialog", { name: "选择 nanoPlayer 目标文件夹" });
  await picker.getByRole("button", { name: "上一级" }).click();
  await picker.getByRole("button", { name: "演唱会", exact: true }).click();
  await picker.getByRole("button", { name: "选择此文件夹" }).click();
  await expect(wifi).toContainText("保存到：nanoPlayer / 演唱会");
  await wifi.getByRole("button", { name: "开启接收" }).click();
  await expect(wifi.getByRole("alert")).toContainText("需要安装 iOS 应用");
  await page.keyboard.press("Escape");
  await expect(wifi).toBeHidden();
});

test.describe("iPad resource browser", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15", viewport: { width: 1024, height: 1000 } });
  test("source tree adapts to narrow windows and both themes", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar").getByRole("button", { name: "本地资料库", exact: true }).click();
    await page.getByRole("button", { name: "浏览 nanoPlayer", exact: true }).click();
    for (const width of [1024, 840, 600, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width >= 1000) await expect(page.locator(".ios-source-list")).toBeVisible();
      else await expect(page.locator(".ios-source-list")).toBeHidden();
      const browser = await page.locator(".ios-file-browser").boundingBox();
      expect(browser!.x).toBeGreaterThanOrEqual(0);
      expect(browser!.x + browser!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `test-results/ios-library-pad-${width}.png` });
    }
    await page.evaluate(async () => (await import("/src/store.ts")).useNanoStore.getState().setTheme("light"));
    await page.screenshot({ path: "test-results/ios-library-pad-light.png" });
  });
});
