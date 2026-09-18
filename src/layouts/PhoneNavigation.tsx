import { useState, useMemo } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { useModalBehavior } from "../useModalBehavior";
import { Artwork } from "../library/Artwork";
import { FolderCog, Heart, Home, Plus, Settings, Play, Pencil, Trash2 } from "lucide-react";
import { t } from "../i18n";
import { useNanoStore } from "../store";

export function PhoneNavigation() {
  const page = useNanoStore((state) => state.page);
  const setPage = useNanoStore((state) => state.setPage);
  return (
    <nav className="phone-navigation" aria-label={t("主导航")}>
      <button aria-current={page === "home" ? "page" : undefined} onClick={() => setPage("home")}>
        <Home />
        {t("首页")}
      </button>
      <button
        aria-current={
          ["songs", "albums", "artists", "recent", "popular", "rated", "library"].includes(page)
            ? "page"
            : undefined
        }
        onClick={() => setPage("songs")}
      >
        <FolderCog />
        {t("资料库")}
      </button>
      <button
        aria-current={["playlists", "playlist"].includes(page) ? "page" : undefined}
        onClick={() => setPage("playlists")}
      >
        <Heart />
        {t("歌单")}
      </button>
    </nav>
  );
}
export function PhoneLibraryTabs() {
  const page = useNanoStore((state) => state.page);
  const setPage = useNanoStore((state) => state.setPage);
  if (!["songs", "albums", "artists", "recent", "popular", "rated", "library"].includes(page))
    return null;
  return (
    <nav className="phone-library-tabs" aria-label={t("资料库")}>
      {(
        [
          ["songs", "歌曲"],
          ["albums", "专辑"],
          ["artists", "艺术家"],
          ["recent", "最近添加"],
          ["popular", "播放最多"],
          ["rated", "高评分"],
          ["library", "本地资料库"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          aria-current={page === id ? "page" : undefined}
          onClick={() => setPage(id)}
        >
          {t(label)}
        </button>
      ))}
    </nav>
  );
}
export function PhoneSettingsButton() {
  const setPage = useNanoStore((state) => state.setPage);
  return (
    <button
      className="phone-settings icon-button"
      aria-label={t("设置")}
      onClick={() => setPage("settings")}
    >
      <Settings size={20} />
    </button>
  );
}
export function PhonePlaylists({ onCreate }: { onCreate: () => void }) {
  const tracks = useNanoStore((state) => state.tracks);
  const playlists = useNanoStore((state) => state.playlists);
  const setPage = useNanoStore((state) => state.setPage);
  const playTrack = useNanoStore((state) => state.playTrack);
  const renamePlaylist = useNanoStore((state) => state.renamePlaylist);
  const deletePlaylist = useNanoStore((state) => state.deletePlaylist);
  const [deleting, setDeleting] = useState<string>();
  const [renaming, setRenaming] = useState<string>();
  const [name, setName] = useState("");
  useModalBehavior(Boolean(renaming), () => setRenaming(undefined));
  const trackMap = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  return (
    <section>
      <header className="page-header">
        <h1>{t("歌单")}</h1>
        <button className="secondary-button" onClick={onCreate}>
          <Plus size={20} />
          {t("新建歌单")}
        </button>
      </header>
      <div className="phone-playlists">
        {playlists.map((list) => {
          const ids = list.trackIds.filter((id) => trackMap.has(id));
          return (
            <article className="playlist-list-row" key={list.id}>
              <button className="playlist-open" onClick={() => setPage("playlist", list.id)}>
                <Artwork
                  className="playlist-list-art"
                  track={trackMap.get(ids[0])}
                  fallback={<Heart size={28} />}
                />
                <span>
                  <strong>{list.name}</strong>
                  <small>{t("{0} 首", ids.length)}</small>
                </span>
              </button>
              <div className="playlist-list-actions">
                <button
                  className="icon-button"
                  disabled={!ids.length}
                  aria-label={t("播放 {0}", list.name)}
                  onClick={() => playTrack(ids[0], ids)}
                >
                  <Play size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t("重命名 {0}", list.name)}
                  onClick={() => {
                    setName(list.name);
                    setRenaming(list.id);
                  }}
                >
                  <Pencil size={18} />
                </button>
                <button
                  className="icon-button danger"
                  aria-label={t("删除 {0}", list.name)}
                  onClick={() => setDeleting(list.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t("删除歌单")}
        message={t(
          "删除“{0}”？只会删除歌单记录，音乐文件不会受影响。",
          playlists.find((list) => list.id === deleting)?.name ?? "",
        )}
        confirmLabel={t("删除歌单")}
        danger
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) deletePlaylist(deleting);
          setDeleting(undefined);
        }}
      />
      {renaming && (
        <div className="modal-backdrop">
          <form
            className="app-dialog compact-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("重命名歌单")}
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                renamePlaylist(renaming, name.trim());
                setRenaming(undefined);
              }
            }}
          >
            <h2>{t("重命名歌单")}</h2>
            <label>
              {t("歌单名称")}
              <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <footer>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setRenaming(undefined)}
              >
                {t("取消")}
              </button>
              <button className="primary-button" disabled={!name.trim()}>
                {t("保存")}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
