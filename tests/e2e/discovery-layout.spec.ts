import { expect, test } from "@playwright/test";

const android = "Mozilla/5.0 (Linux; Android 16) Chrome/140 Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";

for (const client of [
  { name: "desktop", width: 1280, height: 800, variant: "A" },
  { name: "Android phone", width: 360, height: 800, variant: "C", ua: android },
  { name: "iPhone", width: 390, height: 844, variant: "C", ua: iphone },
  { name: "Pad rotation", width: 1024, height: 768, variant: "A", ua: android },
] as const) {
  test(`recommendation card layout on ${client.name}`, async ({ browser }, testInfo) => {
    const page = await browser.newPage({
      viewport: { width: client.width, height: client.height },
      ...("ua" in client && { userAgent: client.ua, hasTouch: true }),
    });
    try {
      await page.addInitScript(() => {
        localStorage.setItem("nanoplayer.recommendations.v1", JSON.stringify({
          version: 1, active: [-1, -2], generatedAt: Date.now(),
          title: "深夜仍有一盏灯，送给一路走来的你",
          description: "从你最近常听的旋律出发，挑出那些熟悉的声音里还没来得及听熟的作品。".repeat(4),
        }));
      });
      await page.goto("/");
      const card = page.locator(".home-discovery");
      const art = card.locator(".hero-art");
      const copy = card.locator(".home-discovery-copy");
      const play = card.getByRole("button", { name: "播放推荐歌单" });
      await expect(play).toHaveText("播放");
      await expect(card.getByRole("heading")).toContainText("深夜仍有一盏灯");
      const check = async (variant: string) => {
        const cover = (await art.boundingBox())!;
        const text = (await copy.boundingBox())!;
        await expect(play).toBeEnabled();
        expect(await copy.locator(".hero-copy").evaluate((element) =>
          element.scrollHeight <= element.clientHeight + 1)).toBe(true);
        if (variant === "A") {
          expect(cover.x + cover.width).toBeLessThan(text.x);
          expect(cover.height + 1).toBeGreaterThanOrEqual(text.height);
        } else {
          expect(cover.x).toBeCloseTo(text.x, 0);
          expect(cover.width).toBeCloseTo(text.width, 0);
          expect(cover.y + cover.height).toBeLessThan(text.y);
          expect(cover.width / cover.height).toBeCloseTo(2.7, 1);
        }
        await card.screenshot({ path: testInfo.outputPath(`card-${variant}.png`) });
      };
      await check(client.variant);
      if (client.name === "Pad rotation") {
        await page.setViewportSize({ width: 768, height: 1024 });
        await check("C");
      }
      await play.click();
      await expect(page.locator(".play-button")).toHaveAttribute("aria-label", "暂停");
    } finally {
      await page.close();
    }
  });
}

test("recommendation collage skips missing and failed artwork", async ({ page }) => {
  await page.goto("/");
  const cover = page.locator(".home-discovery .hero-art");
  await expect(cover.locator(".cover-count-0")).toBeVisible();
  await expect(cover.locator("img")).toHaveCount(0);
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const artwork = (color: string) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="${color}" width="40" height="40"/></svg>`;
      return "data:image/svg+xml," + encodeURIComponent(svg);
    };
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args?: { trackId?: number }) => {
          if (command !== "artwork_data_url") return null;
          if (args?.trackId === 101) return artwork("maroon");
          if (args?.trackId === 102) return artwork("teal");
          return "data:image/png;base64,invalid";
        },
      },
    });
    const base = useNanoStore.getState().tracks[0];
    useNanoStore.setState({
      tracks: [101, 102, 103, 104].map((id) => ({
        ...base, id, album: String(id), hasArtwork: id !== 104, artworkHash: `art-${id}`,
      })),
    });
  });
  await expect(cover.locator(".cover-count-2 img")).toHaveCount(2);
  await expect(cover.locator('img[src*="album-placeholder"]')).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const tint = page.locator(".home-artwork-tint");
  const palette = () => tint.evaluate((element) => getComputedStyle(element)
    .getPropertyValue("--home-tint-primary").trim());
  const select = (id: number, destination: "home" | "now-playing") => page.evaluate(
    async ([id, destination]) => {
      const { useNanoStore } = await import("/src/store.ts");
      useNanoStore.setState({ currentTrackId: id, page: destination });
    }, [id, destination] as const,
  );
  let previous = "rgb(102, 118, 140)";
  for (const id of [101, 102]) {
    await select(id, "home");
    await expect.poll(palette).not.toBe(previous);
    previous = await palette();
    await select(id, "now-playing");
    await expect.poll(palette).toBe(previous);
    await expect(tint).toHaveCSS("transition-property", "none");
  }
});

test("four covers form a matrix on desktop and an expandable strip on phone", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args?: { trackId?: number }) => {
          if (command !== "artwork_data_url") return null;
          const id = args?.trackId ?? 0;
          const colors = ["#a64b43", "#267274", "#756098", "#5a7040"];
          return "data:image/svg+xml," + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${colors[id % 4]}"/><circle cx="40" cy="40" r="18" fill="#f3deba"/></svg>`,
          );
        },
      },
    });
    const first = useNanoStore.getState().tracks[0];
    useNanoStore.setState({
      tracks: [201, 202, 203, 204].map(id => ({
        ...first, id, hasArtwork: true, album: `测试专辑 ${id}`,
      })),
    });
  });
  const card = page.locator(".home-discovery");
  const matrix = card.locator(".cover-count-4");
  const gallery = card.locator(".discovery-gallery");
  await expect(matrix.locator("img")).toHaveCount(4);
  await expect(gallery).toBeHidden();
  const rects = await matrix.locator("img").evaluateAll(images =>
    images.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
  expect(rects[0].x).toBeCloseTo(rects[2].x);
  expect(rects[0].y).toBeCloseTo(rects[1].y);
  expect(rects[3].y).toBeGreaterThan(rects[0].y);
  await card.screenshot({ path: testInfo.outputPath("matrix.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.platform = "android";
    document.documentElement.dataset.device = "phone";
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const tiles = gallery.getByRole("button");
  await expect(tiles).toHaveCount(4);
  await expect(gallery).toBeVisible();
  await expect(tiles.first()).toHaveCSS("transition-property", "none");
  const rail = (await gallery.boundingBox())!;
  const lastTile = (await tiles.last().boundingBox())!;
  expect(lastTile.x + lastTile.width).toBeCloseTo(rail.x + rail.width, 0);
  const firstTile = (await tiles.first().boundingBox())!;
  const secondTile = (await tiles.nth(1).boundingBox())!;
  expect(secondTile.width).toBeCloseTo(secondTile.height);
  expect(firstTile.x + firstTile.width).toBeGreaterThan(secondTile.x);
  await tiles.nth(1).click({ position: { x: 12, y: 30 } });
  await expect(tiles.nth(1)).toHaveAttribute("aria-pressed", "true");
  const openedTile = (await tiles.nth(1).boundingBox())!;
  expect(openedTile.width).toBeCloseTo(openedTile.height);
  const followingTile = (await tiles.nth(2).boundingBox())!;
  expect(openedTile.x + openedTile.width).toBeCloseTo(followingTile.x);
  expect(await gallery.evaluate(el => el.scrollWidth)).toBeGreaterThan((await gallery.boundingBox())!.width);
  await tiles.last().focus();
  await page.keyboard.press("Enter");
  await expect(tiles.last()).toHaveAttribute("aria-pressed", "true");
  await expect(tiles.nth(1)).toHaveAttribute("aria-pressed", "false");
  await card.screenshot({ path: testInfo.outputPath("accordion.png") });
  // Removing an album must resize the rail without adding a filler tile.
  for (const count of [3, 2]) {
    await page.evaluate(async (count) => {
      const { useNanoStore } = await import("/src/store.ts");
      useNanoStore.setState({ tracks: useNanoStore.getState().tracks.slice(0, count) });
    }, count);
    await expect(tiles).toHaveCount(count);
    const selected = gallery.getByRole("button", { pressed: true });
    if (await selected.count()) await selected.press("Enter");
    const container = (await gallery.boundingBox())!;
    const last = (await tiles.last().boundingBox())!;
    expect(last.width).toBeCloseTo(last.height);
    expect(last.x + last.width).toBeCloseTo(container.x + container.width, 0);
  }
});
