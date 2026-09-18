import { Artwork } from "../library/Artwork";
import { isAndroid, androidCommand } from "../platform/android";
import { t } from "../i18n";
import {
  ChevronUp,
  ChevronDown,
  FileText,
  GripVertical,
  ListMusic,
  Mic2,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { LyricsCandidate, LyricsSearchInput } from "../domain";
import { useNanoStore } from "../store";
import {
  chooseOnlineLyrics,
  clearTrackManualLyrics,
  clearTrackOnlineLyrics,
  importManualLyrics,
  isTauri,
  searchOnlineLyrics,
} from "../tauriBridge";
import { activeLyricIndex, parseLyrics } from "../lyrics/lrc";

export function PlayerDrawer() {
  const state = useNanoStore(
    useShallow((store) => ({
      drawer: store.drawer,
      tracks: store.tracks,
      currentTrackId: store.currentTrackId,
      queue: store.queue,
      toggleDrawer: store.toggleDrawer,
      clearQueue: store.clearQueue,
      reorderQueue: store.reorderQueue,
      playTrack: store.playTrack,
      removeFromQueue: store.removeFromQueue,
    })),
  );
  const [menu, setMenu] = useState<{ index: number; x: number; y: number }>();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = () => setMenu(undefined);
    window.addEventListener("pointerdown", close);

    return () => {
      window.removeEventListener("pointerdown", close);
    };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      event.preventDefault();
      setMenu(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(event);
    };
    window.addEventListener("android-back", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("android-back", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);
  useEffect(() => setMenu(undefined), [state.queue, state.drawer]);
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const element = menuRef.current;
    element.style.top =
      Math.max(8, Math.min(menu.y, innerHeight - element.offsetHeight - 8)) + "px";
  }, [menu]);
  const trackMap = useMemo(
    () => new Map(state.tracks.map((track) => [track.id, track])),
    [state.tracks],
  );
  const queueListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.drawer !== "queue") return;
    const list = queueListRef.current;
    const active = list?.querySelector<HTMLElement>(".queue-item.active");
    if (list && active) {
      list.scrollTop +=
        active.getBoundingClientRect().top -
        list.getBoundingClientRect().top -
        (list.clientHeight - active.clientHeight) / 2;
    }
  }, [state.drawer, state.currentTrackId, state.queue, state.tracks]);
  if (!state.drawer) return null;
  const track = state.tracks.find((item) => item.id === state.currentTrackId);
  const queueTracks = state.queue.map((id) => trackMap.get(id)).filter(Boolean);
  return (
    <aside
      className="player-drawer"
      aria-label={state.drawer === "queue" ? t("播放队列") : t("歌词")}
    >
      <header>
        <div>
          {state.drawer === "queue" ? <ListMusic size={18} /> : <Mic2 size={18} />}
          <strong>{state.drawer === "queue" ? t("播放队列") : t("歌词")}</strong>
        </div>
        <button
          className="icon-button"
          onClick={() => state.toggleDrawer(state.drawer!)}
          aria-label={t("关闭")}
        >
          <X size={17} />
        </button>
      </header>
      {menu && (
        <div
          ref={menuRef}
          className="context-menu menu-popover queue-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setMenu(undefined)}
        >
          <button
            disabled={menu.index === 0}
            onClick={() => state.reorderQueue(menu.index, menu.index - 1)}
          >
            <ChevronUp size={16} />
            {t("上移")}
          </button>
          <button
            disabled={menu.index === state.queue.length - 1}
            onClick={() => state.reorderQueue(menu.index, menu.index + 1)}
          >
            <ChevronDown size={16} />
            {t("下移")}
          </button>
          <button onClick={() => state.removeFromQueue(menu.index)}>
            <Trash2 size={16} />
            {t("移除")}
          </button>
        </div>
      )}
      {state.drawer === "queue" ? (
        <>
          <div className="drawer-subhead">
            <span>
              {queueTracks.length}
              {t("首 · 可拖动排序")}
            </span>
            <button className="text-button" onClick={state.clearQueue}>
              <Trash2 size={13} />
              {t("清空待播")}
            </button>
          </div>
          <div className="queue-list" ref={queueListRef}>
            {queueTracks.map(
              (item, index) =>
                item && (
                  <div
                    className={`queue-item ${item.id === state.currentTrackId ? "active" : ""}`}
                    key={`${item.id}-${index}`}
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData("text/nanoplayer-queue-index", String(index))
                    }
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) =>
                      state.reorderQueue(
                        Number(event.dataTransfer.getData("text/nanoplayer-queue-index")),
                        index,
                      )
                    }
                  >
                    <GripVertical size={14} className="drag-handle" />
                    <button className="queue-play" onClick={() => state.playTrack(item.id)}>
                      <Artwork className="queue-cover" track={item} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.artist} · {item.album}
                        </small>
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t("{0} 更多操作", item.title)}
                      onClick={(event) => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setMenu({ index, x: Math.max(8, bounds.right - 200), y: bounds.bottom });
                      }}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                ),
            )}
          </div>
        </>
      ) : (
        <Lyrics track={track} />
      )}
    </aside>
  );
}

function Lyrics({ track }: { track?: ReturnType<typeof useNanoStore.getState>["tracks"][number] }) {
  const { progressMs, onlineLyrics, replaceLibrary, setNotice } = useNanoStore(
    useShallow((state) => ({
      progressMs: state.progressMs,
      onlineLyrics: state.onlineLyrics,
      replaceLibrary: state.replaceLibrary,
      setNotice: state.setNotice,
    })),
  );
  const [candidates, setCandidates] = useState<LyricsCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchInput, setSearchInput] = useState<LyricsSearchInput>({
    title: track?.title ?? "",
    artist: track?.artist ?? "",
    album: track?.album ?? "",
  });
  const activeLine = useRef<HTMLButtonElement>(null);
  const parsed = parseLyrics(track?.lyrics);
  const lines = parsed.lines;
  const activeIndex = activeLyricIndex(lines, progressMs);
  useEffect(() => {
    activeLine.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);
  useEffect(() => {
    setSearchInput({
      title: track?.title ?? "",
      artist: track?.artist ?? "",
      album: track?.album ?? "",
    });
    setCandidates([]);
  }, [track?.id, track?.title, track?.artist, track?.album]);
  const search = async () => {
    if (!track || track.id < 0 || !isTauri())
      return setNotice(t("在线歌词匹配仅用于桌面版的真实曲目。"));
    setSearching(true);
    try {
      const results = await searchOnlineLyrics(track.id, searchInput);
      setCandidates(results);
      if (!results.length) setNotice(t("没有找到候选歌词，可以修改歌名或艺术家后重试。"));
    } catch (error) {
      setNotice(t(String(error)));
    } finally {
      setSearching(false);
    }
  };
  const choose = async (candidate: LyricsCandidate) => {
    if (!track) return;
    try {
      const result = await chooseOnlineLyrics(track.id, candidate);
      replaceLibrary(result.roots, result.tracks, result.issues);
      setCandidates([]);
      setNotice(t("歌词已缓存到应用数据库。"));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const removeNetworkLyrics = async () => {
    if (!track) return;
    try {
      const result = await clearTrackOnlineLyrics(track.id);
      replaceLibrary(result.roots, result.tracks, result.issues);
      setNotice(t("已移除这首歌的网络歌词匹配。"));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const chooseLocalLyrics = async () => {
    if (!track || track.id < 0 || !isTauri())
      return setNotice(t("本地歌词选择仅用于桌面版真实曲目。"));
    const chosen = isAndroid()
      ? (await androidCommand<{ path?: string }>("pickFile", { kind: "lyrics" })).path
      : await open({
          multiple: false,
          title: t("为“{0}”选择歌词", track.title),
          filters: [{ name: t("歌词"), extensions: ["lrc", "txt"] }],
        });
    if (typeof chosen !== "string") return;
    try {
      const result = await importManualLyrics(track.id, chosen);
      replaceLibrary(result.roots, result.tracks, result.issues);
      setNotice(t("本地歌词已复制到应用数据库，原文件未修改。"));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  const removeManualLyrics = async () => {
    if (!track) return;
    try {
      const result = await clearTrackManualLyrics(track.id);
      replaceLibrary(result.roots, result.tracks, result.issues);
      setNotice(t("已移除手动指定的歌词，本地原文件未修改。"));
    } catch (error) {
      setNotice(t(String(error)));
    }
  };
  if (!track)
    return (
      <div className="drawer-empty">
        <Mic2 size={24} />
        <p>{t("播放一首歌曲后在这里查看歌词。")}</p>
      </div>
    );
  if (!lines.length)
    return (
      <div className="drawer-empty lyrics-empty">
        <Mic2 size={24} />
        <strong>{track.title}</strong>
        <p>
          {t("未找到本地歌词。")}
          {onlineLyrics
            ? t("可以向 LRCLIB 查找候选结果。")
            : t("在线歌词默认关闭，可在设置中选择开启。")}
        </p>
        {onlineLyrics && (
          <div className="lyrics-search-editor">
            {(["title", "artist", "album"] as const).map((field) => (
              <label key={field}>
                <span>
                  {{ title: t("歌名"), artist: t("艺术家"), album: t("专辑（可选）") }[field]}
                </span>
                <input
                  value={searchInput[field]}
                  onChange={(event) =>
                    setSearchInput((current) => ({ ...current, [field]: event.target.value }))
                  }
                />
              </label>
            ))}
            <button
              className="secondary-button"
              disabled={searching || !searchInput.title.trim()}
              onClick={search}
            >
              {searching ? t("正在多级匹配…") : t("查找在线歌词")}
            </button>
          </div>
        )}
        {isTauri() && track.id > 0 ? (
          <button className="secondary-button" onClick={chooseLocalLyrics}>
            <FileText size={14} />
            {t("选择本地歌词")}
          </button>
        ) : null}
        <LyricsCandidates candidates={candidates} onChoose={choose} />
      </div>
    );
  const sourceLabel =
    { manual: t("手动指定"), embedded: t("内嵌"), sidecar: t("同目录"), lrclib: "LRCLIB" }[
      track.lyricsSource ?? ""
    ] ?? t("本地");
  return (
    <div className="lyrics-panel">
      <div className="lyrics-meta">
        <strong>{track.title}</strong>
        <span>
          {track.artist} · {sourceLabel}
          {parsed.synchronized ? t("同步歌词") : t("纯文本歌词")}
        </span>
        <div className="lyrics-actions">
          {isTauri() && track.id > 0 ? (
            <button className="text-button" onClick={chooseLocalLyrics}>
              {track.lyricsSource === "manual" ? t("替换本地歌词") : t("选择本地歌词")}
            </button>
          ) : null}
          {onlineLyrics && track.id > 0 ? (
            <button className="text-button" onClick={search} disabled={searching}>
              {searching ? t("匹配中…") : t("重新匹配")}
            </button>
          ) : null}
          {track.lyricsSource === "lrclib" ? (
            <button className="text-button" onClick={removeNetworkLyrics}>
              {t("移除此匹配")}
            </button>
          ) : null}
          {track.lyricsSource === "manual" ? (
            <button className="text-button" onClick={removeManualLyrics}>
              {t("移除手动歌词")}
            </button>
          ) : null}
        </div>
      </div>
      <LyricsCandidates candidates={candidates} onChoose={choose} inline />
      {lines.map((line, index) => (
        <button
          ref={index === activeIndex ? activeLine : undefined}
          className={index === activeIndex ? "active" : ""}
          key={`${line.at}-${index}`}
          disabled={line.at === null}
          onClick={() => {
            if (line.at !== null) {
              useNanoStore.getState().seekPlayback(line.at);
              if (isAndroid()) void androidCommand("seek", { positionMs: line.at });
            }
          }}
        >
          {line.text}
        </button>
      ))}
    </div>
  );
}

function LyricsCandidates({
  candidates,
  onChoose,
  inline = false,
}: {
  candidates: LyricsCandidate[];
  onChoose: (candidate: LyricsCandidate) => void;
  inline?: boolean;
}) {
  if (!candidates.length) return null;
  return (
    <div className={`lyrics-candidates${inline ? " inline" : ""}`}>
      {candidates.map((candidate) => {
        const preview = (candidate.syncedLyrics ?? candidate.plainLyrics ?? "")
          .split("\n")
          .map((line) => line.replace(/^\[[^\]]+\]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(" / ");
        return (
          <button key={candidate.id} onClick={() => onChoose(candidate)}>
            <strong>{candidate.trackName}</strong>
            <span>
              {candidate.artistName} · {candidate.albumName || t("未知专辑")}
            </span>
            <span>
              {Math.round(candidate.duration / 60)}:
              {String(Math.round(candidate.duration) % 60).padStart(2, "0")}
              {t(
                " · 相差 {0} 秒 · {1}",
                candidate.durationDifference.toFixed(1),
                candidate.syncedLyrics ? t("同步歌词") : t("纯文本"),
              )}
            </span>
            <span>
              {candidate.matchReason
                ? `${candidate.matchReason
                    .split(" · ")
                    .map((reason) => t(reason))
                    .join(" · ")} · `
                : ""}
              {t("匹配度")}
              {Math.round(candidate.confidence * 100)}%
            </span>
            {preview ? <small>{preview}</small> : null}
          </button>
        );
      })}
    </div>
  );
}
