import { open } from "@tauri-apps/plugin-dialog";
import { mobileCommand, isMobile, isIOS } from "../platform/mobile";
import { useNanoStore } from "../store";
import { addLibraryRoots, isTauri } from "../tauriBridge";
import { t } from "../i18n";

let choosing = false;
/** Shared by onboarding and library; independent of page mounting. */
export async function chooseLibraryFolders(mode: "copy" | "reference" = "copy") {
  const state = useNanoStore.getState();
  if (choosing || state.scanning) return;
  if (!isTauri())
    return state.setNotice(t("浏览器预览使用示例资料库；在 Tauri 桌面版中可选择真实文件夹。"));
  choosing = true;
  try {
    const chosen = isMobile()
      ? (await mobileCommand<{ uri?: string }>("pickTree", isIOS() ? { mode } : {})).uri
      : await open({ directory: true, multiple: true, title: t("添加音乐文件夹") });
    const paths = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    if (!paths.length) return;
    useNanoStore.setState({ pendingRootPaths: paths });
    state.setScanning(true);
    const result = await addLibraryRoots(paths);
    state.replaceLibrary(result.roots, result.tracks, result.issues);
  } catch (error) {
    state.setNotice(t(String(error)));
  } finally {
    choosing = false;
    useNanoStore.setState({ pendingRootPaths: [] });
    state.setScanning(false);
  }
}
