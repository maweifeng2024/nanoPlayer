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
test("external Responses API receives bounded input and keeps output filtering", async (t) => {
  const external = { ...env, MODEL: "gpt-6-astra", MODEL_BASE_URL: "https://api.aicodemirror.ai/v1/" };
  const mock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.href, "https://api.aicodemirror.ai/v1/responses");
    assert.equal(options.headers.Authorization, "Bearer mock-key");
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-6-astra");
    assert.equal(body.store, false);
    assert.deepEqual(JSON.parse(body.input[1].content), payload);
    return Response.json({ output: [
      { type: "reasoning" },
      { type: "message", content: [{ type: "output_text", text: '{"ids":[2,999],"title":"推荐"}' }] },
    ] });
  });
  assert.equal((await worker.fetch(request(), external)).status, 503);
  assert.equal((await worker.fetch(request(), { ...external, MODEL_BASE_URL: "http://example.com", MODEL_API_KEY: "mock-key" })).status, 503);
  assert.equal(mock.mock.callCount(), 0);
  const response = await worker.fetch(request(), { ...external, MODEL_API_KEY: "mock-key" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ids: [2], title: "推荐", description: "" });
  mock.mock.mockImplementation(async () => new Response("private upstream details", { status: 401 }));
  const failed = await worker.fetch(request(), { ...external, MODEL_API_KEY: "mock-key" });
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: "Recommendation unavailable" });
});
test("malformed JSON and null tracks are rejected as client errors", async () => {
  const invalid = new Request("https://example.com/recommend", {
    method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: "{",
  });
  assert.equal((await worker.fetch(invalid, env)).status, 400);
  assert.equal((await worker.fetch(request({ ...payload, candidates: [null] }), env)).status, 400);
});
