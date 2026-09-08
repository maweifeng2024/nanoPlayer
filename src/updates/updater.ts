import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri, saveUserState } from "../tauriBridge";
import { getNativeUserState, useNanoStore } from "../store";
import { t } from "../i18n";

type Phase = "idle" | "checking" | "available" | "downloading" | "ready" | "current" | "error";
interface UpdateState {
  phase: Phase;
  update: Update | null;
  received: number;
  total?: number;
  error?: string;
}
export const useUpdateStore = create<UpdateState>(() => ({
  phase: "idle",
  update: null,
  received: 0,
}));
let checking: Promise<void> | undefined;
export function checkForUpdates() {
  if (!isTauri()) return Promise.resolve();
  if (checking) return checking;
  if (["downloading", "ready"].includes(useUpdateStore.getState().phase)) return Promise.resolve();
  checking = (async () => {
    useUpdateStore.setState({ phase: "checking", error: undefined });
    try {
      const previous = useUpdateStore.getState().update;
      const update = await check({ timeout: 20000 });
      if (previous) await previous.close().catch(() => undefined);
      useUpdateStore.setState({ phase: update ? "available" : "current", update });
    } catch (error) {
      useUpdateStore.setState({ phase: "error", error: String(error) });
    } finally {
      checking = undefined;
    }
  })();
  return checking;
}
export async function installUpdate() {
  const { update, phase } = useUpdateStore.getState();
  if (!update || phase === "downloading" || phase === "ready") return;
  useUpdateStore.setState({
    phase: "downloading",
    received: 0,
    total: undefined,
    error: undefined,
  });
  try {
    // Windows installers may exit the app immediately, so persist before installing.
    await saveUserState(getNativeUserState());
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") useUpdateStore.setState({ total: event.data.contentLength });
      if (event.event === "Progress")
        useUpdateStore.setState((state) => ({ received: state.received + event.data.chunkLength }));
    });
    useUpdateStore.setState({ phase: "ready" });
  } catch (error) {
    useUpdateStore.setState({ phase: "error", error: String(error) });
  }
}
export async function restartUpdatedApp() {
  try {
    await saveUserState(getNativeUserState());
    await relaunch();
  } catch (error) {
    useNanoStore.getState().setNotice(t("重启失败，请手动退出并重新打开：{0}", String(error)));
  }
}
