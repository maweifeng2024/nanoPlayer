import { t } from "../i18n";
import { AlertTriangle, Folder, FolderCheck, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "../ConfirmDialog";
import { formatBytes } from "../domain";
import { useNanoStore } from "../store";
import {
  addLibraryRoots,
  cancelScan,
  isTauri,
  removeLibraryRoot,
  rescanLibraryRoot,
} from "../tauriBridge";

export function LibraryPage({ issuesOnly = false }: { issuesOnly?: boolean }) {
  const [removeTarget, setRemoveTarget] = useState<{ id: number; name: string }>();
  const {
    roots,
    issues,
    scanning,
    scanProcessed,
    replaceLibrary,
    setScanning,
    setNotice,
    setPage,
  } = useNanoStore(
    useShallow((state) => ({
      roots: state.roots,
      issues: state.issues,
      scanning: state.scanning,
      scanProcessed: state.scanProcessed,
      replaceLibrary: state.replaceLibrary,
      setScanning: state.setScanning,
      setNotice: state.setNotice,
      setPage: state.setPage,
    })),
  );
  const chooseFolder = async () => {
    if (!isTauri())
      return setNotice(t("浏览器预览使用示例资料库；在 Tauri 桌面版中可选择真实文件夹。"));
    const chosen = await open({ directory: true, multiple: true, title: t("添加音乐文件夹") });
    const paths = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    if (!paths.length) return;
    setScanning(true);
    try {
      const result = await addLibraryRoots(paths);
      replaceLibrary(result.roots, result.tracks, result.issues);
    } catch (error) {
      setNotice(t(String(error)));
    } finally {
      setScanning(false);
    }
  };
  const rescan = async (id: number) => {
    if (!isTauri()) return setNotice(t("示例资料库无需重新扫描。"));
    setScanning(true);
    try {
      const result = await rescanLibraryRoot(id);
      replaceLibrary(result.roots, result.tracks, result.issues);
    } catch (error) {
      setNotice(t(String(error)));
    } finally {
      setScanning(false);
    }
  };
  const remove = async (id: number) => {
    if (!isTauri()) return setNotice(t("示例资料库会在重新加载后恢复。"));
    try {
      const result = await removeLibraryRoot(id);
      replaceLibrary(result.roots, result.tracks, result.issues);
    } catch (error) {
      setNotice(t(String(error)));
    }
  };

  if (issuesOnly)
    return (
      <section className="library-page" aria-labelledby="issues-title">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t("扫描诊断")}</p>
            <h1 id="issues-title">{t("扫描问题")}</h1>
          </div>
          <button className="secondary-button" onClick={() => setPage("library")} type="button">
            {t("返回资料库")}
          </button>
        </header>
        {!issues.length ? (
          <div className="empty-state compact">
            <span className="empty-icon success">
              <FolderCheck size={28} />
            </span>
            <h2>{t("没有扫描问题")}</h2>
            <p>{t("所有可识别的音频文件都已正常入库。")}</p>
          </div>
        ) : (
          <div className="issue-groups">
            {[...new Set(issues.map((issue) => issue.category))].map((category) => {
              const grouped = issues.filter((issue) => issue.category === category);
              return (
                <section key={category}>
                  <h2>
                    {(
                      {
                        permission: t("无权限"),
                        damaged: t("损坏文件"),
                        unsupported: t("不支持格式"),
                        metadata: t("元数据异常"),
                      } as Record<string, string>
                    )[category] ?? category}{" "}
                    · {grouped.length}
                  </h2>
                  <div className="issue-list">
                    {grouped.map((issue) => (
                      <article className="issue-card" key={issue.id}>
                        <AlertTriangle size={18} />
                        <div>
                          <strong>{issue.detail}</strong>
                          <p>{issue.path}</p>
                        </div>
                        {issue.rootId ? (
                          <button
                            className="secondary-button"
                            onClick={() => rescan(issue.rootId!)}
                            type="button"
                          >
                            {t("重新扫描")}
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    );
  return (
    <section className="library-page" aria-labelledby="library-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("目录与扫描")}</p>
          <h1 id="library-title">{t("本地资料库")}</h1>
        </div>
        {scanning ? (
          <button
            className="secondary-button"
            onClick={() => cancelScan().then(() => setNotice(t("正在取消扫描…")))}
            type="button"
          >
            <X aria-hidden="true" size={16} />
            {t("取消扫描")}
            {scanProcessed ? t(" · {0} 个文件", scanProcessed) : ""}
          </button>
        ) : (
          <button className="primary-button" data-add-folder onClick={chooseFolder} type="button">
            <Plus aria-hidden="true" size={16} />
            {t("添加文件夹")}
          </button>
        )}
      </header>

      {!roots.length ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Folder aria-hidden="true" size={28} />
          </span>
          <h2>{t("添加你的第一个音乐文件夹")}</h2>
          <p>{t("nanoPlayer 只读取你选择的目录，不会修改、移动或删除其中的音乐文件。")}</p>
          <button className="secondary-button" onClick={chooseFolder} type="button">
            <Plus aria-hidden="true" size={16} />
            {t("选择文件夹")}
          </button>
        </div>
      ) : (
        <>
          <div className="root-list">
            {roots.map((root) => (
              <article className="root-card" key={root.id}>
                <div className="root-icon">
                  {root.availability === "available" ? (
                    <FolderCheck size={22} />
                  ) : (
                    <AlertTriangle size={22} />
                  )}
                </div>
                <div className="root-main">
                  <div className="root-title">
                    <strong>{root.name}</strong>
                    <span
                      className={`status-dot ${root.availability !== "available" ? "unavailable" : ""}`}
                    >
                      {root.availability === "available" ? t("可用") : t("不可用")}
                    </span>
                  </div>
                  <p title={root.path}>{root.path}</p>
                  <div className="root-meta">
                    <span>
                      {root.songCount}
                      {t("首歌曲")}
                    </span>
                    <span>{formatBytes(root.sizeBytes)}</span>
                    <span>
                      {t("上次扫描")}
                      {root.lastScannedAt ?? t("尚未扫描")}
                    </span>
                  </div>
                </div>
                <div className="root-actions">
                  <button
                    className="icon-button"
                    onClick={() => rescan(root.id)}
                    aria-label={t("重新扫描 {0}", root.name)}
                    title={t("重新扫描")}
                  >
                    <RefreshCw size={17} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() => setRemoveTarget({ id: root.id, name: root.name })}
                    aria-label={t("移除目录 {0}", root.name)}
                    title={t("仅移除索引")}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="safety-note">
            <FolderCheck size={14} />
            {t("nanoPlayer 不会修改、移动或删除目录中的音乐文件。")}
          </p>
        </>
      )}

      <footer className="scan-status">
        <RefreshCw aria-hidden="true" size={14} />
        {roots.length
          ? t(
              "已索引 {0} 首歌曲",
              roots.reduce((sum, root) => sum + root.songCount, 0),
            )
          : t("尚未扫描")}{" "}
        {t("· 移除目录永远不会删除磁盘文件")}
        <button className="text-button" onClick={() => setPage("issues")} type="button">
          {t("扫描问题")}
          {issues.length ? `(${issues.length})` : ""}
        </button>
      </footer>
      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={t("移除资料库目录")}
        message={t(
          "只会从 nanoPlayer 移除“{0}”的索引，不会删除或修改磁盘上的音乐文件。",
          removeTarget?.name ?? "",
        )}
        confirmLabel={t("移除索引")}
        danger
        onClose={() => setRemoveTarget(undefined)}
        onConfirm={async () => {
          if (!removeTarget) return;
          const target = removeTarget;
          setRemoveTarget(undefined);
          await remove(target.id);
        }}
      />
    </section>
  );
}
