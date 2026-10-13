import { createJSONStorage, type PersistStorage, type StateStorage } from "zustand/middleware";

// Zustand calls storage for every set, including navigation and scan progress.
// Compare the persisted fields before serializing potentially large queues/playlists.
export function changedStorage<T extends object>(getStorage: () => StateStorage): PersistStorage<T> | undefined {
  const storage = createJSONStorage<T>(getStorage);
  if (!storage) return undefined;
  let previous: { state: T; version?: number } | undefined;
  return {
    getItem: storage.getItem,
    removeItem: (name) => {
      previous = undefined;
      return storage.removeItem(name);
    },
    setItem: (name, value) => {
      if (previous && previous.version === value.version &&
        Object.keys(value.state).length === Object.keys(previous.state).length &&
        Object.entries(value.state).every(([key, field]) => Object.is(field, previous!.state[key as keyof T]))) return;
      const result = storage.setItem(name, value);
      previous = value;
      return result;
    },
  };
}
