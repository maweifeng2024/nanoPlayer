import { expect, it, vi } from "vitest";
import { changedStorage } from "./changedStorage";

it("avoids serializing unchanged large persisted state and still writes ratings and progress", () => {
  const setItem = vi.fn();
  const storage = changedStorage<{ queue: number[]; ratings: object; progress: number }>(() => ({ getItem: () => null, setItem, removeItem: vi.fn() }))!;
  const queue = Array.from({ length: 10000 }, (_, i) => i);
  const ratings = { 1: 5 };
  storage.setItem("test", { state: { queue, ratings, progress: 0 }, version: 1 });
  for (let i = 0; i < 100; i++) storage.setItem("test", { state: { queue, ratings, progress: 0 }, version: 1 });
  expect(setItem).toHaveBeenCalledTimes(1);
  storage.setItem("test", { state: { queue, ratings: { 1: 4 }, progress: 0 }, version: 1 });
  storage.setItem("test", { state: { queue, ratings, progress: 500 }, version: 1 });
  expect(setItem).toHaveBeenCalledTimes(3);
  storage.removeItem("test");
  storage.setItem("test", { state: { queue, ratings, progress: 500 }, version: 1 });
  expect(setItem).toHaveBeenCalledTimes(4);
});
