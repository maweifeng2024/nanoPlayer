import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { connectAndroidPlayback } from "./android";
import { useNanoStore } from "../store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const original = useNanoStore.getState();
const snapshot = {
  queue: ["1", "2"],
  trackId: "1",
  positionMs: 750,
  playWhenReady: true,
  shuffle: false,
  repeatMode: 0,
  playCounts: { 1: 3 },
};
const flush = () => vi.advanceTimersByTimeAsync(0);
let disconnect: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setInterval, clearInterval });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.mocked(invoke).mockResolvedValue(snapshot);
  useNanoStore.setState({
    ...original,
    tracks: [1, 2, 3].map((id) => ({ ...original.tracks[0], id, path: `content://fixture/${id}` })),
    queue: [1, 2],
    currentTrackId: 1,
  });
});
afterEach(() => {
  disconnect?.();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useNanoStore.setState(original);
});

describe("Android service synchronization", () => {
  it("restores the live native queue without issuing playback or counting in JavaScript", async () => {
    disconnect = connectAndroidPlayback();
    await flush();
    expect(useNanoStore.getState().progressMs).toBe(750);
    expect(useNanoStore.getState().playCounts[1]).toBe(3);
    expect(vi.mocked(invoke).mock.calls).toHaveLength(2);
    vi.mocked(invoke).mockResolvedValue({
      ...snapshot,
      trackId: "2",
      positionMs: 10,
      playCounts: { 1: 4 },
    });
    vi.advanceTimersByTime(500);
    await flush();
    expect(useNanoStore.getState().currentTrackId).toBe(2);
    expect(
      vi
        .mocked(invoke)
        .mock.calls.every((call) =>
          ["snapshot", "volume"].includes(
            (call[1] as { payload: { action: string } }).payload.action,
          ),
        ),
    ).toBe(true);
  });
  it("updates queued tracks without restarting the current native item", async () => {
    disconnect = connectAndroidPlayback();
    await flush();
    useNanoStore.getState().enqueue(3);
    await flush();
    expect(invoke).toHaveBeenLastCalledWith(
      "android_playback",
      expect.objectContaining({ payload: expect.objectContaining({ action: "updateQueue" }) }),
    );
  });
  it("never replaces the native queue when a library scan updates UI data", async () => {
    disconnect = connectAndroidPlayback();
    await flush();
    useNanoStore.getState().replaceLibrary([], useNanoStore.getState().tracks, []);
    await flush();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.every((call) =>
          ["snapshot", "volume"].includes(
            (call[1] as { payload: { action: string } }).payload.action,
          ),
        ),
    ).toBe(true);
  });
  it("stops polling when the owning app instance is disposed", async () => {
    disconnect = connectAndroidPlayback();
    await flush();
    disconnect();
    vi.advanceTimersByTime(5000);
    await flush();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

it("keeps queue identity during polling so menus and scroll do not reset", async () => {
  disconnect = connectAndroidPlayback();
  await flush();
  const queue = useNanoStore.getState().queue;
  vi.advanceTimersByTime(500);
  await flush();
  expect(useNanoStore.getState().queue).toBe(queue);
});

it("adopts the native shuffle timeline and end-of-queue state", async () => {
  vi.mocked(invoke).mockResolvedValue({
    ...snapshot,
    shuffle: true,
    playbackOrder: ["2", "1"],
    ended: true,
    playWhenReady: false,
  });
  disconnect = connectAndroidPlayback();
  await flush();
  expect(useNanoStore.getState()).toMatchObject({
    shuffleOrder: [2, 1],
    orderMode: "shuffle",
    queueEnded: true,
    queue: [1, 2],
  });
  useNanoStore.getState().togglePlay();
  await flush();
  const calls = vi
    .mocked(invoke)
    .mock.calls.map((call) => (call[1] as { payload: Record<string, unknown> }).payload);
  expect(calls.find((payload) => payload.action === "setQueue")?.queue).toContain('"id":"2"');
});

it("an in-flight old snapshot cannot undo immediate shuffle feedback", async () => {
  disconnect = connectAndroidPlayback();
  await flush();
  let resolveSnapshot!: (value: typeof snapshot) => void;
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(500);
  useNanoStore.getState().toggleOrderMode();
  expect(useNanoStore.getState().orderMode).toBe("shuffle");
  vi.mocked(invoke).mockResolvedValue({ ...snapshot, shuffle: true, playbackOrder: ["1", "2"] });
  resolveSnapshot(snapshot);
  await flush();
  expect(useNanoStore.getState().orderMode).toBe("shuffle");
});
