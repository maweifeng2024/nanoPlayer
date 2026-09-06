import { expect, test } from "@playwright/test";

test("English applies throughout the UI and survives reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByLabel("Search library")).toHaveAttribute(
    "placeholder",
    "Search songs, artists or albums",
  );
  await expect(page.getByLabel("Playback order: In Order", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back Up Now", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Database backups are available in the desktop app.",
  );
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".hero h1")).toContainText(
    /Listen|Make|here|space|melody|music|time|today/i,
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Songs", exact: true }).click();
  await expect(page.getByRole("button", { name: "Date Added", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New Playlist", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Playlist name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("most played excludes unplayed tracks and sorts count and last-played time", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "播放最多", exact: true }).click();
  await expect(page.getByText("完整播放一首歌后，它会出现在这里。")).toBeVisible();
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    useNanoStore.setState({
      playCounts: { [-1]: 2, [-2]: 8, [-3]: 0 },
      lastPlayedAt: {
        [-1]: "2026-09-06T10:30:00Z",
        [-2]: "2026-09-05T09:15:00Z",
        [-3]: "2026-09-06T11:00:00Z",
      },
    });
  });
  const rows = page.locator("[data-track-id]");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute("data-track-id", "-2");
  await expect(page.getByRole("button", { name: "添加日期", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "播放次数 ↓", exact: true }).click();
  await expect(rows.first()).toHaveAttribute("data-track-id", "-1");
  await page.getByRole("button", { name: "最后一次播放时间", exact: true }).click();
  await expect(rows.first()).toHaveAttribute("data-track-id", "-2");
  await page.getByRole("button", { name: "最后一次播放时间 ↑", exact: true }).click();
  await expect(rows.first()).toHaveAttribute("data-track-id", "-1");
  await page.screenshot({ path: "test-results/most-played-zh.png" });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Most Played", exact: true }).click();
  await expect(page.getByRole("button", { name: "Last Played", exact: true })).toBeVisible();
  await expect(page.locator(".added-cell").first()).toContainText("Sep");
  await page.screenshot({ path: "test-results/most-played-en.png" });
});

test("natural end counts once; seeking to the end does not count", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const track = useNanoStore.getState().tracks[0];
    useNanoStore.setState({
      tracks: [{ ...track, durationMs: 1000 }],
      queue: [-1],
      playCounts: {},
      repeatMode: "off",
    });
  });
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useNanoStore } = await import("/src/store.ts");
        return useNanoStore.getState().playCounts[-1];
      }),
    )
    .toBe(1);
  await expect(page.getByRole("button", { name: "播放", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { useNanoStore } = await import("/src/store.ts");
    const track = useNanoStore.getState().tracks[0];
    useNanoStore.setState({ tracks: [{ ...track, durationMs: 10000 }], playCounts: {} });
  });
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByLabel("播放进度", { exact: true }).fill("9900");
  await expect(page.getByRole("button", { name: "播放", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "播放最多", exact: true }).click();
  await expect(page.getByText("完整播放一首歌后，它会出现在这里。")).toBeVisible();
});

test("cover colors change subtly in dark and light themes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "歌曲", exact: true }).click();
  await page.getByRole("button", { name: "播放 海平面以下", exact: true }).click();
  await expect(page.locator(".ambient-background")).toHaveCSS(
    "--ambient-primary",
    "rgb(49, 88, 107)",
  );
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.screenshot({ path: "test-results/ambient-blue-dark.png" });
  await page.getByRole("button", { name: "播放 迟到的风", exact: true }).click();
  await expect(page.locator(".ambient-background")).toHaveCSS(
    "--ambient-primary",
    "rgb(110, 86, 74)",
  );
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await expect(page.locator(".content")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "test-results/ambient-warm-light.png" });
});

test("native playback checkpoints complete sessions across pause/resume and short tracks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = {
      trackId: 0,
      position: 0,
      paused: true,
      sessionId: 0,
      checkpoints: [] as Array<Record<string, unknown>>,
    };
    Object.assign(window, {
      __nativeTest: native,
      __TAURI_INTERNALS__: {
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
        invoke: async (command: string, args: Record<string, any> = {}) => {
          if (command === "library_snapshot")
            return {
              roots: [],
              issues: [],
              playlists: [],
              tracks: [
                {
                  id: 1,
                  title: "Native Song",
                  artist: "Test Artist",
                  album: "Test Album",
                  path: "fixture.wav",
                  durationMs: 1500,
                  format: "WAV",
                  addedAt: "2026-09-06",
                },
                {
                  id: 2,
                  title: "Short Song",
                  artist: "Test Artist",
                  album: "Test Album",
                  path: "short.wav",
                  durationMs: 100,
                  format: "WAV",
                  addedAt: "2026-09-06",
                },
              ],
              userState: {
                statisticsVersion: 1,
                visualDesignVersion: 2,
                onboardingDismissed: true,
                playCounts: {},
                lastPlayedAt: {},
                queue: [1, 2],
                repeatMode: "off",
              },
            };
          if (command === "playback_load") {
            native.trackId = args.trackId;
            native.position = args.startMs;
            native.paused = !args.autoplay;
          }
          if (command === "playback_pause") native.paused = true;
          if (command === "playback_resume") native.paused = false;
          if (command === "playback_status") {
            const duration = native.trackId === 1 ? 1500 : 100;
            if (!native.paused) native.position += 250;
            return {
              positionMs: native.position >= duration ? 0 : native.position,
              paused: native.paused,
              empty: native.position >= duration,
            };
          }
          if (command === "begin_playback_session") return ++native.sessionId;
          if (command === "checkpoint_playback_session") native.checkpoints.push(args);
          return null;
        },
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Native Song", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => page.getByLabel("播放进度", { exact: true }).inputValue()).not.toBe("0");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__nativeTest.checkpoints.filter((entry: any) => entry.counted).length,
      ),
    )
    .toBe(2);
  await page.getByRole("button", { name: "播放最多", exact: true }).click();
  await expect(page.locator("[data-track-id]")).toHaveCount(2);
  const completed = await page.evaluate(() =>
    (window as any).__nativeTest.checkpoints.filter((entry: any) => entry.counted),
  );
  expect(completed.map((entry: any) => entry.sessionId)).toEqual([1, 2]);
  expect(completed.every((entry: any) => entry.endReason === "completed")).toBe(true);
});
