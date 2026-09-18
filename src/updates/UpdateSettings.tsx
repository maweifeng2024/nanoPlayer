import { isAndroid, androidCommand } from "../platform/android";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { t } from "../i18n";
import { formatBytes } from "../domain";
import { isTauri } from "../tauriBridge";
import { useNanoStore } from "../store";
import { checkForUpdates, installUpdate, restartUpdatedApp, useUpdateStore } from "./updater";

export function UpdateNotifier() {
  const phase = useUpdateStore((state) => state.phase);
  const version = useUpdateStore((state) => state.update?.version);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (phase !== "available" && phase !== "ready") return;
    const timer = window.setTimeout(() => setDismissed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [phase]);
  const setPage = useNanoStore((state) => state.setPage);
  useEffect(() => {
    const timer = window.setTimeout(() => void checkForUpdates(), 5000);
    const interval = window.setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, []);
  if (dismissed || (phase !== "available" && phase !== "ready")) return null;
  return (
    <div className="update-notice secondary-button" role="status">
      <button
        className="text-button"
        onClick={() => {
          setDismissed(true);
          setPage("settings");
        }}
      >
        <Download size={14} />
        {phase === "ready" ? t("更新已安装，重启后生效") : t("发现新版本 {0}", version)}
      </button>
      <button className="icon-button" aria-label={t("关闭提示")} onClick={() => setDismissed(true)}>
        <X size={16} />
      </button>
    </div>
  );
}

export function UpdateSettings() {
  const { phase, update, received, total, error } = useUpdateStore();
  const [androidVersion, setAndroidVersion] = useState("");
  useEffect(() => {
    if (isAndroid())
      void androidCommand<{ versionName: string; versionCode: number }>("deviceInfo")
        .then((info) => setAndroidVersion(`${info.versionName} (${info.versionCode})`))
        .catch(() => undefined);
  }, []);
  if (isAndroid())
    return (
      <article>
        <span className="settings-icon">
          <Download />
        </span>
        <div>
          <h3>
            {t("软件更新")} · Android {androidVersion}
          </h3>
          <p>{t("Android 版本通过安装同一签名的新 APK 更新，保留资料库和设置。")}</p>
        </div>
      </article>
    );
  const busy = phase === "checking" || phase === "downloading";
  return (
    <article>
      <span className="settings-icon">
        <Download />
      </span>
      <div>
        <h3>{t("软件更新")}</h3>
        <p>{t("启动时自动检查 GitHub 最新版本，安装由你决定。")}</p>
        <p aria-live="polite">
          {!isTauri()
            ? t("自动更新仅在桌面版可用。")
            : phase === "checking"
              ? t("正在检查更新…")
              : phase === "current"
                ? t("已是最新版本")
                : phase === "available"
                  ? t("发现新版本 {0}", update?.version)
                  : phase === "ready"
                    ? t("更新已安装，重启后生效")
                    : phase === "downloading"
                      ? t(
                          "正在下载更新：{0}",
                          total
                            ? `${Math.min(100, Math.round((received / total) * 100))}%`
                            : formatBytes(received),
                        )
                      : phase === "error"
                        ? t("更新失败，请重试。")
                        : ""}
        </p>
        {error && (
          <details>
            <summary>{t("错误详情")}</summary>
            <p className="update-error">{error}</p>
          </details>
        )}
        {update?.body && (
          <details>
            <summary>{t("更新说明")}</summary>
            <p className="update-notes">{update.body}</p>
          </details>
        )}
      </div>
      <div className="update-actions">
        <button
          className="secondary-button"
          disabled={!isTauri() || busy || phase === "ready"}
          onClick={() => void checkForUpdates()}
        >
          {t("检查更新")}
        </button>
        {update && phase !== "ready" && (
          <button className="primary-button" disabled={busy} onClick={() => void installUpdate()}>
            {t("下载并安装")}
          </button>
        )}
        {phase === "ready" && (
          <button className="primary-button" onClick={() => void restartUpdatedApp()}>
            {t("重启并完成更新")}
          </button>
        )}
      </div>
    </article>
  );
}
