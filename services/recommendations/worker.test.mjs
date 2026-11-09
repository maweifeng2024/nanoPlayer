import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";
const payload = { recent: [{ id: 1, title: "recent", artist: "artist" }], candidates: [{ id: 2, title: "song", artist: "artist" }], count: 12 };
function request(value = payload, token = "test") {
  return new Request("https://example.com/recommend", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) });
}
const env = { APP_TOKEN: "test", MODEL: "test-model", RATE_LIMITER: { limit: async () => ({ success: true }) }, AI: { run: async () => ({ response: '{"ids":[2,2,1,999,"2"]}' }) } };
test("auth, origin and rate limits precede paid inference", async () => {
  assert.equal((await worker.fetch(request(payload, "bad"), env)).status, 401);
  assert.equal((await worker.fetch(request(), { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
  const req = request(); req.headers.set("Origin", "https://evil.example");
  assert.equal((await worker.fetch(req, env)).status, 403);
});
test("only distinct candidate IDs can leave the Worker", async () => {
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ids: [2], title: "", description: "" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
test("rejects invalid/oversized input and model failure", async () => {
  assert.equal((await worker.fetch(request({ ...payload, candidates: [{ ...payload.candidates[0], path: "/private" }] }), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...payload, extra: "x".repeat(17000) }), env)).status, 413);
  assert.equal((await worker.fetch(request(), { ...env, AI: { run: async () => { throw new Error("secret"); } } })).status, 502);
});
