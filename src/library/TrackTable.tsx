import { t } from "../i18n";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListPlus,
  MoreHorizontal,
  Play,
  Square,
  Star,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Track } from "../domain";
import { formatDate, formatDuration } from "../domain";
import { useNanoStore } from "../store";

type SortKey =
  | "title"
  | "artist"
  | "album"
  | "addedAt"
  | "rating"
  | "durationMs"
  | "playCount"
  | "lastPlayedAt";

export function TrackTable({
  tracks,
  playlistId,
  popular = false,
  toolbar,
}: {
  tracks: Track[];
  playlistId?: string;
  popular?: boolean;
  toolbar?: React.ReactNode;
}) {
  const state = useNanoStore(
    useShallow((store) => ({
      ratings: store.ratings,
      playCounts: store.playCounts,
      lastPlayedAt: store.lastPlayedAt,
      playlists: store.playlists,
      currentTrackId: store.currentTrackId,
      playing: store.playing,
      addManyToPlaylist: store.addManyToPlaylist,
      setSelectedTrack: store.setSelectedTrack,
      playTrack: store.playTrack,
      playNext: store.playNext,
      enqueue: store.enqueue,
      addToPlaylist: store.addToPlaylist,
      reorderPlaylist: store.reorderPlaylist,
      rate: store.rate,
      removeFromPlaylist: store.removeFromPlaylist,
    })),
  );
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 } | null>(
    popular ? { key: "lastPlayedAt", direction: -1 } : null,
  );
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ track: Track; x: number; y: number }>();
  const [draggingTrackId, setDraggingTrackId] = useState<number>();
  const [dragTarget, setDragTarget] = useState<{
    trackId: number;
    edge: "before" | "after";
  }>();
  const [orderedTrackId, setOrderedTrackId] = useState<number>();
  const [orderEffect, setOrderEffect] = useState<{ trackId: number; direction: "up" | "down" }>();
  const tableRef = useRef<HTMLDivElement>(null);
  const detailsTimer = useRef<number>(0);
  const orderEffectTimer = useRef<number>(0);
  const sorted = useMemo(
    () =>
      sort && !playlistId
        ? [...tracks].sort((left, right) => {
            let result = 0;
            if (sort.key === "playCount")
              result = (state.playCounts[left.id] ?? 0) - (state.playCounts[right.id] ?? 0);
            else if (sort.key === "lastPlayedAt")
              result = (state.lastPlayedAt[left.id] ?? "").localeCompare(
                state.lastPlayedAt[right.id] ?? "",
              );
            else if (sort.key === "rating")
              result = (state.ratings[left.id] ?? 0) - (state.ratings[right.id] ?? 0);
            else if (sort.key === "durationMs") result = left.durationMs - right.durationMs;
            else
              result = String(left[sort.key] ?? "").localeCompare(
                String(right[sort.key] ?? ""),
                "zh-CN",
                { numeric: true },
              );
            return result * sort.direction || left.id - right.id;
          })
        : tracks,
    [playlistId, sort, state.ratings, state.playCounts, state.lastPlayedAt, tracks],
  );
  const range = useVirtualRows(tableRef, sorted.length, selecting);
  const queueContext = useMemo(() => sorted.map((track) => track.id), [sorted]);

  useEffect(() => {
    const close = () => setContextMenu(undefined);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.clearTimeout(detailsTimer.current);
      window.clearTimeout(orderEffectTimer.current);
    };
  }, []);
  useEffect(() => {
    setSelected(
      (current) => new Set([...current].filter((id) => tracks.some((track) => track.id === id))),
    );
  }, [tracks]);

  const setSortKey = (key: SortKey) =>
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 1 ? -1 : 1 }
        : { key, direction: 1 },
    );
  const toggleSelected = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addSelected = (playlist: string) => {
    state.addManyToPlaylist(playlist, [...selected]);
    setSelected(new Set());
    setSelecting(false);
  };
  const openDetails = (trackId: number) => {
    window.clearTimeout(detailsTimer.current);
    detailsTimer.current = window.setTimeout(() => state.setSelectedTrack(trackId), 500);
  };
  const playOnDoubleClick = (track: Track) => {
    window.clearTimeout(detailsTimer.current);
    if (!selecting) state.playTrack(track.id, queueContext);
  };
  const dropTargetAt = (x: number, y: number) => {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-track-id]");
    const trackId = Number(row?.dataset.trackId);
    if (!row || !Number.isFinite(trackId)) return undefined;
    const bounds = row.getBoundingClientRect();
    return { trackId, edge: y < bounds.top + bounds.height / 2 ? "before" : "after" } as const;
  };
  const moveToDropTarget = (fromTrackId: number, target = dragTarget) => {
    if (!playlistId || !target || fromTrackId === target.trackId) return;
    if (target.edge === "before")
      return state.reorderPlaylist(playlistId, fromTrackId, target.trackId);
    const remaining = sorted.filter((track) => track.id !== fromTrackId);
    const targetIndex = remaining.findIndex((track) => track.id === target.trackId);
    state.reorderPlaylist(
      playlistId,
      fromTrackId,
      remaining[targetIndex + 1]?.id ?? Number.MIN_SAFE_INTEGER,
    );
  };
  const moveWithButton = (trackId: number, direction: "up" | "down", index: number) => {
    if (!playlistId) return;
    if (direction === "up") state.reorderPlaylist(playlistId, trackId, sorted[index - 1].id);
    else state.reorderPlaylist(playlistId, sorted[index + 1].id, trackId);
    setOrderedTrackId(trackId);
    setOrderEffect({ trackId, direction });
    window.clearTimeout(orderEffectTimer.current);
    orderEffectTimer.current = window.setTimeout(() => setOrderEffect(undefined), 460);
  };
  const menu = (track: Track) => (
    <>
      <button onClick={() => state.playTrack(track.id, queueContext)} type="button">
        {t("立即播放")}
      </button>
      <button onClick={() => state.playNext(track.id)} type="button">
        {t("下一首播放")}
      </button>
      <button onClick={() => state.enqueue(track.id)} type="button">
        {t("添加到队列")}
      </button>
      {state.playlists.map((playlist) => (
        <button
          key={playlist.id}
          onClick={() => state.addToPlaylist(playlist.id, track.id)}
          type="button"
        >
          {t("添加到“")}
          {playlist.name}”
        </button>
      ))}
    </>
  );

  return (
    <>
      <div className="table-toolbar">
        <button
          className="text-button"
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
          }}
          type="button"
        >
          {selecting ? <CheckSquare size={14} /> : <Square size={14} />}
          {selecting ? t("取消选择") : t("批量选择")}
        </button>
        {selecting ? (
          <>
            <span>{t("已选择 {0} 首", selected.size)}</span>
            <button
              className="text-button"
              onClick={() => setSelected(new Set(sorted.map((track) => track.id)))}
              type="button"
            >
              {t("全选")}
            </button>
            <details className="batch-menu">
              <summary className="text-button" aria-label={t("批量添加到歌单")}>
                {t("添加到歌单")}
              </summary>
              <div className="menu-popover">
                {state.playlists.length ? (
                  state.playlists.map((playlist) => (
                    <button
                      disabled={!selected.size}
                      key={playlist.id}
                      onClick={() => addSelected(playlist.id)}
                      type="button"
                    >
                      {playlist.name}
                    </button>
                  ))
                ) : (
                  <span>{t("请先新建歌单")}</span>
                )}
              </div>
            </details>
          </>
        ) : (
          <span>
            {playlistId
              ? t("拖动左侧手柄自由排序 · {0} 首", tracks.length)
              : tracks.length > 200
                ? t("窗口化渲染 · {0} 首", tracks.length)
                : t("{0} 首", tracks.length)}
          </span>
        )}
        {toolbar}
      </div>
      {!tracks.length && (
        <div className="table-empty">
          <ListPlus size={25} />
          <strong>{t("这里还没有歌曲")}</strong>
          <span>
            {toolbar
              ? t("调整筛选条件或添加音乐文件夹。")
              : popular
                ? t("完整播放一首歌后，它会出现在这里。")
                : t("从“歌曲”页面的更多菜单添加。")}
          </span>
        </div>
      )}
      <div
        hidden={!tracks.length}
        ref={tableRef}
        className={`track-table ${popular ? "popular-table" : ""}`}
        role="table"
        aria-label={t("歌曲列表")}
      >
        <div className="track-row track-head" role="row">
          <span>#</span>
          <button disabled={Boolean(playlistId)} onClick={() => setSortKey("title")}>
            {t("标题")}
            {sort?.key === "title" ? (sort.direction === 1 ? " ↑" : " ↓") : ""}
          </button>
          <button disabled={Boolean(playlistId)} onClick={() => setSortKey("rating")}>
            {t("评分")}
            {sort?.key === "rating" ? (sort.direction === 1 ? " ↑" : " ↓") : ""}
          </button>
          <button disabled={Boolean(playlistId)} onClick={() => setSortKey("artist")}>
            {t("艺术家")}
            {sort?.key === "artist" ? (sort.direction === 1 ? " ↑" : " ↓") : ""}
          </button>
          <button disabled={Boolean(playlistId)} onClick={() => setSortKey("album")}>
            {t("专辑")}
            {sort?.key === "album" ? (sort.direction === 1 ? " ↑" : " ↓") : ""}
          </button>
          <button
            disabled={Boolean(playlistId)}
            onClick={() => setSortKey(popular ? "lastPlayedAt" : "addedAt")}
          >
            {popular ? t("最后一次播放时间") : t("添加日期")}
            {sort?.key === (popular ? "lastPlayedAt" : "addedAt")
              ? sort.direction === 1
                ? " ↑"
                : " ↓"
              : ""}
          </button>
          {!popular && (
            <button
              className="duration-cell"
              disabled={Boolean(playlistId)}
              onClick={() => setSortKey("durationMs")}
            >
              {t("时长")}
              {sort?.key === "durationMs" ? (sort.direction === 1 ? " ↑" : " ↓") : ""}
            </button>
          )}
          {popular ? (
            <button onClick={() => setSortKey("playCount")}>
              {t("播放次数")}
              {sort?.key === "playCount" ? (sort.direction === 1 ? " ↑" : " ↓") : ""}
            </button>
          ) : (
            <span>{playlistId ? t("排序") : ""}</span>
          )}
          <span />
        </div>
        {range.start > 0 ? (
          <div className="track-spacer" aria-hidden="true" style={{ height: range.start * 58 }} />
        ) : null}
        {sorted.slice(range.start, range.end).map((track, visibleIndex) => {
          const index = range.start + visibleIndex;
          const active = state.currentTrackId === track.id;
          return (
            <div
              className={`track-row ${active ? "is-playing" : ""} ${orderedTrackId === track.id ? "is-order-selected" : ""} ${orderEffect?.trackId === track.id ? `order-moved-${orderEffect.direction}` : ""} ${draggingTrackId !== undefined && dragTarget?.trackId === track.id && draggingTrackId !== track.id ? `is-drag-target-${dragTarget.edge}` : ""}`}
              role="row"
              key={track.id}
              data-track-id={track.id}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ track, x: event.clientX, y: event.clientY });
              }}
              onDragOver={(event) => {
                if (playlistId) {
                  event.preventDefault();
                  setDragTarget(dropTargetAt(event.clientX, event.clientY));
                }
              }}
              onDrop={(event) => {
                moveToDropTarget(Number(event.dataTransfer.getData("text/nanoplayer-track")));
                setDraggingTrackId(undefined);
                setDragTarget(undefined);
              }}
              onDoubleClick={() => playOnDoubleClick(track)}
            >
              <div className="row-leading">
                {playlistId && !selecting ? (
                  <span
                    className="playlist-drag-handle"
                    draggable
                    role="button"
                    tabIndex={0}
                    title={t("拖动调整歌单顺序")}
                    aria-label={t("拖动排序 {0}", track.title)}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDraggingTrackId(track.id);
                      setDragTarget(undefined);
                    }}
                    onPointerMove={(event) => {
                      setDragTarget(dropTargetAt(event.clientX, event.clientY));
                    }}
                    onPointerUp={(event) => {
                      if (draggingTrackId !== undefined)
                        moveToDropTarget(
                          draggingTrackId,
                          dropTargetAt(event.clientX, event.clientY),
                        );
                      setDraggingTrackId(undefined);
                      setDragTarget(undefined);
                    }}
                    onPointerCancel={() => {
                      setDraggingTrackId(undefined);
                      setDragTarget(undefined);
                    }}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/nanoplayer-track", String(track.id));
                      setDraggingTrackId(track.id);
                      setDragTarget(undefined);
                    }}
                    onDragEnd={() => {
                      setDraggingTrackId(undefined);
                      setDragTarget(undefined);
                    }}
                  >
                    <GripVertical size={13} />
                  </span>
                ) : null}
                {selecting ? (
                  <button
                    className="row-play"
                    aria-label={`${selected.has(track.id) ? t("取消选择") : t("选择")} ${track.title}`}
                    onClick={() => toggleSelected(track.id)}
                    type="button"
                  >
                    {selected.has(track.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                ) : (
                  <button
                    className="row-play"
                    aria-label={t("播放 {0}", track.title)}
                    onClick={() => state.playTrack(track.id, queueContext)}
                    type="button"
                  >
                    {active && state.playing ? (
                      <span className="equalizer">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <>
                        <span className="row-index">{index + 1}</span>
                        <Play className="row-play-icon" size={14} fill="currentColor" />
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="track-title">
                <button
                  className="track-title-button"
                  onClick={(event) => {
                    if (event.detail === 1) openDetails(track.id);
                    else window.clearTimeout(detailsTimer.current);
                  }}
                  type="button"
                >
                  <strong>{track.title}</strong>
                  <small>
                    {track.format.toUpperCase()}
                    {t("· 查看详情")}
                  </small>
                </button>
              </div>
              <div className="rating" aria-label={t("{0} 评分", track.title)}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() =>
                      state.rate(track.id, state.ratings[track.id] === value ? 0 : value)
                    }
                    aria-label={t("{0} 星", value)}
                    type="button"
                  >
                    <Star
                      size={13}
                      fill={value <= (state.ratings[track.id] ?? 0) ? "currentColor" : "none"}
                    />
                  </button>
                ))}
              </div>
              <span className="artist-cell">{track.artist}</span>
              <span className="album-cell">{track.album}</span>
              <span className="added-cell">
                {popular
                  ? state.lastPlayedAt[track.id]
                    ? formatDate(state.lastPlayedAt[track.id], true)
                    : "—"
                  : formatDate(track.addedAt)}
              </span>
              {!popular && (
                <span className="duration-cell">{formatDuration(track.durationMs)}</span>
              )}
              {playlistId ? (
                <div className="playlist-order-actions" aria-label={t("{0} 排序", track.title)}>
                  <button
                    disabled={index === 0}
                    onClick={() => moveWithButton(track.id, "up", index)}
                    aria-label={t("上移 {0}", track.title)}
                    title={t("上移")}
                    type="button"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    disabled={index === sorted.length - 1}
                    onClick={() => moveWithButton(track.id, "down", index)}
                    aria-label={t("下移 {0}", track.title)}
                    title={t("下移")}
                    type="button"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              ) : (
                <span>{popular ? (state.playCounts[track.id] ?? 0) : ""}</span>
              )}
              {playlistId ? (
                <button
                  className="icon-button row-more"
                  onClick={() => state.removeFromPlaylist(playlistId, track.id)}
                  aria-label={t("从歌单移除")}
                >
                  <X size={16} />
                </button>
              ) : (
                <details className="more-menu">
                  <summary aria-label={t("{0} 更多操作", track.title)}>
                    <MoreHorizontal size={17} />
                  </summary>
                  <div className="menu-popover">{menu(track)}</div>
                </details>
              )}
            </div>
          );
        })}
        {range.end < sorted.length ? (
          <div
            className="track-spacer"
            aria-hidden="true"
            style={{ height: (sorted.length - range.end) * 58 }}
          />
        ) : null}
      </div>
      {contextMenu ? (
        <div
          className="context-menu menu-popover"
          role="menu"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 210),
            top: Math.min(contextMenu.y, window.innerHeight - 240),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menu(contextMenu.track)}
        </div>
      ) : null}
    </>
  );
}

function useVirtualRows(
  tableRef: React.RefObject<HTMLDivElement | null>,
  count: number,
  layoutKey: boolean,
) {
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 40) });
  useLayoutEffect(() => {
    if (count <= 200) {
      setRange({ start: 0, end: count });
      return;
    }
    const table = tableRef.current;
    const scroller = table?.closest<HTMLElement>(".page-scroll");
    if (!table || !scroller) {
      setRange({ start: 0, end: Math.min(count, 80) });
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const tableRect = table.getBoundingClientRect();
        const scrollRect = scroller.getBoundingClientRect();
        const visibleTop = Math.max(0, scrollRect.top - tableRect.top - 40);
        const start = Math.max(0, Math.floor(visibleTop / 58) - 10);
        const end = Math.min(count, Math.ceil((visibleTop + scroller.clientHeight) / 58) + 10);
        setRange((current) =>
          current.start === start && current.end === end ? current : { start, end },
        );
      });
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [count, layoutKey, tableRef]);
  return range;
}
