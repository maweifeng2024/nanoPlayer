import { afterEach, expect, test, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { isIOS, mobileCommand, mobileDevice } from "./mobile";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

test("iPhone landscape remains phone and iPad narrow windows remain Pad", () => {
  vi.stubGlobal("window", { innerWidth: 840 });
  vi.stubGlobal("navigator", { userAgent: "iPhone", maxTouchPoints: 5 });
  expect(isIOS()).toBe(true);
  expect(mobileDevice()).toBe("phone");
  vi.stubGlobal("window", { innerWidth: 390 });
  vi.stubGlobal("navigator", { userAgent: "Macintosh", maxTouchPoints: 5 });
  expect(isIOS()).toBe(true);
  expect(mobileDevice()).toBe("pad");
  vi.stubGlobal("navigator", { userAgent: "Macintosh", maxTouchPoints: 0 });
  expect(isIOS()).toBe(false);
});

test("iOS uses its native bridge while Android retains its existing playback command", async () => {
  vi.mocked(invoke).mockResolvedValue({});
  vi.stubGlobal("navigator", { userAgent: "iPad", maxTouchPoints: 5 });
  await mobileCommand("seek", { positionMs: 200 });
  expect(invoke).toHaveBeenLastCalledWith("ios_native", { payload: { action: "seek", positionMs: 200 } });
  vi.stubGlobal("navigator", { userAgent: "Android", maxTouchPoints: 5 });
  await mobileCommand("seek", { positionMs: 200 });
  expect(invoke).toHaveBeenLastCalledWith("android_playback", { payload: { action: "seek", positionMs: 200 } });
});
