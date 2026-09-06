import { t, setActiveLanguage } from "./i18n";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type {
  LibraryRoot,
  Page,
  PlaybackOrder,
  Playlist,
  RepeatMode,
  ScanIssue,
  ThemeMode,
  Track,
  TrackMetadataUpdate,
} from "./domain";
import { demoRoot, demoTracks } from "./domain";

type Drawer = "queue" | "lyrics" | null;

interface NanoState {
  visualDesignVersion: number;
  statisticsVersion: number;
  page: Page;
  selectedPlaylistId?: string;
  roots: LibraryRoot[];
  tracks: Track[];
  issues: ScanIssue[];
  query: string;
  currentTrackId?: number;
  selectedTrackId?: number;
  queue: number[];
  playing: boolean;
  progressMs: number;
  listenedSessionMs: number;
  sessionCounted: boolean;
  sessionSeeked: boolean;
  completePlayback: () => void;
  seekPlayback: (value: number) => void;
  volume: number;
  muted: boolean;
  orderMode: PlaybackOrder;
  repeatMode: RepeatMode;
  shuffleOrder: number[];
  playbackRevision: number;
  drawer: Drawer;
  ratings: Record<number, number>;
  playCounts: Record<number, number>;
  lastPlayedAt: Record<number, string>;
  playlists: Playlist[];
  onlineLyrics: boolean;
  theme: ThemeMode;
  language: "zh-CN" | "en";
  setLanguage: (language: "zh-CN" | "en") => void;
  outputDevice?: string;
  scanning: boolean;
  scanProcessed: number;
  onboardingDismissed: boolean;
  notice?: string;
  setPage: (page: Page, playlistId?: string) => void;
  setQuery: (query: string) => void;
  replaceLibrary: (roots: LibraryRoot[], tracks: Track[], issues: ScanIssue[]) => void;
  replacePlaylists: (playlists: Playlist[]) => void;
  setScanning: (value: boolean) => void;
  setScanProcessed: (value: number) => void;
  setNotice: (notice?: string) => void;
  setSelectedTrack: (id?: number) => void;
  setPlaying: (value: boolean) => void;
  markPlaybackStarted: (id: number) => void;
  updateTrackLocal: (id: number, value: TrackMetadataUpdate) => void;
  playTrack: (id: number, context?: number[]) => void;
  togglePlay: () => void;
  next: (automatic?: boolean) => void;
  previous: () => void;
  setProgress: (value: number) => void;
  tickPlayback: (elapsedMs: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleOrderMode: () => void;
  cycleRepeatMode: () => void;
  toggleDrawer: (drawer: Exclude<Drawer, null>) => void;
  enqueue: (id: number) => void;
  playNext: (id: number) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  rate: (id: number, rating: number) => void;
  createPlaylist: (name: string) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, trackId: number) => void;
  addManyToPlaylist: (playlistId: string, trackIds: number[]) => void;
  removeFromPlaylist: (playlistId: string, trackId: number) => void;
  reorderPlaylist: (playlistId: string, fromTrackId: number, toTrackId: number) => void;
  setOnlineLyrics: (value: boolean) => void;
  setTheme: (value: ThemeMode) => void;
  setOutputDevice: (value?: string) => void;
  dismissOnboarding: () => void;
}

const currentVisualDesignVersion = 2;
export function migratePlaybackStatistics(source: Record<string, unknown>) {
  if (source.statisticsVersion === 1) return source;
  const playCounts = { ...(source.playCounts as Record<number, number>) };
  for (const [id, seed] of [
    [-1, 14],
    [-3, 8],
    [-6, 21],
  ]) {
    if (id in playCounts) playCounts[id] = Math.max(0, playCounts[id] - seed);
  }
  const lastPlayedAt = { ...(source.lastPlayedAt as Record<number, string>) };
  for (const [id, date] of Object.entries({
    [-1]: "2026-09-02T12:00:00Z",
    [-3]: "2026-09-01T09:00:00Z",
    [-6]: "2026-08-31T18:00:00Z",
  })) {
    if (lastPlayedAt[Number(id)] === date) delete lastPlayedAt[Number(id)];
  }
  return { ...source, playCounts, lastPlayedAt, statisticsVersion: 1 };
}
const nativeStateKeys = [
  "visualDesignVersion",
  "statisticsVersion",
  "playlists",
  "ratings",
  "playCounts",
  "lastPlayedAt",
  "volume",
  "muted",
  "orderMode",
  "repeatMode",
  "shuffleOrder",
  "onlineLyrics",
  "theme",
  "language",
  "outputDevice",
  "queue",
  "currentTrackId",
  "progressMs",
  "onboardingDismissed",
] as const;

export function applyNativeUserState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = migratePlaybackStatistics(value as Record<string, unknown>);
  const allowed: Partial<NanoState> = {};
  for (const key of nativeStateKeys) {
    if (key in source) Object.assign(allowed, { [key]: source[key] });
  }
  if (!("orderMode" in source) && typeof source.mode === "string") {
    allowed.orderMode = source.mode === "shuffle" ? "shuffle" : "sequence";
  }
  if (!("repeatMode" in source) && typeof source.mode === "string") {
    allowed.repeatMode =
      source.mode === "repeat-one" ? "one" : source.mode === "repeat-all" ? "all" : "off";
  }
  if (source.visualDesignVersion !== currentVisualDesignVersion) {
    allowed.visualDesignVersion = currentVisualDesignVersion;
    allowed.theme = "dark";
  }
  if (allowed.language !== "en" && allowed.language !== "zh-CN") allowed.language = "zh-CN";
  allowed.playing = false;
  allowed.listenedSessionMs = 0;
  allowed.sessionCounted = false;
  allowed.sessionSeeked = false;
  useNanoStore.setState(allowed);
}

export function getNativeUserState(): Record<string, unknown> {
  const state = useNanoStore.getState();
  return Object.fromEntries(nativeStateKeys.map((key) => [key, state[key]]));
}

const shuffleTracks = (ids: number[]) => {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};
const repeatCycle: RepeatMode[] = ["off", "all", "one"];
const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useNanoStore = create<NanoState>()(
  persist(
    (set, get) => ({
      visualDesignVersion: currentVisualDesignVersion,
      statisticsVersion: 1,
      page: "home",
      roots: [demoRoot],
      tracks: demoTracks,
      issues: [],
      query: "",
      queue: demoTracks.map((track) => track.id),
      playing: false,
      progressMs: 0,
      listenedSessionMs: 0,
      sessionCounted: false,
      sessionSeeked: false,
      volume: 0.72,
      muted: false,
      orderMode: "sequence",
      repeatMode: "off",
      shuffleOrder: [],
      playbackRevision: 0,
      drawer: null,
      ratings: { [-1]: 5, [-4]: 4, [-6]: 5 },
      playCounts: {},
      lastPlayedAt: {},
      playlists: [{ id: "quiet-night", name: "安静的晚上", trackIds: [-1, -4, -6] }],
      onlineLyrics: false,
      theme: "dark",
      language: "zh-CN",
      setLanguage: (language) => set({ language }),
      outputDevice: undefined,
      scanning: false,
      scanProcessed: 0,
      onboardingDismissed: false,
      setPage: (page, selectedPlaylistId) => set({ page, selectedPlaylistId, query: "" }),
      setQuery: (query) => set({ query }),
      replaceLibrary: (roots, tracks, issues) =>
        set((state) => {
          const ids = new Set(tracks.map((track) => track.id));
          const keepPlayback = state.currentTrackId !== undefined && ids.has(state.currentTrackId);
          const preservedQueue = state.queue.filter((id) => ids.has(id));
          const fallbackTrackId = preservedQueue[0];
          return {
            roots,
            tracks,
            issues,
            queue: preservedQueue.length ? preservedQueue : tracks.map((track) => track.id),
            currentTrackId: keepPlayback ? state.currentTrackId : fallbackTrackId,
            playing: keepPlayback ? state.playing : Boolean(fallbackTrackId && state.playing),
            progressMs: keepPlayback ? state.progressMs : 0,
            listenedSessionMs: keepPlayback ? state.listenedSessionMs : 0,
            sessionCounted: keepPlayback ? state.sessionCounted : false,
            sessionSeeked: keepPlayback ? state.sessionSeeked : false,
            notice:
              state.currentTrackId !== undefined && !keepPlayback
                ? t("当前文件暂时不可用，已跳到队列中的下一首。")
                : state.notice,
          };
        }),
      replacePlaylists: (playlists) => set({ playlists }),
      setScanning: (scanning) =>
        set({ scanning, scanProcessed: scanning ? get().scanProcessed : 0 }),
      setScanProcessed: (scanProcessed) => set({ scanProcessed }),
      setNotice: (notice) => set({ notice }),
      setSelectedTrack: (selectedTrackId) => set({ selectedTrackId }),
      setPlaying: (playing) => set({ playing }),
      markPlaybackStarted: (id) =>
        set({ lastPlayedAt: { ...get().lastPlayedAt, [id]: new Date().toISOString() } }),
      updateTrackLocal: (id, value) =>
        set({
          tracks: get().tracks.map((track) => (track.id === id ? { ...track, ...value } : track)),
        }),
      playTrack: (currentTrackId, context) =>
        set((state) => {
          const queue = context?.length ? context : state.queue;
          return {
            currentTrackId,
            playbackRevision: state.playbackRevision + 1,
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
            playing: true,
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
          };
        }),
      togglePlay: () => {
        const state = get();
        if (state.currentTrackId === undefined && state.tracks.length) {
          const currentTrackId = state.tracks[0].id;
          const queue = state.tracks.map((track) => track.id);
          set({
            currentTrackId,
            playing: true,
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
          });
        } else set({ playing: !state.playing });
      },
      next: (automatic = false) => {
        const state = get();
        if (!state.queue.length) return;
        if (automatic && state.repeatMode === "one")
          return set({
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
            playbackRevision: state.playbackRevision + 1,
          });
        const order =
          state.orderMode === "shuffle"
            ? state.shuffleOrder.length === state.queue.length
              ? state.shuffleOrder
              : shuffleTracks(state.queue)
            : state.queue;
        const index = Math.max(0, order.indexOf(state.currentTrackId ?? order[0]));
        const nextIndex = index + 1;
        if (nextIndex >= order.length && state.repeatMode === "off")
          return set({
            playing: false,
            playbackRevision: state.playbackRevision + 1,
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
          });
        const nextOrder =
          nextIndex >= order.length && state.orderMode === "shuffle"
            ? shuffleTracks(state.queue)
            : order;
        const currentTrackId = nextOrder[nextIndex >= order.length ? 0 : nextIndex];
        set({
          currentTrackId,
          playbackRevision: state.playbackRevision + 1,
          shuffleOrder: state.orderMode === "shuffle" ? nextOrder : [],
          progressMs: 0,
          listenedSessionMs: 0,
          sessionCounted: false,
          sessionSeeked: false,
          playing: true,
        });
      },
      previous: () => {
        const state = get();
        if (state.progressMs > 5000)
          return set({
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
            playbackRevision: state.playbackRevision + 1,
          });
        const order =
          state.orderMode === "shuffle" && state.shuffleOrder.length === state.queue.length
            ? state.shuffleOrder
            : state.queue;
        const index = Math.max(0, order.indexOf(state.currentTrackId ?? order[0]));
        const previousIndex = index - 1;
        if (previousIndex < 0 && state.repeatMode === "off")
          return set({
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
            playbackRevision: state.playbackRevision + 1,
          });
        const currentTrackId = order[(previousIndex + order.length) % order.length];
        set({
          currentTrackId,
          playbackRevision: state.playbackRevision + 1,
          progressMs: 0,
          listenedSessionMs: 0,
          sessionCounted: false,
          sessionSeeked: false,
          playing: true,
        });
      },
      setProgress: (progressMs) => set({ progressMs }),
      seekPlayback: (progressMs) => set({ progressMs, sessionSeeked: true }),
      tickPlayback: (elapsedMs) => {
        const state = get();
        if (!state.playing || state.currentTrackId === undefined) return;
        set({ listenedSessionMs: state.listenedSessionMs + Math.max(0, elapsedMs) });
      },
      completePlayback: () => {
        const state = get();
        const track = state.tracks.find((item) => item.id === state.currentTrackId);
        // Only natural completion counts. Allow one polling interval at either end.
        if (
          !track ||
          !state.playing ||
          state.sessionCounted ||
          state.sessionSeeked ||
          track.durationMs <= 0 ||
          state.listenedSessionMs < Math.max(1, track.durationMs - 750)
        )
          return;
        set({
          sessionCounted: true,
          playCounts: { ...state.playCounts, [track.id]: (state.playCounts[track.id] ?? 0) + 1 },
        });
      },
      setVolume: (volume) => set({ volume, muted: false }),
      toggleMute: () => set({ muted: !get().muted }),
      toggleOrderMode: () =>
        set((state) => {
          const orderMode = state.orderMode === "sequence" ? "shuffle" : "sequence";
          return {
            orderMode,
            shuffleOrder: orderMode === "shuffle" ? shuffleTracks(state.queue) : [],
          };
        }),
      cycleRepeatMode: () =>
        set((state) => ({
          repeatMode: repeatCycle[(repeatCycle.indexOf(state.repeatMode) + 1) % repeatCycle.length],
        })),
      toggleDrawer: (drawer) => set({ drawer: get().drawer === drawer ? null : drawer }),
      enqueue: (id) =>
        set((state) => {
          const queue = [...state.queue, id];
          return {
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
            notice: t("已添加到队列"),
          };
        }),
      playNext: (id) => {
        const state = get();
        const index = Math.max(0, state.queue.indexOf(state.currentTrackId ?? state.queue[0]));
        const queue = [...state.queue.slice(0, index + 1), id, ...state.queue.slice(index + 1)];
        set({
          queue,
          shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
          notice: t("已设为下一首"),
        });
      },
      removeFromQueue: (index) =>
        set((state) => {
          const queue = state.queue.filter((_, itemIndex) => itemIndex !== index);
          return {
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
          };
        }),
      reorderQueue: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.queue.length ||
            toIndex >= state.queue.length
          )
            return state;
          const queue = [...state.queue];
          const [moved] = queue.splice(fromIndex, 1);
          queue.splice(toIndex, 0, moved);
          return {
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
          };
        }),
      clearQueue: () =>
        set((state) => {
          const queue = state.currentTrackId === undefined ? [] : [state.currentTrackId];
          return {
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? [...queue] : [],
          };
        }),
      rate: (id, rating) => set({ ratings: { ...get().ratings, [id]: rating } }),
      createPlaylist: (name) => {
        const id = `${Date.now()}`;
        set({
          playlists: [...get().playlists, { id, name, trackIds: [] }],
          page: "playlist",
          selectedPlaylistId: id,
        });
        return id;
      },
      renamePlaylist: (id, name) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === id ? { ...playlist, name } : playlist,
          ),
        }),
      deletePlaylist: (id) =>
        set({
          playlists: get().playlists.filter((playlist) => playlist.id !== id),
          page: "songs",
          selectedPlaylistId: undefined,
        }),
      addToPlaylist: (playlistId, trackId) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === playlistId && !playlist.trackIds.includes(trackId)
              ? { ...playlist, trackIds: [...playlist.trackIds, trackId] }
              : playlist,
          ),
          notice: t("已添加到歌单"),
        }),
      addManyToPlaylist: (playlistId, trackIds) =>
        set({
          playlists: get().playlists.map((playlist) => {
            if (playlist.id !== playlistId) return playlist;
            const existing = new Set(playlist.trackIds);
            return {
              ...playlist,
              trackIds: [...playlist.trackIds, ...trackIds.filter((id) => !existing.has(id))],
            };
          }),
          notice: t("已将 {0} 首歌曲添加到歌单", trackIds.length),
        }),
      removeFromPlaylist: (playlistId, trackId) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === playlistId
              ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId) }
              : playlist,
          ),
        }),
      reorderPlaylist: (playlistId, fromTrackId, toTrackId) =>
        set({
          playlists: get().playlists.map((playlist) => {
            if (playlist.id !== playlistId || fromTrackId === toTrackId) return playlist;
            const next = playlist.trackIds.filter((id) => id !== fromTrackId);
            const target = next.indexOf(toTrackId);
            next.splice(target < 0 ? next.length : target, 0, fromTrackId);
            return { ...playlist, trackIds: next };
          }),
        }),
      setOnlineLyrics: (onlineLyrics) => set({ onlineLyrics }),
      setTheme: (theme) => set({ theme }),
      setOutputDevice: (outputDevice) => set({ outputDevice }),
      dismissOnboarding: () => set({ onboardingDismissed: true }),
    }),
    {
      name: "nanoplayer-state-v1",
      version: 3,
      migrate: (persisted, version) =>
        version < currentVisualDesignVersion
          ? {
              ...migratePlaybackStatistics(persisted as Record<string, unknown>),
              visualDesignVersion: currentVisualDesignVersion,
              theme: "dark",
            }
          : migratePlaybackStatistics(persisted as Record<string, unknown>),
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : window.localStorage,
      ),
      partialize: ({
        visualDesignVersion,
        statisticsVersion,
        playlists,
        ratings,
        playCounts,
        lastPlayedAt,
        volume,
        muted,
        orderMode,
        repeatMode,
        shuffleOrder,
        onlineLyrics,
        theme,
        language,
        outputDevice,
        queue,
        currentTrackId,
        progressMs,
        onboardingDismissed,
      }) => ({
        visualDesignVersion,
        statisticsVersion,
        playlists,
        ratings,
        playCounts,
        lastPlayedAt,
        volume,
        muted,
        orderMode,
        repeatMode,
        shuffleOrder,
        onlineLyrics,
        theme,
        language,
        outputDevice,
        queue,
        currentTrackId,
        progressMs,
        onboardingDismissed,
      }),
    },
  ),
);

setActiveLanguage(useNanoStore.getState().language);
useNanoStore.subscribe((state, previous) => {
  if (state.language !== previous.language) setActiveLanguage(state.language);
});
