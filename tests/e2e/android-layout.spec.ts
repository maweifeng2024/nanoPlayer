import { expect, test } from "@playwright/test";

test.describe("Android layouts", () => {
  test.use({
    userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    hasTouch: true,
  });

  test("foldable switches layouts as the current window crosses 600px", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1100 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-device", "pad");
    for (const width of [840, 600, 360, 720, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      if (width >= 600) await expect(page.locator(".phone-navigation")).toBeHidden();
      else await expect(page.locator(".phone-navigation")).toBeVisible();
      await expect(page.locator(".menu-button")).toBeVisible();
      await page.locator(".menu-button").click();
      await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
      await expect(page.locator(".sidebar nav .nav-item")).toHaveText([
        "首页",
        "本地资料库",
        "歌曲",
        "专辑",
        "艺术家",
        "歌单",
        "最近添加",
        "播放最多",
        "高评分",
      ]);
      await page.locator(".sidebar-close").click();
      await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
      await expect(page.locator("html")).toHaveAttribute(
        "data-device",
        width >= 600 ? "pad" : "phone",
      );
    }
  });

  test("phone exposes library tabs and playlists without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-device", "phone");
    await expect(page.locator(".phone-navigation button")).toHaveText(["首页", "资料库", "歌单"]);
    await page.locator(".phone-navigation").getByRole("button", { name: "资料库" }).click();
    await expect(page.locator(".phone-library-tabs")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator(".phone-navigation").getByRole("button", { name: "歌单" }).click();
    await expect(page.locator(".phone-playlists")).toBeVisible();
  });
});

test.describe("Android touch interactions", () => {
  test.use({
    userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    hasTouch: true,
  });

  test("home uses twelve cards, three rows per column, in requested order", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.evaluate(async () => {
      const { useNanoStore } = await import("/src/store.ts");
      const base = useNanoStore.getState().tracks[0];
      const tracks = Array.from({ length: 16 }, (_, i) => ({
        ...base,
        id: i + 1,
        title: `Song ${i + 1}`,
      }));
      useNanoStore.setState({
        tracks,
        ratings: Object.fromEntries(tracks.map((t) => [t.id, 5])),
        playCounts: Object.fromEntries(tracks.map((t) => [t.id, 2])),
      });
    });
    for (const kind of ["popular", "rated", "recent"]) {
      const list = page.locator(`.home-track-list-${kind}`);
      await expect(list.locator("li")).toHaveCount(12);
      const positions = await list.locator("li").evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y };
        }),
      );
      expect(positions[0].x).toBe(positions[2].x);
      expect(positions[3].x).toBeGreaterThan(positions[0].x);
      expect(positions[3].y).toBe(positions[0].y);
      expect(
        await list
          .locator(".home-track-heading-copy")
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBeLessThan(32);
    }
    const y = await page
      .locator(".home-track-list")
      .evaluateAll((nodes) =>
        Object.fromEntries(
          nodes.map((n) => [n.getAttribute("aria-label"), n.getBoundingClientRect().top]),
        ),
      );
    expect(y["播放最多"]).toBeLessThan(y["高评分"]);
    expect(y["高评分"]).toBeLessThan(y["最近添加"]);
    await page.locator(".menu-button").click();
    await expect(page.locator(".sidebar-playlists")).toBeHidden();
    await page.locator(".sidebar").getByRole("button", { name: "设置", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("设置");
  });

  test("playlist removal requires edit, selection and confirmation", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".phone-navigation").getByRole("button", { name: "歌单" }).click();
    await page.locator(".phone-playlists .playlist-open").first().click();
    await expect(page.getByRole("button", { name: "删除歌单", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "从歌单移除", exact: true })).toHaveCount(0);
    const count = await page.locator("[data-track-id]").count();
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.locator(".row-leading button").first().click();
    await page.getByRole("button", { name: "从歌单移除", exact: true }).click();
    await expect(page.locator("[data-track-id]")).toHaveCount(count);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("android-back", { cancelable: true })),
    );
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.locator(".playlist-page")).toBeVisible();
    await page.getByRole("button", { name: "从歌单移除", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "从歌单移除", exact: true })
      .click();
    await expect(page.locator("[data-track-id]")).toHaveCount(count - 1);
    await page.getByRole("button", { name: "返回歌单", exact: true }).click();
    await expect(page.locator(".phone-playlists")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("playlist row menu keeps five action groups and settings stay compact", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".phone-navigation").getByRole("button", { name: "歌单" }).click();
    await page.locator(".phone-playlists .playlist-open").first().click();
    await page.locator(".more-menu").first().click();
    await expect(page.locator(".context-menu > button")).toHaveCount(4);
    await expect(page.locator(".context-menu > .phone-rating")).toBeVisible();

    await page.locator(".menu-button").click();
    await page.locator(".sidebar").getByRole("button", { name: "设置", exact: true }).click();
    const switchBox = await page.getByRole("switch").boundingBox();
    expect(switchBox?.height).toBeLessThanOrEqual(30);
    const widths = await page
      .locator(".appearance-setting .segmented button")
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  test("song typography matches home and more actions toggle closed", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const homeTitleSize = await page
      .locator(".recommendation-copy strong")
      .first()
      .evaluate((node) => getComputedStyle(node).fontSize);

    await page.evaluate(async () => {
      const { useNanoStore } = await import("/src/store.ts");
      useNanoStore.getState().setPage("songs");
    });
    await expect(page.locator(".track-title strong").first()).toHaveCSS("font-size", homeTitleSize);

    const more = page.locator(".more-menu").first();
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".context-menu")).toBeVisible();
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".context-menu")).toHaveCount(0);
  });

  test("playlist overview uses the playlist composition instead of its first track cover", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".phone-navigation").getByRole("button", { name: "歌单" }).click();
    const cover = page.locator(".playlist-list-art").first();
    await expect(cover.locator(".auto-playlist-cover")).toBeVisible();
    await expect(cover.locator(":scope > .track-cover")).toHaveCount(0);
  });

  for (const width of [390, 600, 1024]) {
    test(`cover and metadata both play, transport fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        useNanoStore.getState().setPage("songs");
      });
      await page.locator(".track-title-button").first().click();
      await expect(page.locator(".now-playing strong")).toHaveText(
        await page.locator(".track-title strong").first().innerText(),
      );
      await page.locator(".row-play").nth(1).click();
      await expect(page.locator(".now-playing strong")).toHaveText(
        await page.locator(".track-title strong").nth(1).innerText(),
      );
      await page.locator(".artwork-button").click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (width < 600) {
        const play = await page.locator(".play-button").boundingBox();
        expect(Math.abs(play!.x + play!.width / 2 - width / 2)).toBeLessThan(1);
        await expect(page.locator(".mobile-lyrics")).toBeVisible();
        await expect(page.locator(".mobile-queue")).toBeVisible();
      }
      await page.screenshot({ path: `test-results/android-player-${width}.png` });
    });
  }
});
