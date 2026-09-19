import { useModalBehavior } from "../useModalBehavior";
import { Artwork } from "./Artwork";
import { ConfirmDialog } from "../ConfirmDialog";
import { isAndroid } from "../platform/android";
import { t } from "../i18n";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListPlus,
  MoreHorizontal,
  Music2,
  Square,
  Star,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Track } from "../domain";
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
  const phone = isAndroid();
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
  const [confirmRemoval, setConfirmRemoval] = useState(false);
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
  const contextRef = useModalBehavior(!!contextMenu, () => setContextMenu(undefined), true);
  const selectionAnchor = useRef<number | undefined>(undefined);
  const tableRef = useRef<HTMLDivElement>(null);
  const press = useRef({ timer: 0, x: 0, y: 0, opened: false });
  const cancelPress = () => window.clearTimeout(press.current.timer);
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
      window.clearTimeout(press.current.timer);
      window.clearTimeout(orderEffectTimer.current);
    };
  }, []);
  useEffect(() => {
    setSelected(
      (current) => new Set([...current].filter((id) => tracks.some((track) => track.id === id))),
    );
  }, [tracks]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: Event) => {
      event.preventDefault();
      setContextMenu(undefined);
    };
    window.addEventListener("android-back", close);
    return () => window.removeEventListener("android-back", close);
  }, [contextMenu]);

  useLayoutEffect(() => {
    const menu = contextRef.current;
    if (!menu || !contextMenu) return;
    menu.style.left =
      Math.max(8, Math.min(contextMenu.x, window.innerWidth - menu.offsetWidth - 8)) + "px";
    menu.style.top =
      Math.max(8, Math.min(contextMenu.y, window.innerHeight - menu.offsetHeight - 8)) + "px";
  }, [contextMenu]);

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
  const selectionKeys = (event: React.KeyboardEvent) => {
    if (!selecting || event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setSelecting(false);
      setSelected(new Set());
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelected(new Set(queueContext));
    }
  };
  const menu = (track: Track) => (
    <>
      <button role="menuitem" onClick={() => state.playTrack(track.id, queueContext)} type="button">
        {t("立即播放")}
      </button>
      <button role="menuitem" onClick={() => state.playNext(track.id)} type="button">
        {t("下一首播放")}
      </button>
      <button role="menuitem" onClick={() => state.enqueue(track.id)} type="button">
        {t("添加到队列")}
      </button>
      {
        <>
          <button role="menuitem" type="button" onClick={() => state.setSelectedTrack(track.id)}>
            {t("查看详情")}
          </button>
          <div className="phone-rating" aria-label={t("{0} 评分", track.title)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                role="menuitem"
                key={value}
                aria-label={t("{0} 星", value)}
                onClick={() => state.rate(track.id, state.ratings[track.id] === value ? 0 : value)}
              >
                <Star
                  size={20}
                  fill={value <= (state.ratings[track.id] ?? 0) ? "currentColor" : "none"}
                />
              </button>
            ))}
          </div>
        </>
      }
      {state.playlists.map((playlist) => (
        <button
          role="menuitem"
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
      <div className="table-toolbar" onKeyDown={selectionKeys}>
        <button
          className="text-button"
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
          }}
          type="button"
        >
          {selecting ? <CheckSquare size={14} /> : <Square size={14} />}
          {selecting ? t("取消选择") : t(playlistId ? "编辑" : "批量选择")}
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
            {playlistId && (
              <button
                className="text-button danger"
                disabled={!selected.size}
                onClick={() => setConfirmRemoval(true)}
              >
                {t("从歌单移除")}
              </button>
            )}
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
            {playlistId && !phone
              ? t("拖动左侧手柄自由排序 · {0} 首", tracks.length)
              : tracks.length > 200
                ? t("{0} 首", tracks.length)
                : t("{0} 首", tracks.length)}
          </span>
        )}
        {!playlistId && (
          <label className="track-sort">
            {t("排序")}
            <select
              aria-label={t("排序")}
              value={sort?.key ?? ""}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="" disabled>
                {t("默认")}
              </option>
              {(
                [
                  ["title", "标题"],
                  ["artist", "艺术家"],
                  ["album", "专辑"],
                  ["addedAt", "添加日期"],
                  ["rating", "评分"],
                  ["durationMs", "时长"],
                  ["playCount", "播放次数"],
                  ["lastPlayedAt", "最后一次播放时间"],
                ] as const
              ).map(([key, label]) => (
                <option key={key} value={key}>
                  {t(label)}
                </option>
              ))}
            </select>
            {sort && (
              <button
                className="icon-button"
                aria-label={t("切换排序方向")}
                onClick={() => setSortKey(sort.key)}
              >
                {sort.direction === 1 ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </label>
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
        className={`track-table cover-track-table ${playlistId ? "playlist-table" : ""} ${popular ? "popular-table" : ""}`}
        role="table"
        aria-label={t("歌曲列表")}
      >
        {range.start > 0 ? (
          <div
            className="track-spacer"
            aria-hidden="true"
            style={{ height: range.start * range.rowHeight }}
          />
        ) : null}
        {sorted.slice(range.start, range.end).map((track, visibleIndex) => {
          const index = range.start + visibleIndex;
          const active = state.currentTrackId === track.id;
          return (
            <div
              className={`track-row ${active ? "is-playing" : ""} ${orderedTrackId === track.id ? "is-order-selected" : ""} ${orderEffect?.trackId === track.id ? `order-moved-${orderEffect.direction}` : ""} ${draggingTrackId !== undefined && dragTarget?.trackId === track.id && draggingTrackId !== track.id ? `is-drag-target-${dragTarget.edge}` : ""}`}
              role="row"
              tabIndex={0}
              aria-label={`${track.title} · ${track.artist}`}
              aria-current={active ? "true" : undefined}
              onKeyDown={(event) => {
                selectionKeys(event);
                if (event.defaultPrevented) return;
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (selecting) toggleSelected(track.id);
                  else if (event.key === " " && active) useNanoStore.getState().togglePlay();
                  else state.playTrack(track.id, queueContext);
                }
                if (event.key.toLowerCase() === "m") {
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setContextMenu({ track, x: bounds.right, y: bounds.top });
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const next =
                    event.key === "ArrowDown"
                      ? event.currentTarget.nextElementSibling
                      : event.currentTarget.previousElementSibling;
                  if (next instanceof HTMLElement && next.hasAttribute("data-track-id")) {
                    next.focus({ preventScroll: true });
                    next.scrollIntoView({ block: "nearest" });
                  }
                }
              }}
              key={track.id}
              data-track-id={track.id}
              onPointerDown={(event) => {
                if (
                  !isAndroid() ||
                  event.pointerType === "mouse" ||
                  (event.target as HTMLElement).closest("input, summary, [role=button]")
                )
                  return;
                cancelPress();
                press.current = { timer: 0, x: event.clientX, y: event.clientY, opened: false };
                press.current.timer = window.setTimeout(() => {
                  press.current.opened = true;
                  window.clearTimeout(detailsTimer.current);
                  setContextMenu({ track, x: press.current.x, y: press.current.y });
                }, 500);
              }}
              onPointerMove={(event) => {
                if (
                  Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 10
                )
                  cancelPress();
              }}
              onPointerUp={cancelPress}
              onPointerCancel={cancelPress}
              onClickCapture={(event) => {
                if (press.current.opened) {
                  event.preventDefault();
                  event.stopPropagation();
                  press.current.opened = false;
                }
              }}
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
              <div className="row-leading" role="cell">
                {playlistId && !selecting && !phone ? (
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
                    onClick={(event) => {
                      if (event.shiftKey && selectionAnchor.current !== undefined) {
                        const anchor = sorted.findIndex(
                          (item) => item.id === selectionAnchor.current,
                        );
                        if (anchor >= 0)
                          setSelected(
                            (current) =>
                              new Set([
                                ...current,
                                ...sorted
                                  .slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
                                  .map((item) => item.id),
                              ]),
                          );
                        else toggleSelected(track.id);
                      } else toggleSelected(track.id);
                      selectionAnchor.current = track.id;
                    }}
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
                    <Artwork
                      className="track-cover"
                      track={track}
                      fallback={<Music2 size={20} />}
                    />
                  </button>
                )}
              </div>
              <div className="track-title" role="cell">
                <button
                  className="track-title-button"
                  onClick={(event) => {
                    if (phone) {
                      state.playTrack(track.id, queueContext);
                      return;
                    }
                    if (event.detail === 0) state.setSelectedTrack(track.id);
                    else if (event.detail === 1) openDetails(track.id);
                    else window.clearTimeout(detailsTimer.current);
                  }}
                  type="button"
                >
                  <strong>{track.title}</strong>
                  <small>
                    {track.artist} · {track.album}
                  </small>
                </button>
              </div>
              {playlistId ? (
                <div
                  role="cell"
                  className="playlist-order-actions"
                  aria-label={t("{0} 排序", track.title)}
                >
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
                <span role="cell">{popular ? (state.playCounts[track.id] ?? 0) : ""}</span>
              )}
              <div role="cell">
                <button
                  className="icon-button more-menu"
                  aria-label={t("{0} 更多操作", track.title)}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setContextMenu({ track, x: bounds.right - 280, y: bounds.bottom });
                  }}
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </div>
          );
        })}
        {range.end < sorted.length ? (
          <div
            className="track-spacer"
            aria-hidden="true"
            style={{ height: (sorted.length - range.end) * range.rowHeight }}
          />
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmRemoval}
        title={t("从歌单移除")}
        message={t("将选中的 {0} 首歌曲从歌单移除，音乐文件不会受影响。", selected.size)}
        confirmLabel={t("从歌单移除")}
        danger
        onClose={() => setConfirmRemoval(false)}
        onConfirm={() => {
          if (playlistId) selected.forEach((id) => state.removeFromPlaylist(playlistId, id));
          setSelected(new Set());
          setSelecting(false);
          setConfirmRemoval(false);
        }}
      />
      {contextMenu ? (
        <div
          ref={(node) => {
            contextRef.current = node;
          }}
          className="context-menu menu-popover"
          role="menu"

          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setContextMenu(undefined)}
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
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 40), rowHeight: 58 });
  useLayoutEffect(() => {
    if (count <= 40) {
      setRange({ start: 0, end: count, rowHeight: 58 });
      return;
    }
    const table = tableRef.current;
    const scroller = table?.closest<HTMLElement>(".page-scroll");
    if (!table || !scroller) {
      setRange({ start: 0, end: Math.min(count, 40), rowHeight: 58 });
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const tableRect = table.getBoundingClientRect();
        const scrollRect = scroller.getBoundingClientRect();
        const rowHeight =
          table.querySelector("[data-track-id]")?.getBoundingClientRect().height || 58;
        const headerHeight =
          table.querySelector(".track-head")?.getBoundingClientRect().height || 0;
        const visibleTop = Math.max(0, scrollRect.top - tableRect.top - headerHeight);
        const start = Math.min(count, Math.max(0, Math.floor(visibleTop / rowHeight) - 10));
        const end = Math.min(
          count,
          Math.ceil((visibleTop + scroller.clientHeight) / rowHeight) + 10,
        );
        setRange((current) =>
          current.start === start && current.end === end && current.rowHeight === rowHeight
            ? current
            : { start, end, rowHeight },
        );
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(table);
    observer.observe(scroller);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [count, layoutKey, tableRef]);
  return range;
}
