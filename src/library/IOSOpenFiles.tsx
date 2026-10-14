import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../tauriBridge";
import { useNanoStore } from "../store";
import { IOSFolderPicker, IOSLibraryDialog } from "./IOSLibraryDialogs";
import { iosLibraryCommand, summarizeFiles, syncIOSLibrary, type FileResults } from "./iosLibrary";

export function IOSOpenFiles() {
  const [pending, setPending] = useState<{ count: number; names: string[] }>({ count: 0, names: [] });
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState("收件箱");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previous = useRef(0);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      void iosLibraryCommand<{ count: number; names: string[] }>("libraryOpened").then((next) => {
        if (!alive) return;
        setPending(next);
        if (next.count > previous.current) setOpen(true);
        previous.current = next.count;
      }).catch((cause) => { if (alive) setError(String(cause)); });
    };
    check();
    const timer = window.setInterval(check, 4000);
    window.addEventListener("focus", check);
    const opened = listen("ios-open-files", check);
    const failed = listen<string>("ios-open-error", (event) => useNanoStore.getState().setNotice(event.payload));
    return () => {
      alive = false; window.clearInterval(timer); window.removeEventListener("focus", check);
      void opened.then((stop) => stop()); void failed.then((stop) => stop());
    };
  }, []);
  if (!pending.count) return null;
  return <>
    {!open && <button className="ios-pending-import secondary-button" onClick={() => setOpen(true)}>有 {pending.count} 首音乐待保存</button>}
    {open && <IOSLibraryDialog title="保存到 nanoPlayer" onClose={() => { if (!busy) setOpen(false); }}>
      <p>收到 {pending.count} 首音乐：{pending.names.join("、")}</p>
      <p>保存到 nanoPlayer / {target || "根目录"}。复制后加入音乐库，原文件不变。</p>
      <button className="secondary-button" disabled={busy} onClick={() => setChoosing(true)}>选择保存文件夹</button>
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" disabled={busy} onClick={() => {
        setBusy(true); setError("");
        void iosLibraryCommand<FileResults>("librarySaveOpened", { target }).then(async (result) => {
          if (result.uri) await syncIOSLibrary(result.uri);
          useNanoStore.getState().setNotice(summarizeFiles(result));
          const next = await iosLibraryCommand<{ count: number; names: string[] }>("libraryOpened");
          previous.current = next.count; setPending(next); if (!next.count) setOpen(false);
          else setError("部分文件保存失败，待保存内容已保留，可重试。");
        }).catch((cause) => setError(String(cause))).finally(() => setBusy(false));
      }}>{busy ? "正在复制…" : "保存并加入音乐库"}</button>
    </IOSLibraryDialog>}
    {choosing && <IOSFolderPicker initial={target} onClose={() => setChoosing(false)} onChoose={(path) => { setTarget(path); setChoosing(false); }} />}
  </>;
}
