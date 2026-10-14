import { useEffect, useRef, useState } from "react";
import { Wifi, X } from "lucide-react";
import { t } from "../i18n";
import { useModalBehavior } from "../useModalBehavior";
import { mobileCommand } from "../platform/mobile";
import { addLibraryRoots, isTauri } from "../tauriBridge";
import { useNanoStore } from "../store";
import { IOSFolderPicker } from "./IOSLibraryDialogs";

interface ReceiverInfo {
  active: boolean;
  address?: string;
  code?: string;
  qr?: string;
  uploaded?: number;
  uri?: string;
}

export function WifiTransfer({ onImported }: { onImported?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<ReceiverInfo>({ active: false });
  const [error, setError] = useState("");
  const [target, setTarget] = useState("收件箱");
  const [choosing, setChoosing] = useState(false);
  const alive = useRef(true);
  const modal = useModalBehavior(open, () => setOpen(false));
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (isTauri()) void mobileCommand("wifiStop").catch(() => undefined);
    };
  }, []);
  const importReceived = async (received: ReceiverInfo) => {
    if (!received.uri || !received.uploaded) return;
    const state = useNanoStore.getState();
    state.setScanning(true);
    try {
      const result = await addLibraryRoots([received.uri]);
      state.replaceLibrary(result.roots, result.tracks, result.issues);
      onImported?.();
    } finally { state.setScanning(false); }
  };
  useEffect(() => {
    if (!open || !isTauri()) return;
    let active = true;
    const timer = window.setInterval(() => {
      void mobileCommand<ReceiverInfo>("wifiStatus").then((next) => {
        if (!active) return;
        setInfo(next);
      }).catch((cause) => { if (active) setError(String(cause)); });
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
      void mobileCommand<ReceiverInfo>("wifiStop").then(importReceived)
        .catch((cause) => useNanoStore.getState().setNotice(String(cause)));
    };
  }, [open]);
  const start = async () => {
    if (!isTauri()) return setError(t("Wi-Fi 接收需要安装 iOS 应用后使用。"));
    setBusy(true); setError("");
    try {
      await importReceived(await mobileCommand<ReceiverInfo>("wifiStop"));
      const result = await mobileCommand<ReceiverInfo>("wifiStart", { target });
      if (alive.current) setInfo(result);
      else await mobileCommand("wifiStop");
    } catch (cause) { if (alive.current) setError(String(cause)); }
    finally { if (alive.current) setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try {
      const received = await mobileCommand<ReceiverInfo>("wifiStop");
      setInfo({ ...received, active: false });
      await importReceived(received);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  return <>
    <button className="secondary-button" type="button" onClick={() => setOpen(true)}>
      <Wifi size={18} />{t("Wi-Fi 传歌")}
    </button>
    {open && <div className="modal-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section ref={modal} className="app-dialog compact-dialog wifi-transfer" role="dialog" aria-modal="true" aria-labelledby="wifi-title">
        <button className="icon-button" aria-label={t("关闭")} type="button" onClick={() => setOpen(false)}><X /></button>
        <h2 id="wifi-title">{t("Wi-Fi 传歌")}</h2>
        <p>{t("电脑或手机连接同一 Wi-Fi，用浏览器打开接收地址，输入配对码后批量上传音乐。")}</p>
        <p>{t("仅在前台接收；切到后台或关闭此页会停止。音乐复制到应用资料库，源文件不变。请在可信 Wi-Fi 使用，本地 HTTP 传输不加密。")}</p>
        <p>保存到：nanoPlayer / {target || "根目录"}</p>
        <button className="secondary-button" disabled={info.active || busy} onClick={() => setChoosing(true)}>选择接收文件夹</button>
        {info.active && <>
          {info.qr && <img src={info.qr} alt={t("接收地址二维码")} width={180} height={180} />}
          <p>{t("接收地址")}：<strong>{info.address}</strong></p>
          <p>{t("配对码")}：<strong>{info.code}</strong></p>
        </>}
        <p aria-live="polite">{info.active ? t("正在接收") : t("接收已停止")} · {t("已上传 {0} 个文件", info.uploaded ?? 0)}</p>
        {error && <p role="alert">{error}</p>}
        <button className="primary-button" disabled={busy} type="button" onClick={() => void (info.active ? stop() : start())}>
          {busy ? t("处理中…") : info.active ? t("停止接收并入库") : t("开启接收")}
        </button>
      </section>
    </div>}
    {choosing && <IOSFolderPicker initial={target} onClose={() => setChoosing(false)} onChoose={(path) => { setTarget(path); setChoosing(false); }} />}
  </>;
}
