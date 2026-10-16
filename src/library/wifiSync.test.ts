import { expect, test } from "vitest";
import { WifiSync } from "./wifiSync";
test("stopping during an earlier scan still synchronizes the final received files", async () => {
  const sync = new WifiSync();
  const scanned: number[] = [];
  let finish!: () => void;
  const old = sync.run(1, async () => { await new Promise<void>((resolve) => { finish = resolve; }); scanned.push(1); });
  await Promise.resolve(); await Promise.resolve();
  const final = sync.run(2, async () => { scanned.push(2); });
  finish(); await Promise.all([old, final]);
  await sync.run(2, async () => { scanned.push(99); });
  expect(scanned).toEqual([1, 2]);
});
test("a failed scan can retry the same snapshot and a new receiver resets its sequence", async () => {
  const sync = new WifiSync();
  await expect(sync.run(1, async () => { throw new Error("scan failed"); })).rejects.toThrow("scan failed");
  let count = 0;
  await sync.run(1, async () => { count++; });
  await sync.reset();
  await sync.run(1, async () => { count++; });
  expect(count).toBe(2);
});
