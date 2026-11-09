/// <reference types="vite/client" />
import { useEffect, useState } from "react";
import { useNanoStore } from "../store";
import { trackIsSelected } from "../library/folderFilter";
import {
  buildRequest,
  CACHE_KEY,
  CONSENT_KEY,
  eligibleTracks,
  intervalMs,
  LIMIT,
  readCache,
  recentTracks,
  shuffled,
  validatedIds,
  boundedCopy,
} from "./recommendations";

let promoted = false;
let attempted = false;
let sessionIds: number[] = [];
let sessionCopy = { title: "", description: "" };
export const recommendationCopy = () => sessionCopy;
const changed = () => window.dispatchEvent(new Event("recommendations-changed"));
const save = (value: ReturnType<typeof readCache>) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* Storage may be full. */
  }
};
export function onlineEnabled() {
  try {
    return localStorage.getItem(CONSENT_KEY) !== "false";
  } catch {
    return false;
  }
}
export function toggleOnline() {
  try {
    localStorage.setItem(CONSENT_KEY, String(!onlineEnabled()));
  } catch {
    return;
  }
  changed();
}
export function useRecommendations(
  tracks: Parameters<typeof eligibleTracks>[0],
  stats: Parameters<typeof eligibleTracks>[1],
) {
  const [, update] = useState(0);
  useEffect(() => {
    const listener = () => update((value) => value + 1);
    window.addEventListener("recommendations-changed", listener);
    return () => window.removeEventListener("recommendations-changed", listener);
  }, []);
  const eligible = eligibleTracks(tracks, stats);
  const allowed = new Set(eligible.map((track) => track.id));
  const ids = validatedIds(sessionIds, allowed);
  const byId = new Map(eligible.map((track) => [track.id, track]));
  // Stable within this process; never silently fill with ineligible songs.
  return [
    ...ids.map((id) => byId.get(id)!),
    ...eligible.filter((track) => !ids.includes(track.id)),
  ].slice(0, LIMIT);
}

export function RecommendationLifecycle() {
  const tracks = useNanoStore((state) => state.tracks);
  const [revision, update] = useState(0);
  useEffect(() => {
    const listener = () => update((value) => value + 1);
    window.addEventListener("recommendations-changed", listener);
    return () => window.removeEventListener("recommendations-changed", listener);
  }, []);
  useEffect(() => {
    if (!tracks.length) return;
    const timer = window.setTimeout(async () => {
      const state = useNanoStore.getState();
      const library = state.tracks.filter((track) => trackIsSelected(track, state));
      if (!library.length) return;
      const cache = readCache();
      if (!promoted) {
        promoted = true;
        if (cache.pending) {
          cache.title = cache.pendingTitle;
          cache.description = cache.pendingDescription;
        }
        cache.active = cache.pending ?? cache.active;
        delete cache.pending;
        delete cache.pendingTitle;
        delete cache.pendingDescription;
        if (!cache.active.length)
          cache.active = shuffled(eligibleTracks(library, state))
            .slice(0, LIMIT)
            .map((track) => track.id);
        sessionIds = cache.active;
        sessionCopy = { title: cache.title ?? "", description: cache.description ?? "" };
        save(cache);
        changed();
      }
      const now = Date.now();
      if (
        attempted ||
        now < (cache.retryAt ?? 0) ||
        now - cache.generatedAt < intervalMs(library, state, now)
      )
        return;
      const request = buildRequest(library, state, cache.sentIds);
      const endpoint = import.meta.env.VITE_RECOMMENDATIONS_URL;
      const token = import.meta.env.VITE_RECOMMENDATIONS_TOKEN;
      if (recentTracks(library, state).length && (!onlineEnabled() || !endpoint || !token)) return;
      attempted = true;
      try {
        let ids: number[];
        let title = "";
        let description = "";
        if (!request.recent.length) {
          ids = shuffled(eligibleTracks(library, state))
            .slice(0, LIMIT)
            .map((track) => track.id);
        } else {
          if (!request.candidates.length || !endpoint.startsWith("https://")) return;
          const eligible = new Set(eligibleTracks(library, state).map((track) => track.id));
          const previous = (cache.sentIds ?? []).filter((id) => eligible.has(id));
          cache.sentIds = [
            ...new Set([
              ...(previous.length < eligible.size ? previous : []),
              ...request.candidates.map((track) => track.id),
            ]),
          ];
          save(cache);
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 25000);
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(request),
              signal: controller.signal,
              credentials: "omit",
            });
            if (!response.ok) throw new Error("Recommendation unavailable");
            const data = await response.json();
            title = boundedCopy(data.title, 60);
            description = boundedCopy(data.description, 160);
            ids = validatedIds(data.ids, new Set(request.candidates.map((track) => track.id)));
            if (!ids.length) throw new Error("Empty recommendation");
          } finally {
            window.clearTimeout(timeout);
          }
        }
        // Remains invisible until the next process launch, including home revisits.
        if (request.recent.length && !onlineEnabled()) return;
        save({
          ...cache,
          pending: ids,
          pendingTitle: title,
          pendingDescription: description,
          generatedAt: now,
          retryAt: 0,
        });
      } catch {
        save({ ...cache, retryAt: now + 6 * 3600000 });
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [tracks, revision]);
  return null;
}
