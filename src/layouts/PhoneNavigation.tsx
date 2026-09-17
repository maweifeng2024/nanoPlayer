import { FolderCog, Heart, Home, Plus, Settings } from "lucide-react";
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
        aria-current={["songs", "albums", "artists", "library"].includes(page) ? "page" : undefined}
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
  if (!["songs", "albums", "artists", "library"].includes(page)) return null;
  return (
    <nav className="phone-library-tabs" aria-label={t("资料库")}>
      {(
        [
          ["songs", "歌曲"],
          ["albums", "专辑"],
          ["artists", "艺术家"],
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
  const playlists = useNanoStore((state) => state.playlists);
  const setPage = useNanoStore((state) => state.setPage);
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
        {playlists.map((list) => (
          <button key={list.id} onClick={() => setPage("playlist", list.id)}>
            <Heart size={24} />
            <span>
              <strong>{list.name}</strong>
              <small>{t("{0} 首", list.trackIds.length)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
