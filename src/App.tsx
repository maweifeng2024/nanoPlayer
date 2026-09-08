import { UpdateNotifier } from "./updates/UpdateSettings";
import { AmbientBackground } from "./library/AmbientBackground";
import { t } from "./i18n";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Disc3,
  ChevronLeft,
  Clock3,
  FolderCog,
  FolderSearch,
  Heart,
  Home,
  ListMusic,
  Menu,
  MicVocal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  WifiOff,
  X,
} from "lucide-react";
import { LibraryPage } from "./library/LibraryPage";
import { PlayerBar } from "./player/PlayerBar";
import { ContentPage } from "./library/ContentPage";
import { PlayerDrawer } from "./player/PlayerDrawer";
import { useNanoStore } from "./store";
import { applyNativeUserState, getNativeUserState } from "./store";
import {
  getLibrarySnapshot,
  isTauri,
  rescanLibraryRoot,
  saveUserState,
  setNativeLanguage,
} from "./tauriBridge";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TrackDetails } from "./library/TrackDetails";
import { useModalBehavior } from "./useModalBehavior";

const navigation = [
  { id: "home", label: "首页", icon: Home },
  { id: "library", label: "本地资料库", icon: FolderCog },
  { id: "songs", label: "歌曲", icon: ListMusic },
  { id: "albums", label: "专辑", icon: Disc3 },
  { id: "artists", label: "艺术家", icon: MicVocal },
  { id: "recent", label: "最近添加", icon: Clock3 },
  { id: "popular", label: "播放最多", icon: Sparkles },
  { id: "rated", label: "高评分", icon: Star },
] as const;

const startWindowDrag = (event: MouseEvent<HTMLElement>) => {
  if (
    event.button !== 0 ||
    (event.target as HTMLElement).closest("button, input, label, a, [role='button']")
  )
    return;
  if (isTauri())
    getCurrentWindow()
      .startDragging()
      .catch(() => undefined);
};

export default function App() {
  const {
    page,
    setPage,
    playlists,
    createPlaylist,
    query,
    setQuery,
    drawer,
    roots,
    onboardingDismissed,
    dismissOnboarding,
    replaceLibrary,
    replacePlaylists,
    notice,
    setNotice,
    setScanning,
    setScanProcessed,
    theme,
    selectedTrackId,
    selectedPlaylistId,
  } = useNanoStore(
    useShallow((state) => ({
      page: state.page,
      setPage: state.setPage,
      playlists: state.playlists,
      createPlaylist: state.createPlaylist,
      query: state.query,
      setQuery: state.setQuery,
      drawer: state.drawer,
      roots: state.roots,
      onboardingDismissed: state.onboardingDismissed,
      dismissOnboarding: state.dismissOnboarding,
      replaceLibrary: state.replaceLibrary,
      replacePlaylists: state.replacePlaylists,
      notice: state.notice,
      setNotice: state.setNotice,
      setScanning: state.setScanning,
      setScanProcessed: state.setScanProcessed,
      theme: state.theme,
      selectedTrackId: state.selectedTrackId,
      selectedPlaylistId: state.selectedPlaylistId,
    })),
  );
  const language = useNanoStore((state) => state.language);
  useEffect(() => {
    document.documentElement.lang = language;
    if (isTauri()) void setNativeLanguage(language).catch((error) => setNotice(t(String(error))));
  }, [language, setNotice]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let saveTimer = 0;
    let watchTimer = 0;
    let unlisten: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unsubscribePlaylists: (() => void) | undefined;
    getLibrarySnapshot()
      .then(({ roots, tracks, issues, playlists: nativePlaylists, userState }) => {
        if (!active) return;
        replaceLibrary(roots, tracks, issues);
        applyNativeUserState(userState);
        if (nativePlaylists?.length) replacePlaylists(nativePlaylists);
        unsubscribePlaylists = useNanoStore.subscribe((state, previous) => {
          if (
            state.playlists !== previous.playlists ||
            state.language !== previous.language ||
            state.playCounts !== previous.playCounts
          )
            saveUserState(getNativeUserState()).catch(() => undefined);
        });
        saveTimer = window.setInterval(
          () => saveUserState(getNativeUserState()).catch(() => undefined),
          5000,
        );
        listen("library-changed", () => {
          window.clearTimeout(watchTimer);
          watchTimer = window.setTimeout(async () => {
            try {
              let snapshot;
              for (const root of useNanoStore.getState().roots)
                snapshot = await rescanLibraryRoot(root.id);
              if (snapshot) replaceLibrary(snapshot.roots, snapshot.tracks, snapshot.issues);
            } catch (error) {
              setNotice(t("自动重新扫描失败：{0}", t(String(error))));
            }
          }, 900);
        }).then((dispose) => {
          unlisten = dispose;
        });
        listen<{ processedFiles: number }>("scan-progress", ({ payload }) =>
          setScanProcessed(payload.processedFiles),
        ).then((dispose) => {
          unlistenProgress = dispose;
        });
        if (roots.length) {
          setScanning(true);
          void (async () => {
            try {
              let snapshot;
              for (const root of roots) snapshot = await rescanLibraryRoot(root.id);
              if (snapshot && active)
                replaceLibrary(snapshot.roots, snapshot.tracks, snapshot.issues);
            } catch (error) {
              if (active) setNotice(t("启动差异扫描失败：{0}", t(String(error))));
            } finally {
              if (active) setScanning(false);
            }
          })();
        }
      })
      .catch((error) => setNotice(t(String(error))));
    return () => {
      active = false;
      window.clearInterval(saveTimer);
      window.clearTimeout(watchTimer);
      unlisten?.();
      unlistenProgress?.();
      unsubscribePlaylists?.();
      saveUserState(getNativeUserState()).catch(() => undefined);
    };
  }, [replaceLibrary, replacePlaylists, setNotice, setScanProcessed, setScanning]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.matches('input, textarea, [contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.defaultPrevented || target.closest('[role="dialog"]')) return;
      if (
        !typing &&
        !target.closest("button, summary, a, select, [role='button']") &&
        event.code === "Space"
      ) {
        event.preventDefault();
        useNanoStore.getState().togglePlay();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        useNanoStore.getState().toggleDrawer("lyrics");
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "q") {
        event.preventDefault();
        useNanoStore.getState().toggleDrawer("queue");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        useNanoStore.getState().setPage("library");
        window.setTimeout(
          () => document.querySelector<HTMLButtonElement>("[data-add-folder]")?.click(),
          0,
        );
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setNewPlaylistOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        useNanoStore.getState().setPage("settings");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let dispose: (() => void) | undefined;
    listen<string>("native-menu", ({ payload }) => {
      const state = useNanoStore.getState();
      if (payload === "add-library") {
        state.setPage("library");
        window.setTimeout(
          () => document.querySelector<HTMLButtonElement>("[data-add-folder]")?.click(),
          0,
        );
      }
      if (payload === "new-playlist") setNewPlaylistOpen(true);
      if (payload === "search") searchRef.current?.focus();
      if (payload === "settings") state.setPage("settings");
      if (payload === "play-pause") state.togglePlay();
      if (payload === "toggle-lyrics") state.toggleDrawer("lyrics");
      if (payload === "toggle-queue") state.toggleDrawer("queue");
    }).then((unlisten) => {
      dispose = unlisten;
    });
    return () => dispose?.();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 3600);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "light" : "dark") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const addPlaylist = () => setNewPlaylistOpen(true);

  return (
    <div className={`app-shell ${drawer ? "has-drawer" : ""}`}>
      <AmbientBackground />
      <UpdateNotifier />
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label={t("主导航")}>
        <div className="brand-row" data-tauri-drag-region onMouseDown={startWindowDrag}>
          <div className="brand">
            <span>
              <b>nano</b>Player
            </span>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label={t("关闭导航")}
          >
            <X size={17} />
          </button>
        </div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className="nav-item"
              aria-current={page === id ? "page" : undefined}
              key={id}
              onClick={() => {
                setPage(id);
                setSidebarOpen(false);
              }}
              type="button"
            >
              <Icon aria-hidden="true" size={17} />
              {t(label)}
            </button>
          ))}
        </nav>
        <p className="section-label">{t("歌单")}</p>
        <button className="nav-item" onClick={addPlaylist} type="button">
          <Plus aria-hidden="true" size={17} />
          {t("新建歌单")}
        </button>
        {playlists.map((playlist) => (
          <button
            className="nav-item playlist-nav"
            aria-current={
              page === "playlist" && selectedPlaylistId === playlist.id ? "page" : undefined
            }
            key={playlist.id}
            onClick={() => {
              setPage("playlist", playlist.id);
              setSidebarOpen(false);
            }}
            type="button"
          >
            <Heart aria-hidden="true" size={15} />
            {playlist.name}
          </button>
        ))}
        <div className="sidebar-spacer" />
        <button
          className="nav-item"
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => {
            setPage("settings");
            setSidebarOpen(false);
          }}
          type="button"
        >
          <Settings aria-hidden="true" size={17} />
          {t("设置")}
        </button>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label={t("收起导航")}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <main className="content">
        <header className="topbar" data-tauri-drag-region onMouseDown={startWindowDrag}>
          <button
            className="icon-button menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label={t("打开导航")}
          >
            <Menu size={19} />
          </button>
          <div className="history-controls" aria-label={t("页面导航")}>
            <button
              className="icon-button"
              disabled={page === "home"}
              onClick={() => setPage("home")}
              aria-label={t("返回首页")}
              title={t("返回首页")}
            >
              <ChevronLeft size={22} />
            </button>
          </div>
          <label className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                if (event.target.value.trim() && page !== "songs") setPage("songs");
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                  searchRef.current?.blur();
                }
              }}
              placeholder={t("搜索歌曲、艺术家或专辑")}
              aria-label={t("全局搜索")}
            />
            {query ? (
              <button
                className="icon-button search-clear"
                aria-label={t("清除搜索")}
                title={t("清除搜索")}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                type="button"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd>⌘K</kbd>
            )}
          </label>
        </header>
        <div className="page-scroll">
          {page === "library" || page === "issues" ? (
            <LibraryPage issuesOnly={page === "issues"} />
          ) : (
            <ContentPage />
          )}
        </div>
      </main>
      <PlayerDrawer />
      <PlayerBar />
      {isTauri() && !roots.length && !onboardingDismissed && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="onboarding"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
          >
            <p className="eyebrow">{t("欢迎使用 nanoPlayer")}</p>
            <h1 id="onboarding-title">{t("你的音乐，只属于这台电脑")}</h1>
            <p>{t("选择本地音乐文件夹，nanoPlayer 会建立私有索引并保持源文件只读。")}</p>
            <div className="onboarding-points">
              <span>
                <ShieldCheck />
                {t("不修改、移动或删除音乐")}
              </span>
              <span>
                <FolderSearch />
                {t("支持多目录与增量扫描")}
              </span>
              <span>
                <WifiOff />
                {t("离线可完整使用")}
              </span>
            </div>
            <div className="inline-actions">
              <button
                className="primary-button"
                onClick={() => {
                  dismissOnboarding();
                  setPage("library");
                  window.setTimeout(
                    () => document.querySelector<HTMLButtonElement>("[data-add-folder]")?.click(),
                    0,
                  );
                }}
              >
                {t("选择音乐文件夹")}
              </button>
              <button className="secondary-button" onClick={dismissOnboarding}>
                {t("稍后再说")}
              </button>
            </div>
          </section>
        </div>
      )}
      {newPlaylistOpen ? (
        <PlaylistNameDialog
          onClose={() => setNewPlaylistOpen(false)}
          onCreate={(name) => {
            createPlaylist(name);
            setNewPlaylistOpen(false);
          }}
        />
      ) : null}
      {selectedTrackId !== undefined ? <TrackDetails trackId={selectedTrackId} /> : null}
      {notice && (
        <div className="toast" role="status">
          <span>{t(notice)}</span>
          <button
            className="icon-button"
            aria-label={t("关闭提示")}
            onClick={() => setNotice(undefined)}
          >
            <X size={14} />
          </button>
          {/(播放|音频|输出).*?(失败|错误|不可用)|(?:playback|audio|output).*?(?:failed|error|unavailable)/i.test(
            notice,
          ) ? (
            <button
              className="text-button"
              onClick={() => {
                setPage("settings");
                setSidebarOpen(false);
              }}
              type="button"
            >
              {t("检查音频输出")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PlaylistNameDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState(t("新建歌单"));
  useModalBehavior(true, onClose);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="app-dialog compact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-playlist-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
      >
        <header>
          <h2 id="new-playlist-title">{t("新建歌单")}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("关闭")}>
            <X size={17} />
          </button>
        </header>
        <label>
          {t("歌单名称")}
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
          />
        </label>
        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>
            {t("取消")}
          </button>
          <button className="primary-button" type="submit" disabled={!name.trim()}>
            {t("创建")}
          </button>
        </footer>
      </form>
    </div>
  );
}
