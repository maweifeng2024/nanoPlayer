import { invoke } from "@tauri-apps/api/core";
import { useNanoStore } from "../store";

export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const androidCommand = <T = unknown>(action: string, args: Record<string, unknown> = {}) =>
  invoke<T>(
    [
      "snapshot",
      "setQueue",
      "updateQueue",
      "play",
      "pause",
      "seek",
      "next",
      "previous",
      "shuffle",
      "repeat",
      "volume",
    ].includes(action)
      ? "android_playback"
      : "plugin:nanoplayer-mobile|dispatch",
    { payload: { action, ...args } },
  );

let transportSender: ((action: string, args?: Record<string, unknown>) => void) | undefined;

/** Route transport through the same queue as mode changes and polling. */
export function sendAndroidPlayback(action: string, args: Record<string, unknown> = {}) {
  transportSender?.(action, args);
}

interface NativePlayback {
  queue: string[];
  trackId?: string;
  positionMs: number;
  playWhenReady: boolean;
  shuffle: boolean;
  playbackOrder?: string[];
  ended?: boolean;
  repeatMode: number;
  playCounts: Record<number, number>;
  lastPlayedAt?: Record<number, string>;
  error?: string;
}

/** One serialized command stream; native snapshots never feed back as user commands. */
export function connectAndroidPlayback() {
  let disposed = false;
  let applying = false;
  let pending = 0;
  let chain = Promise.resolve();
  const apply = (snapshot: NativePlayback) => {
    if (disposed) return;
    applying = true;
    const counts = Object.fromEntries(
      Object.entries(snapshot.playCounts).filter(([id]) => Number.isFinite(Number(id))),
    );
    const current = useNanoStore.getState();
    const sameCounts =
      Object.keys(counts).length === Object.keys(current.playCounts).length &&
      Object.entries(counts).every(([id, count]) => current.playCounts[Number(id)] === count);
    const queue = snapshot.queue.map(Number).filter(Number.isFinite);
    const order = snapshot.playbackOrder?.map(Number).filter(Number.isFinite);
    const sameIds = (left: number[], right: number[]) =>
      left.length === right.length && left.every((id, index) => id === right[index]);
    useNanoStore.setState({
      queue: sameIds(queue, current.queue) ? current.queue : queue,
      ...(order
        ? { shuffleOrder: sameIds(order, current.shuffleOrder) ? current.shuffleOrder : order }
        : {}),
      queueEnded: snapshot.ended ?? false,
      currentTrackId:
        snapshot.trackId && Number.isFinite(Number(snapshot.trackId))
          ? Number(snapshot.trackId)
          : undefined,
      playing: snapshot.playWhenReady && !snapshot.error,
      progressMs: snapshot.positionMs,
      orderMode: snapshot.shuffle ? "shuffle" : "sequence",
      repeatMode: snapshot.repeatMode === 1 ? "one" : snapshot.repeatMode === 2 ? "all" : "off",
      playCounts: sameCounts ? current.playCounts : counts,
      ...(snapshot.lastPlayedAt ? { lastPlayedAt: snapshot.lastPlayedAt } : {}),
      ...(snapshot.error ? { notice: snapshot.error } : {}),
    });
    applying = false;
  };
  const send = (action: string, args: Record<string, unknown> = {}) => {
    pending++;
    chain = chain
      .then(async () => {
        if (disposed) return;
        const snapshot = await androidCommand<NativePlayback>(action, args);
        if (pending === 1) apply(snapshot);
      })
      .catch((error) => {
        if (!disposed) useNanoStore.getState().setNotice(String(error));
      })
      .finally(() => {
        pending--;
      });
  };
  transportSender = send;
  send("snapshot");
  const initial = useNanoStore.getState();
  send("volume", { volume: initial.muted ? 0 : initial.volume });
  const unsubscribe = useNanoStore.subscribe((next, previous) => {
    if (applying || disposed) return;
    // Library refresh is data, never a request to replace the service-owned queue.
    if (
      next.tracks !== previous.tracks ||
      next.roots !== previous.roots ||
      next.issues !== previous.issues
    ) {
      send("snapshot");
      return;
    }
    if (
      next.playbackRevision !== previous.playbackRevision ||
      next.currentTrackId !== previous.currentTrackId ||
      next.queue !== previous.queue
    ) {
      const queue = next.queue.flatMap((id) => {
        const track = next.tracks.find((item) => item.id === id);
        return track && track.path.startsWith("content://")
          ? [{ id: String(id), uri: track.path, title: track.title, artist: track.artist }]
          : [];
      });
      send(
        next.playbackRevision !== previous.playbackRevision ||
          next.currentTrackId !== previous.currentTrackId
          ? "setQueue"
          : "updateQueue",
        {
          queue: JSON.stringify(queue),
          index: Math.max(
            0,
            queue.findIndex((item) => Number(item.id) === next.currentTrackId),
          ),
          positionMs: next.progressMs,
          enabled: next.playing,
        },
      );
    } else if (next.playing !== previous.playing) send(next.playing ? "play" : "pause");
    if (next.orderMode !== previous.orderMode)
      send("shuffle", { enabled: next.orderMode === "shuffle" });
    if (next.repeatMode !== previous.repeatMode)
      send("repeat", {
        repeatMode: next.repeatMode === "one" ? 1 : next.repeatMode === "all" ? 2 : 0,
      });
    if (next.volume !== previous.volume || next.muted !== previous.muted)
      send("volume", { volume: next.muted ? 0 : next.volume });
  });
  const timer = window.setInterval(() => {
    if (!pending && document.visibilityState === "visible") send("snapshot");
  }, 500);
  return () => {
    disposed = true;
    if (transportSender === send) transportSender = undefined;
    unsubscribe();
    window.clearInterval(timer);
  };
}
