import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNanoStore } from "../store";
import { androidCommand } from "../platform/android";
import { addLibraryRoots } from "../tauriBridge";
import { chooseLibraryFolders } from "./importFolders";
vi.mock("../platform/android", () => ({ isAndroid: () => true, androidCommand: vi.fn() }));
vi.mock("../tauriBridge", () => ({ isTauri: () => true, addLibraryRoots: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

describe("folder import shared by onboarding and library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNanoStore.setState({
      roots: [],
      tracks: [],
      issues: [],
      scanning: false,
      pendingRootPaths: [],
      notice: undefined,
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("shows the selected folder while scanning and deduplicates concurrent imports", async () => {
    vi.mocked(androidCommand).mockResolvedValue({ uri: "content://music/tree/primary%3AMusic" });
    let resolve!: (value: Awaited<ReturnType<typeof addLibraryRoots>>) => void;
    vi.mocked(addLibraryRoots).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const importing = chooseLibraryFolders();
    await Promise.resolve();
    expect(useNanoStore.getState().scanning).toBe(true);
    expect(useNanoStore.getState().pendingRootPaths).toEqual([
      "content://music/tree/primary%3AMusic",
    ]);
    await chooseLibraryFolders();
    expect(androidCommand).toHaveBeenCalledTimes(1);
    const root = {
      id: 1,
      path: "content://music/tree/primary%3AMusic",
      name: "Music",
      availability: "available",
      songCount: 0,
      sizeBytes: 0,
    };
    resolve({ roots: [root], tracks: [], issues: [] });
    await importing;
    expect(useNanoStore.getState().roots).toEqual([root]);
    expect(useNanoStore.getState().pendingRootPaths).toEqual([]);
    expect(useNanoStore.getState().scanning).toBe(false);
  });
  it("handles picker cancellation without scanning", async () => {
    vi.mocked(androidCommand).mockResolvedValue({ cancelled: true });
    await chooseLibraryFolders();
    expect(addLibraryRoots).not.toHaveBeenCalled();
    expect(useNanoStore.getState().pendingRootPaths).toEqual([]);
  });
  it("reports permission or scan failures and allows retry", async () => {
    vi.mocked(androidCommand).mockRejectedValueOnce(new Error("permission expired"));
    await chooseLibraryFolders();
    expect(useNanoStore.getState().notice).toContain("permission expired");
    vi.mocked(androidCommand).mockResolvedValue({ uri: "content://music/tree/a" });
    vi.mocked(addLibraryRoots).mockRejectedValue(new Error("scan failed"));
    await chooseLibraryFolders();
    expect(useNanoStore.getState().notice).toContain("scan failed");
    expect(useNanoStore.getState().scanning).toBe(false);
    expect(useNanoStore.getState().pendingRootPaths).toEqual([]);
  });
});
