import { beforeEach, expect, it, vi } from "vitest";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { saveUserState } from "../tauriBridge";
import { checkForUpdates, installUpdate, useUpdateStore } from "./updater";
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("../tauriBridge", () => ({
  isTauri: () => true,
  saveUserState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../store", () => ({
  getNativeUserState: () => ({ volume: 0.5 }),
  useNanoStore: { getState: () => ({ setNotice: vi.fn() }) },
}));
beforeEach(() => {
  vi.clearAllMocks();
  useUpdateStore.setState({
    phase: "idle",
    update: null,
    error: undefined,
    received: 0,
    total: undefined,
  });
});
it("deduplicates checks and handles no newer version", async () => {
  vi.mocked(check).mockResolvedValue(null);
  await Promise.all([checkForUpdates(), checkForUpdates()]);
  expect(check).toHaveBeenCalledTimes(1);
  expect(useUpdateStore.getState().phase).toBe("current");
});
it("allows retry after offline checks without disturbing playback", async () => {
  vi.mocked(check).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null);
  await checkForUpdates();
  expect(useUpdateStore.getState().phase).toBe("error");
  await checkForUpdates();
  expect(useUpdateStore.getState().phase).toBe("current");
});
it("persists user state before installation, tracks progress and waits for restart", async () => {
  const downloadAndInstall = vi.fn(async (callback) => {
    expect(saveUserState).toHaveBeenCalledWith({ volume: 0.5 });
    callback({ event: "Started", data: { contentLength: 100 } });
    callback({ event: "Progress", data: { chunkLength: 100 } });
  });
  useUpdateStore.setState({
    phase: "available",
    update: { downloadAndInstall } as unknown as Update,
  });
  await Promise.all([installUpdate(), installUpdate()]);
  expect(downloadAndInstall).toHaveBeenCalledTimes(1);
  expect(useUpdateStore.getState()).toMatchObject({ phase: "ready", received: 100, total: 100 });
});
it("never reports an invalid signature as installed", async () => {
  useUpdateStore.setState({
    phase: "available",
    update: {
      downloadAndInstall: vi.fn().mockRejectedValue(new Error("invalid signature")),
    } as unknown as Update,
  });
  await installUpdate();
  expect(useUpdateStore.getState()).toMatchObject({
    phase: "error",
    error: "Error: invalid signature",
  });
});
