import { t } from "../i18n";
import {
  Album as AlbumIcon,
  Archive,
  AudioLines,
  Clock3,
  Disc3,
  Eraser,
  FileJson,
  Filter,
  FolderPlus,
  Headphones,
  ImagePlus,
  Keyboard,
  Mic2,
  Music2,
  Play,
  Plus,
  RotateCcw,
  SearchX,
  Settings2,
  ShieldCheck,
  Sparkles,
  SunMoon,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "../ConfirmDialog";
import { useModalBehavior } from "../useModalBehavior";
import { open } from "@tauri-apps/plugin-dialog";
import { useNanoStore } from "../store";
import type { Track } from "../domain";
import { formatBytes, formatDuration } from "../domain";
import { trackInRoots } from "./folderFilter";
import { UpdateSettings } from "../updates/UpdateSettings";
import { TrackTable } from "./TrackTable";
import { Artwork } from "./Artwork";
import { selectPlaylistCoverTracks } from "./playlistCover";
import {
  clearArtworkCache,
  clearOnlineLyricsCache,
  clearPlaylistCover,
  createDatabaseBackup,
  exportDiagnostics,
  getAudioOutputs,
  getLibrarySnapshot,
  getPlaylistCover,
  getStorageInfo,
  isTauri,
  refreshAudioOutput,
  restoreLatestBackup,
  searchLibrary,
  setPlaylistCover,
} from "../tauriBridge";
import { activeLyricIndex, parseLyrics } from "../lyrics/lrc";

const labels: Record<string, { eyebrow: string; title: string }> = {
  songs: { eyebrow: "全部曲目", title: "歌曲" },
  recent: { eyebrow: "按入库时间", title: "最近添加" },
  played: { eyebrow: "按最后播放时间", title: "最近播放" },
  popular: { eyebrow: "本地播放统计", title: "播放最多" },
  rated: { eyebrow: "4–5 星", title: "高评分" },
  albums: { eyebrow: "按专辑艺术家聚合", title: "专辑" },
  artists: { eyebrow: "本地音乐人", title: "艺术家" },
};

const musicThoughts = [
  ["留一点空白", "音乐响起的时候，不必急着去往哪里。"],
  ["让旋律慢一点", "有些熟悉的声音，值得重新认真听一次。"],
  ["今天也要好好听歌", "把片刻交给音乐，把喧闹留在门外。"],
] as const;

export function ContentPage() {
  const state = useNanoStore(
    useShallow((store) => ({
      query: store.query,
      page: store.page,
      tracks: store.tracks,
      roots: store.roots,
      lastPlayedAt: store.lastPlayedAt,
      playCounts: store.playCounts,
      ratings: store.ratings,
    })),
  );
  const [selectedRootIds, setSelectedRootIds] = useState<number[] | null>(null);
  const selectedRoots = state.roots.filter((root) => selectedRootIds?.includes(root.id));
  const [nativeSearchIds, setNativeSearchIds] = useState<number[] | null>(null);
  useEffect(() => {
    const query = state.query.trim();
    if (!isTauri() || query.length < 3) {
      setNativeSearchIds(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(
      () =>
        searchLibrary(query)
          .then((ids) => {
            if (active) setNativeSearchIds(ids);
          })
          .catch(() => {
            if (active) setNativeSearchIds(null);
          }),
      80,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [state.query]);
  const filtered = useMemo(() => {
    const query = state.query.trim().toLocaleLowerCase();
    const nativeMatches = nativeSearchIds ? new Set(nativeSearchIds) : null;
    let tracks = state.tracks.filter(
      (track) =>
        !query ||
        (nativeMatches
          ? nativeMatches.has(track.id)
          : [track.title, track.artist, track.album, track.genre, track.path].some((field) =>
              field?.toLocaleLowerCase().includes(query),
            )),
    );
    if (state.page === "songs" && selectedRootIds !== null)
      tracks = tracks.filter((track) =>
        trackInRoots(
          track.path,
          state.roots.filter((root) => selectedRootIds.includes(root.id)),
        ),
      );
    if (state.page === "recent")
      tracks = [...tracks].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    if (state.page === "played")
      tracks = tracks
        .filter((track) => state.lastPlayedAt[track.id])
        .sort((a, b) => state.lastPlayedAt[b.id].localeCompare(state.lastPlayedAt[a.id]));
    if (state.page === "popular")
      tracks = tracks
        .filter((track) => (state.playCounts[track.id] ?? 0) > 0)
        .sort((a, b) => (state.playCounts[b.id] ?? 0) - (state.playCounts[a.id] ?? 0));
    if (state.page === "rated")
      tracks = tracks
        .filter((track) => (state.ratings[track.id] ?? 0) >= 4)
        .sort((a, b) => (state.ratings[b.id] ?? 0) - (state.ratings[a.id] ?? 0));
    return tracks;
  }, [
    nativeSearchIds,
    selectedRootIds,
    state.roots,
    state.lastPlayedAt,
    state.page,
    state.playCounts,
    state.query,
    state.ratings,
    state.tracks,
  ]);

  if (state.page === "home") return <HomePage tracks={filtered} />;
  if (state.page === "settings") return <SettingsPage />;
  if (state.page === "playlist") return <PlaylistPage />;
  if (state.page === "now-playing") return <NowPlayingPage />;
  if (state.page === "albums")
    return <CollectionGrid key="albums" kind="album" tracks={filtered} />;
  if (state.page === "artists")
    return <CollectionGrid key="artists" kind="artist" tracks={filtered} />;

  const copy = labels[state.page] ?? labels.songs;
  return (
    <section>
      <PageHeader eyebrow={t(copy.eyebrow)} title={t(copy.title)} count={filtered.length} />
      {state.query && !filtered.length && state.page !== "songs" ? (
        <NoResults />
      ) : (
        <TrackTable
          key={state.page}
          tracks={filtered}
          popular={state.page === "popular"}
          toolbar={
            state.page === "songs" ? (
              <details
                className="folder-filter"
                onKeyDown={(event) => {
                  if (event.key === "Escape") event.currentTarget.open = false;
                }}
              >
                <summary
                  className="text-button"
                  aria-label={t("按文件夹筛选")}
                  title={t("按文件夹筛选")}
                >
                  <Filter size={16} />
                  {selectedRootIds === null ? t("筛选") : t("{0} 个文件夹", selectedRoots.length)}
                </summary>
                <div className="folder-filter-panel">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedRootIds === null}
                      onChange={(event) => setSelectedRootIds(event.target.checked ? null : [])}
                    />
                    {t("所有文件夹")}
                  </label>
                  {state.roots.map((root) => (
                    <label key={root.id}>
                      <input
                        type="checkbox"
                        checked={selectedRootIds === null || selectedRootIds.includes(root.id)}
                        onChange={(event) => {
                          const ids = selectedRootIds ?? state.roots.map((item) => item.id);
                          setSelectedRootIds(
                            event.target.checked
                              ? [...ids, root.id]
                              : ids.filter((id) => id !== root.id),
                          );
                        }}
                      />
                      <span>
                        {root.name}
                        <small>{root.path}</small>
                      </span>
                    </label>
                  ))}
                  {!state.roots.length && <p>{t("尚未添加文件夹")}</p>}
                </div>
              </details>
            ) : undefined
          }
        />
      )}
    </section>
  );
}

function PageHeader({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) {
  return (
    <header className="page-header content-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      {count !== undefined ? <span className="count-label">{t("{0} 首", count)}</span> : null}
    </header>
  );
}

function HomePage({ tracks }: { tracks: Track[] }) {
  const { playTrack, ratings, playCounts, lastPlayedAt } = useNanoStore(
    useShallow((state) => ({
      playTrack: state.playTrack,
      ratings: state.ratings,
      playCounts: state.playCounts,
      lastPlayedAt: state.lastPlayedAt,
    })),
  );
  const [momentSeed] = useState(() => Math.random());
  const featured = tracks[0];
  const recent = [...tracks].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 20);
  const popular = [...tracks]
    .filter((track) => (playCounts[track.id] ?? 0) > 0)
    .sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0))
    .slice(0, 20);
  const rated = [...tracks]
    .filter((track) => (ratings[track.id] ?? 0) >= 4)
    .sort(
      (a, b) =>
        (ratings[b.id] ?? 0) - (ratings[a.id] ?? 0) ||
        a.title.localeCompare(b.title, "zh-CN", { numeric: true }),
    )
    .slice(0, 20);
  if (!featured) return <EmptyLibrary />;
  const moment = (() => {
    const defaultTrack = tracks[Math.floor(momentSeed * tracks.length)] ?? featured;
    const moments: Array<{
      eyebrow: string;
      title: string;
      copy: string;
      action: string;
      track: Track;
    }> = [];
    const lastPlayed = [...tracks]
      .filter((track) => lastPlayedAt[track.id])
      .sort((a, b) => lastPlayedAt[b.id].localeCompare(lastPlayedAt[a.id]))[0];
    if (lastPlayed)
      moments.push({
        eyebrow: t("刚刚听过"),
        title: t("再听一次《{0}》？", lastPlayed.title),
        copy: t("熟悉的旋律还在这里，随时可以接着听。"),
        action: t("继续播放"),
        track: lastPlayed,
      });
    const mostPlayed = popular[0];
    if (mostPlayed)
      moments.push({
        eyebrow: t("你的常听"),
        title: t("《{0}》总会等你回来", mostPlayed.title),
        copy: t("它已经陪你播放了 {0} 次。", playCounts[mostPlayed.id]),
        action: t("再听一次"),
        track: mostPlayed,
      });
    const highestRated = rated[0];
    if (highestRated)
      moments.push({
        eyebrow: t("珍藏的声音"),
        title: t("为《{0}》留一点时间", highestRated.title),
        copy: t("你给了它 {0} 星，今天也值得重温。", ratings[highestRated.id]),
        action: t("播放这首"),
        track: highestRated,
      });
    const artistScores = new Map<string, number>();
    tracks.forEach((track) =>
      artistScores.set(
        track.artist,
        (artistScores.get(track.artist) ?? 0) +
          (playCounts[track.id] ?? 0) +
          (ratings[track.id] ?? 0),
      ),
    );
    const favoriteArtist = [...artistScores].sort((a, b) => b[1] - a[1])[0];
    const artistTrack = favoriteArtist
      ? tracks.find((track) => track.artist === favoriteArtist[0])
      : undefined;
    if (favoriteArtist && favoriteArtist[1] > 0 && artistTrack)
      moments.push({
        eyebrow: t("常伴左右"),
        title: t("{0}，今天也在这里", favoriteArtist[0]),
        copy: t("从熟悉的声音开始，或许正合适。"),
        action: t("听听看"),
        track: artistTrack,
      });
    musicThoughts.forEach(([title, copy]) =>
      moments.push({
        eyebrow: t("此刻想对你说"),
        title: t(title),
        copy: t(copy),
        action: t("随便听听"),
        track: defaultTrack,
      }),
    );
    return (
      moments[Math.floor(momentSeed * moments.length)] ?? {
        eyebrow: t("今天听点什么"),
        title: t("回到你的音乐"),
        copy: t("本地收藏，私密播放。"),
        action: t("播放资料库"),
        track: defaultTrack,
      }
    );
  })();
  const thoughtIndex = musicThoughts.findIndex(([title]) => t(title) === moment.title);
  const illustration = ["quiet", "slow", "today"][
    thoughtIndex >= 0 ? thoughtIndex : Math.abs(moment.track.id) % 3
  ];
  return (
    <section>
      <div className="hero">
        <Artwork
          track={moment.track}
          className="hero-art"
          fallback={<img src={`/home/${illustration}.svg`} alt="" />}
        />
        <div>
          <p className="eyebrow">{moment.eyebrow}</p>
          <h1>{moment.title}</h1>
          <p className="hero-copy">{moment.copy}</p>
          <button
            className="primary-button hero-play"
            onClick={() =>
              playTrack(
                moment.track.id,
                tracks.map((track) => track.id),
              )
            }
            type="button"
          >
            <Play size={17} fill="currentColor" />
            {moment.action}
          </button>
        </div>
      </div>
      <div className="home-track-columns" aria-label={t("首页歌曲推荐")}>
        <HomeTrackList
          icon={<Clock3 />}
          kicker="NEW IN LIBRARY"
          title={t("最近添加")}
          page="recent"
          tracks={recent}
          tone="recent"
        />
        <HomeTrackList
          icon={<Headphones />}
          kicker="MOST PLAYED"
          title={t("播放最多")}
          page="popular"
          tracks={popular}
          tone="popular"
        />
        <HomeTrackList
          icon={<Sparkles />}
          kicker="YOUR FAVORITES"
          title={t("高评分")}
          page="rated"
          tracks={rated}
          tone="rated"
        />
      </div>
    </section>
  );
}

function HomeTrackList({
  title,
  icon,
  kicker,
  page,
  tracks,
  tone,
}: {
  title: string;
  icon: ReactNode;
  kicker: string;
  page: "recent" | "popular" | "rated";
  tracks: Track[];
  tone: "recent" | "popular" | "rated";
}) {
  const { playTrack, setPage } = useNanoStore(
    useShallow((state) => ({ playTrack: state.playTrack, setPage: state.setPage })),
  );
  const queue = tracks.map((track) => track.id);
  return (
    <section className={`home-track-list home-track-list-${tone}`} aria-label={title}>
      <button className="home-track-list-heading" onClick={() => setPage(page)} type="button">
        <span className="home-track-heading-icon">{icon}</span>
        <span className="home-track-heading-copy">
          <small>{kicker}</small>
          <strong>{title}</strong>
        </span>
        <span className="home-track-heading-link">{t("查看全部 ›")}</span>
      </button>
      <div className="home-track-list-body">
        {tracks.length ? (
          <ol>
            {tracks.map((track) => (
              <li key={track.id}>
                <button onClick={() => playTrack(track.id, queue)} type="button">
                  <span>{track.title}</span>
                  <Play className="home-track-play" size={13} fill="currentColor" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="home-track-empty">{t("暂无歌曲")}</p>
        )}
      </div>
    </section>
  );
}

function EmptyLibrary() {
  const setPage = useNanoStore((state) => state.setPage);
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FolderPlus size={28} />
      </span>
      <h2>{t("资料库还是空的")}</h2>
      <p>{t("添加一个本地音乐目录即可开始。")}</p>
      <button className="primary-button" onClick={() => setPage("library")} type="button">
        {t("前往本地资料库")}
      </button>
    </div>
  );
}

function NoResults() {
  return (
    <div className="empty-state compact">
      <span className="empty-icon">
        <SearchX size={27} />
      </span>
      <h2>{t("没有匹配结果")}</h2>
      <p>{t("试试曲名、艺术家、专辑或流派。")}</p>
    </div>
  );
}

function NowPlayingPage() {
  const state = useNanoStore();
  const track = state.tracks.find((item) => item.id === state.currentTrackId);
  if (!track)
    return (
      <div className="empty-state">
        <span className="empty-icon">
          <Headphones size={28} />
        </span>
        <h2>{t("尚未播放")}</h2>
        <p>{t("从资料库选择一首歌，封面和歌词会在这里展示。")}</p>
        <button className="primary-button" onClick={() => state.setPage("songs")}>
          {t("浏览歌曲")}
        </button>
      </div>
    );
  const parsed = parseLyrics(track.lyrics);
  const active = activeLyricIndex(parsed.lines, state.progressMs);
  const start = Math.max(0, active - 2);
  const lyrics = parsed.lines.slice(start, Math.max(8, active + 6));
  return (
    <section className="now-playing-page">
      <Artwork
        className="now-playing-art"
        track={track}
        fallback={<img src="/nanoplayer-app-icon.png" alt="" />}
      />
      <div className="now-playing-copy">
        <p className="eyebrow">
          {t("正在播放 ·")}
          {track.format}
        </p>
        <h1>{track.title}</h1>
        <h2>
          {track.artist} · {track.album}
        </h2>
        <div className="immersive-lyrics">
          {lyrics.length ? (
            lyrics.map((line, index) => {
              const originalIndex = start + index;
              return (
                <button
                  className={originalIndex === active ? "active" : ""}
                  disabled={line.at === null}
                  onClick={() => line.at !== null && state.setProgress(line.at)}
                  key={`${line.at}-${index}`}
                >
                  {line.text}
                </button>
              );
            })
          ) : (
            <p>{t("暂无歌词，可在右侧歌词抽屉查找本地或在线匹配。")}</p>
          )}
        </div>
        <button className="secondary-button" onClick={() => state.toggleDrawer("lyrics")}>
          <Mic2 size={15} />
          {t("打开歌词抽屉")}
        </button>
      </div>
    </section>
  );
}

function CollectionGrid({ kind, tracks }: { kind: "album" | "artist"; tracks: Track[] }) {
  const [selected, setSelected] = useState<string>();
  const fields = { album: "album", artist: "artist" } as const;
  const fallback = kind === "album" ? t("未知专辑") : t("未知艺术家");
  const groups = useMemo(() => {
    const result = new Map<string, Track[]>();
    for (const track of tracks) {
      const key = track[kind] || fallback;
      const group = result.get(key);
      if (group) group.push(track);
      else result.set(key, [track]);
    }
    return [...result.entries()];
  }, [tracks, kind, fallback]);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridWindow = useCollectionWindow(gridRef, groups.length, selected);

  const title = { album: t("专辑"), artist: t("艺术家") }[kind];
  if (selected) {
    const items = tracks
      .filter((track) => (track[fields[kind]] || fallback) === selected)
      .sort((a, b) =>
        kind === "artist"
          ? a.album.localeCompare(b.album, "zh-CN") ||
            (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
            (a.trackNumber ?? 0) - (b.trackNumber ?? 0)
          : (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
            (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
      );
    const discs = [...new Set(items.map((track) => track.discNumber ?? 1))];
    return (
      <section>
        <button className="text-button collection-back" onClick={() => setSelected(undefined)}>
          {t("← 返回")}
          {title}
        </button>
        <header className={`collection-detail-hero ${kind === "artist" ? "artist-detail" : ""}`}>
          <CollectionPortrait kind={kind} items={items} label={selected} />
          <div>
            <p className="eyebrow">
              {kind === "album"
                ? `${items[0]?.albumArtist || items[0]?.artist} · ${items[0]?.year ?? t("未知年份")}`
                : t(
                    "{0} 张专辑 · {1} 首歌曲",
                    new Set(items.map((track) => track.album)).size,
                    items.length,
                  )}
            </p>
            <h1>{selected}</h1>
            <p>{formatDuration(items.reduce((sum, track) => sum + track.durationMs, 0))}</p>
          </div>
        </header>
        <div className="collection-tracks">
          {kind === "artist" ? (
            <TrackTable tracks={items} />
          ) : discs.length > 1 ? (
            discs.map((disc) => (
              <div className="disc-group" key={disc}>
                <h2>
                  {t("碟")}
                  {disc}
                </h2>
                <TrackTable tracks={items.filter((track) => (track.discNumber ?? 1) === disc)} />
              </div>
            ))
          ) : (
            <TrackTable tracks={items} />
          )}
        </div>
      </section>
    );
  }
  return (
    <section>
      <PageHeader
        eyebrow={labels[`${kind}s`]?.eyebrow ?? t("资料库浏览")}
        title={title}
        count={tracks.length}
      />
      <div className="collection-grid" ref={gridRef}>
        {gridWindow.before > 0 && (
          <div
            aria-hidden="true"
            style={{ gridColumn: "1 / -1", height: gridWindow.before - 24 }}
          />
        )}
        {groups.slice(gridWindow.start, gridWindow.end).map(([value, items]) => {
          return (
            <button className="collection-card" onClick={() => setSelected(value)} key={value}>
              {kind === "artist" ? (
                <CollectionPortrait kind="artist" items={items} label={value} grid />
              ) : (
                <Artwork
                  className="collection-art"
                  track={items[0]}
                  fallback={<AlbumIcon size={36} />}
                />
              )}
              <strong>{value}</strong>
              <span>
                {kind === "album"
                  ? `${items[0].albumArtist || items[0].artist} · ${items[0].year ?? t("未知年份")}`
                  : t("{0} 首歌曲", items.length)}
              </span>
            </button>
          );
        })}
        {gridWindow.after > 0 && (
          <div aria-hidden="true" style={{ gridColumn: "1 / -1", height: gridWindow.after - 24 }} />
        )}
      </div>
    </section>
  );
}

function useCollectionWindow(
  ref: React.RefObject<HTMLDivElement | null>,
  count: number,
  selected?: string,
) {
  const [window, setWindow] = useState({ start: 0, end: 30, before: 0, after: 0 });
  useLayoutEffect(() => {
    const grid = ref.current;
    const scroller = grid?.closest<HTMLElement>(".page-scroll");
    if (!grid || !scroller) return;
    const update = () => {
      const columns = Math.max(1, Math.floor((grid.clientWidth + 16) / 166));
      const cardWidth = (grid.clientWidth - (columns - 1) * 16) / columns;
      const rowHeight = cardWidth + 68;
      const top = Math.max(
        0,
        scroller.getBoundingClientRect().top - grid.getBoundingClientRect().top,
      );
      const rows = Math.ceil(count / columns);
      const first = Math.min(Math.max(0, rows - 1), Math.max(0, Math.floor(top / rowHeight) - 2));
      const last = Math.min(rows, Math.ceil((top + scroller.clientHeight) / rowHeight) + 2);
      const next = {
        start: first * columns,
        end: last * columns,
        before: first * rowHeight,
        after: (rows - last) * rowHeight,
      };
      setWindow((current) =>
        Object.keys(next).every(
          (key) => current[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    scroller.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", update);
    };
  }, [ref, count, selected]);
  return window;
}

function CollectionPortrait({
  kind,
  items,
  label,
  grid = false,
}: {
  kind: "album" | "artist";
  items: Track[];
  label: string;
  grid?: boolean;
}) {
  const unique: Track[] = [];
  const albums = new Set<string>();
  for (const track of items) {
    if (!track.hasArtwork || albums.has(track.album)) continue;
    albums.add(track.album);
    unique.push(track);
    if (unique.length === 4) break;
  }
  const className = grid ? "collection-art artist-collage" : "collection-detail-art artist-collage";
  if (kind === "album")
    return (
      <Artwork
        className="collection-detail-art"
        track={items[0]}
        fallback={<AlbumIcon size={44} />}
      />
    );
  return (
    <div className={className}>
      {unique.length ? (
        unique.map((track) => (
          <Artwork track={track} key={`${track.id}-${track.album}`} fallback={label.slice(0, 1)} />
        ))
      ) : (
        <span>{label.slice(0, 1)}</span>
      )}
    </div>
  );
}

function PlaylistPage() {
  const {
    playlists,
    selectedPlaylistId,
    tracks,
    renamePlaylist,
    deletePlaylist,
    playTrack,
    addManyToPlaylist,
    setNotice,
  } = useNanoStore(
    useShallow((state) => ({
      playlists: state.playlists,
      selectedPlaylistId: state.selectedPlaylistId,
      tracks: state.tracks,
      renamePlaylist: state.renamePlaylist,
      deletePlaylist: state.deletePlaylist,
      playTrack: state.playTrack,
      addManyToPlaylist: state.addManyToPlaylist,
      setNotice: state.setNotice,
    })),
  );
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [customCover, setCustomCover] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  useModalBehavior(adding, () => setAdding(false));
  const playlist = playlists.find((item) => item.id === selectedPlaylistId);
  useEffect(() => {
    setCustomCover(undefined);
    if (playlist?.id && isTauri())
      getPlaylistCover(playlist.id)
        .then((value) => setCustomCover(value ?? undefined))
        .catch(() => undefined);
  }, [playlist?.id]);
  if (!playlist) return <NoResults />;
  const items = playlist.trackIds
    .map((id) => tracks.find((track) => track.id === id))
    .filter(Boolean) as Track[];
  const chooseCover = async () => {
    if (!isTauri()) return setNotice(t("自定义歌单图片可在 Tauri 桌面版中选择。"));
    const chosen = await open({
      multiple: false,
      filters: [{ name: t("图片"), extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    if (typeof chosen !== "string") return;
    try {
      setCustomCover(await setPlaylistCover(playlist.id, chosen));
      setNotice(t("歌单图片已复制到应用数据目录。"));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const resetCover = async () => {
    if (isTauri())
      await clearPlaylistCover(playlist.id).catch((error) => setNotice(t(String(error))));
    setCustomCover(undefined);
  };
  const available = tracks.filter(
    (track) =>
      !playlist.trackIds.includes(track.id) &&
      (!query ||
        [track.title, track.artist, track.album].some((value) =>
          value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )),
  );
  return (
    <section>
      <div className="playlist-hero">
        <div className="playlist-cover-wrap">
          <div className="playlist-art">
            {customCover ? (
              <img src={customCover} alt={t("自定义歌单封面")} />
            ) : (
              <AutoPlaylistCover
                key={`${playlist.id}:${playlist.trackIds.join(",")}`}
                items={items}
                name={playlist.name}
                seed={`${playlist.id}:${playlist.trackIds.join(",")}`}
              />
            )}
          </div>
          <div className="cover-actions">
            <button
              className="icon-button"
              onClick={chooseCover}
              aria-label={t("修改歌单图片")}
              title={t("修改歌单图片")}
            >
              <ImagePlus size={16} />
            </button>
            {customCover ? (
              <button
                className="icon-button"
                onClick={resetCover}
                aria-label={t("恢复自动封面")}
                title={t("恢复自动封面")}
              >
                <RotateCcw size={15} />
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <p className="eyebrow">{t("歌单 · {0} 首", items.length)}</p>
          <h1>{playlist.name}</h1>
          <p>{formatDuration(items.reduce((sum, track) => sum + track.durationMs, 0))}</p>
          <div className="inline-actions">
            <button
              className="primary-button"
              disabled={!items.length}
              onClick={() =>
                playTrack(
                  items[0].id,
                  items.map((track) => track.id),
                )
              }
            >
              <Play size={16} fill="currentColor" />
              {t("播放")}
            </button>
            <button className="secondary-button" onClick={() => setAdding(true)}>
              <Plus size={15} />
              {t("添加歌曲")}
            </button>
            <button className="secondary-button" onClick={() => setRenaming(true)}>
              {t("重命名")}
            </button>
            <button
              className="icon-button danger"
              onClick={() => setDeleting(true)}
              aria-label={t("删除歌单")}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      </div>
      <TrackTable tracks={items} playlistId={playlist.id} />
      {renaming ? (
        <NameDialog
          title={t("重命名歌单")}
          initial={playlist.name}
          onClose={() => setRenaming(false)}
          onSave={(name) => {
            renamePlaylist(playlist.id, name);
            setRenaming(false);
          }}
        />
      ) : null}
      {adding ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="app-dialog song-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-songs-title"
          >
            <header>
              <h2 id="add-songs-title">
                {t("添加歌曲到“")}
                {playlist.name}”
              </h2>
              <button
                className="icon-button"
                onClick={() => setAdding(false)}
                aria-label={t("关闭")}
              >
                <X size={17} />
              </button>
            </header>
            <input
              autoFocus
              className="dialog-search"
              placeholder={t("搜索歌曲、艺术家或专辑")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="song-picker-list">
              {available.map((track) => (
                <label key={track.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(track.id)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(track.id)) next.delete(track.id);
                        else next.add(track.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>{track.title}</strong>
                    <small>
                      {track.artist} · {track.album}
                    </small>
                  </span>
                </label>
              ))}
              {!available.length ? <p>{t("没有可添加的歌曲")}</p> : null}
            </div>
            <footer>
              <button className="secondary-button" onClick={() => setAdding(false)}>
                {t("取消")}
              </button>
              <button
                className="primary-button"
                disabled={!selected.size}
                onClick={() => {
                  addManyToPlaylist(playlist.id, [...selected]);
                  setSelected(new Set());
                  setAdding(false);
                }}
              >
                {t("添加 {0} 首", selected.size)}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      <ConfirmDialog
        open={deleting}
        title={t("删除歌单")}
        message={t("删除“{0}”？只会删除歌单记录，音乐文件不会受影响。", playlist.name)}
        confirmLabel={t("删除歌单")}
        danger
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          deletePlaylist(playlist.id);
        }}
      />
    </section>
  );
}

function AutoPlaylistCover({ items, name, seed }: { items: Track[]; name: string; seed: string }) {
  const covers = selectPlaylistCoverTracks(items, seed);
  return (
    <div className={`auto-playlist-cover cover-count-${covers.length}`}>
      {covers.length ? (
        covers.map((track) => (
          <Artwork
            track={track}
            key={`${track.artist}-${track.album}`}
            fallback={<Music2 size={20} />}
          />
        ))
      ) : (
        <span className="playlist-letter">{name.slice(0, 1)}</span>
      )}
    </div>
  );
}
function NameDialog({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  initial: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useModalBehavior(true, onClose);
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="app-dialog compact-dialog"
        role="dialog"
        aria-label={title}
        aria-modal="true"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("关闭")}>
            <X size={17} />
          </button>
        </header>
        <label>
          {t("歌单名称")}
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>
            {t("取消")}
          </button>
          <button className="primary-button" type="submit" disabled={!name.trim()}>
            {t("保存")}
          </button>
        </footer>
      </form>
    </div>
  );
}

function SettingsPage() {
  const language = useNanoStore((state) => state.language);
  const setLanguage = useNanoStore((state) => state.setLanguage);
  const {
    onlineLyrics,
    setOnlineLyrics,
    theme,
    setTheme,
    outputDevice,
    setOutputDevice,
    roots,
    currentTrackId,
    progressMs,
    volume,
    muted,
    playing,
    replaceLibrary,
    setNotice,
  } = useNanoStore(
    useShallow((state) => ({
      onlineLyrics: state.onlineLyrics,
      setOnlineLyrics: state.setOnlineLyrics,
      theme: state.theme,
      setTheme: state.setTheme,
      outputDevice: state.outputDevice,
      setOutputDevice: state.setOutputDevice,
      roots: state.roots,
      currentTrackId: state.currentTrackId,
      progressMs: state.progressMs,
      volume: state.volume,
      muted: state.muted,
      playing: state.playing,
      replaceLibrary: state.replaceLibrary,
      setNotice: state.setNotice,
    })),
  );
  const [storage, setStorage] = useState<{ path: string; sizeBytes: number }>();
  const [outputs, setOutputs] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  useEffect(() => {
    if (isTauri())
      getStorageInfo()
        .then(setStorage)
        .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (isTauri())
      getAudioOutputs()
        .then(setOutputs)
        .catch(() => undefined);
  }, []);
  const backup = async () => {
    if (!isTauri()) return setNotice(t("数据库备份仅在桌面版可用。"));
    try {
      const result = await createDatabaseBackup();
      setNotice(t("备份已保存：{0}", result.path));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const restore = async () => {
    if (!isTauri()) return setNotice(t("数据库恢复仅在桌面版可用。"));
    try {
      const result = await restoreLatestBackup();
      replaceLibrary(result.roots, result.tracks, result.issues);
      setNotice(t("数据库已从最新备份恢复。"));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const clearCache = async () => {
    if (!isTauri()) return setNotice(t("缓存管理仅在桌面版可用。"));
    try {
      const count = await clearOnlineLyricsCache();
      const result = await getLibrarySnapshot();
      replaceLibrary(result.roots, result.tracks, result.issues);
      setNotice(t("已清除 {0} 条网络歌词缓存，手动与本地歌词未受影响。", count));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const clearCovers = async () => {
    if (!isTauri()) return setNotice(t("缓存管理仅在桌面版可用。"));
    try {
      const count = await clearArtworkCache();
      const result = await getLibrarySnapshot();
      replaceLibrary(result.roots, result.tracks, result.issues);
      setNotice(t("已清除 {0} 张内嵌封面缓存；下次重新扫描会再次提取。", count));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const reconnectAudio = async () => {
    if (!isTauri()) return setNotice(t("音频输出重连仅在桌面版可用。"));
    try {
      await refreshAudioOutput(
        currentTrackId,
        progressMs,
        muted ? 0 : volume,
        playing,
        outputDevice,
      );
      setNotice(t("已连接{0}音频输出。", outputDevice || t("系统默认")));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const chooseOutput = async (name: string) => {
    const output = name || undefined;
    setOutputDevice(output);
    if (!isTauri()) return;
    try {
      await refreshAudioOutput(currentTrackId, progressMs, muted ? 0 : volume, playing, output);
      setNotice(t("已切换到{0}。", output || t("系统默认")));
    } catch (error) {
      setOutputDevice(outputDevice);
      setNotice(t(String(error)));
    }
  };
  const diagnostics = async () => {
    if (!isTauri()) return setNotice(t("诊断导出仅在桌面版可用。"));
    try {
      const result = await exportDiagnostics();
      setNotice(t("脱敏诊断已导出：{0}", result.path));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  return (
    <section>
      <PageHeader eyebrow={t("本地优先")} title={t("设置")} />
      <div className="settings-list">
        <UpdateSettings />
        <article>
          <span className="settings-icon">
            <Settings2 />
          </span>
          <div>
            <strong>{t("界面语言")}</strong>
            <p>{t("选择中文或英文，立即应用并自动保存。")}</p>
          </div>
          <select
            aria-label={t("界面语言")}
            value={language}
            onChange={(event) => setLanguage(event.target.value as "zh-CN" | "en")}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </article>
        <article>
          <span className="settings-icon">
            <Disc3 />
          </span>
          <div>
            <strong>{t("播放计数")}</strong>
            <p>{t("完整自然播放结束后计为一次；跳过或拖动进度不计次。")}</p>
          </div>
        </article>
        <article>
          <span className="settings-icon">
            <ShieldCheck />
          </span>
          <div>
            <strong>{t("源文件只读")}</strong>
            <p>
              {t("nanoPlayer 没有修改标签、移动或删除音乐的命令。")}{" "}
              {t("已授权目录：{0}", roots.length)}
            </p>
          </div>
          <span className="setting-status">{t("已启用")}</span>
        </article>
        <article>
          <span className="settings-icon">
            <Settings2 />
          </span>
          <div>
            <strong>{t("在线歌词")}</strong>
            <p>
              {t(
                "开启后，匹配时会向 LRCLIB 发送标题、艺术家、专辑与时长。结果仅缓存到应用数据库。",
              )}
            </p>
          </div>
          <button
            className={`switch ${onlineLyrics ? "on" : ""}`}
            role="switch"
            aria-checked={onlineLyrics}
            onClick={() => setOnlineLyrics(!onlineLyrics)}
          >
            <span />
          </button>
        </article>
        <article>
          <span className="settings-icon">
            <SunMoon />
          </span>
          <div>
            <strong>{t("外观")}</strong>
            <p>{t("可跟随系统，或固定使用浅色/深色主题。")}</p>
          </div>
          <div className="segmented" aria-label={t("外观主题")}>
            {(
              [
                ["system", t("跟随系统")],
                ["light", t("浅色")],
                ["dark", t("深色")],
              ] as const
            ).map(([value, label]) => (
              <button
                className={theme === value ? "active" : ""}
                onClick={() => setTheme(value)}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>
        </article>
        <article>
          <span className="settings-icon">
            <Keyboard />
          </span>
          <div>
            <strong>{t("快捷键")}</strong>
            <p>
              {t(
                "⌘K 搜索 · Space 播放/暂停 · ⌘O 添加目录 · ⌘N 新建歌单 · ⌘L 歌词 · ⌘⇧Q 队列 · ⌘, 设置",
              )}
            </p>
          </div>
          <span className="setting-status">{t("已启用")}</span>
        </article>
        <article>
          <span className="settings-icon">
            <Disc3 />
          </span>
          <div>
            <strong>{t("播放恢复")}</strong>
            <p>{t("队列、位置、评分和歌单同步到 SQLite；重启后恢复但不自动发声。")}</p>
          </div>
          <span className="setting-status">{t("默认")}</span>
        </article>
        <article>
          <span className="settings-icon">
            <AudioLines />
          </span>
          <div>
            <strong>{t("音频输出")}</strong>
            <p>{t("切换设备时保留当前曲目、进度、音量和暂停状态。")}</p>
          </div>
          <div className="output-picker">
            <select
              aria-label={t("音频输出设备")}
              value={outputDevice ?? ""}
              onChange={(event) => chooseOutput(event.target.value)}
            >
              <option value="">{t("系统默认")}</option>
              {outputs.map((output) => (
                <option value={output.name} key={output.name}>
                  {output.name}
                  {output.isDefault ? t("（默认）") : ""}
                </option>
              ))}
            </select>
            <button className="secondary-button" onClick={reconnectAudio} type="button">
              {t("重新连接")}
            </button>
          </div>
        </article>
        <article>
          <span className="settings-icon">
            <Archive />
          </span>
          <div>
            <strong>{t("数据库备份")}</strong>
            <p>
              {storage
                ? `${formatBytes(storage.sizeBytes)} · ${storage.path}`
                : t("创建一份一致性 SQLite 备份，仅保存到应用数据目录。")}
            </p>
          </div>
          <button className="secondary-button" onClick={backup} type="button">
            {t("立即备份")}
          </button>
        </article>
        <article>
          <span className="settings-icon">
            <RotateCcw />
          </span>
          <div>
            <strong>{t("从最新备份恢复")}</strong>
            <p>{t("恢复前验证 SQLite 完整性；此操作不会访问或修改音乐目录。")}</p>
          </div>
          <button
            className="secondary-button"
            onClick={() => setRestoreConfirm(true)}
            type="button"
          >
            {t("恢复")}
          </button>
        </article>
        <article>
          <span className="settings-icon">
            <Eraser />
          </span>
          <div>
            <strong>{t("清除网络歌词缓存")}</strong>
            <p>{t("仅清除 LRCLIB 结果，不会删除手动歌词、同目录 LRC 或任何音乐文件。")}</p>
          </div>
          <button className="secondary-button" onClick={clearCache} type="button">
            {t("清除缓存")}
          </button>
        </article>
        <article>
          <span className="settings-icon">
            <Eraser />
          </span>
          <div>
            <strong>{t("清除封面缓存")}</strong>
            <p>{t("仅删除应用数据库中的封面副本，不会修改音乐文件。")}</p>
          </div>
          <button className="secondary-button" onClick={clearCovers} type="button">
            {t("清除封面")}
          </button>
        </article>
        <article>
          <span className="settings-icon">
            <FileJson />
          </span>
          <div>
            <strong>{t("导出脱敏诊断")}</strong>
            <p>
              {t(
                "仅包含版本、平台、计数、问题分类和 SQLite 完整性；不包含路径、文件名、曲名或歌词。",
              )}
            </p>
          </div>
          <button className="secondary-button" onClick={diagnostics} type="button">
            {t("导出诊断")}
          </button>
        </article>
      </div>
      <ConfirmDialog
        open={restoreConfirm}
        title={t("从最新备份恢复")}
        message={t("将用最新备份覆盖当前应用数据。音乐源文件不会受影响。")}
        confirmLabel={t("确认恢复")}
        onClose={() => setRestoreConfirm(false)}
        onConfirm={async () => {
          setRestoreConfirm(false);
          await restore();
        }}
      />
    </section>
  );
}
