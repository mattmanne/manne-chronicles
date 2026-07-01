const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, keyedRedisMock } = require("./helpers");

function callPush(req) {
  const handler = freshRequire("../api/push.js");
  const res = mockRes();
  return handler(req, res).then(() => res);
}

const VALID_SUBSCRIPTION = { endpoint: "https://push.example/abc", keys: { p256dh: "p1", auth: "a1" } };

test("subscribe stores a new subscription under the world's push key", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);

  const res = await callPush({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { action: "subscribe", payload: { player: "player1", subscription: VALID_SUBSCRIPTION } } });
  assert.equal(res.body.ok, true);
  assert.deepEqual(redis.get("push:manlandia:subscriptions"), [{ player: "player1", endpoint: VALID_SUBSCRIPTION.endpoint, keys: VALID_SUBSCRIPTION.keys }]);
});

test("subscribe dedupes by endpoint, replacing the old entry", async (t) => {
  const seeded = { "push:manlandia:subscriptions": [{ player: "player1", endpoint: VALID_SUBSCRIPTION.endpoint, keys: { p256dh: "old", auth: "old" } }] };
  const redis = keyedRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  await callPush({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { action: "subscribe", payload: { player: "player1", subscription: VALID_SUBSCRIPTION } } });
  const subs = redis.get("push:manlandia:subscriptions");
  assert.equal(subs.length, 1);
  assert.equal(subs[0].keys.p256dh, "p1");
});

test("subscribe rejects a malformed subscription", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);

  const res = await callPush({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { action: "subscribe", payload: { player: "player1", subscription: { endpoint: "x" } } } });
  assert.equal(res.statusCode, 400);
});

test("unsubscribe removes only the matching endpoint", async (t) => {
  const seeded = { "push:manlandia:subscriptions": [
    { player: "player1", endpoint: "a", keys: {} },
    { player: "player2", endpoint: "b", keys: {} },
  ] };
  const redis = keyedRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const res = await callPush({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { action: "unsubscribe", payload: { endpoint: "a" } } });
  assert.equal(res.body.ok, true);
  assert.deepEqual(redis.get("push:manlandia:subscriptions").map((s) => s.endpoint), ["b"]);
});

test("rejects requests with the wrong game secret when one is configured", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);
  process.env.GAME_SECRET = "supersecret";
  try {
    const res = await callPush({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { action: "subscribe", payload: { player: "player1", subscription: VALID_SUBSCRIPTION } } });
    assert.equal(res.statusCode, 401);
  } finally {
    delete process.env.GAME_SECRET;
  }
});

test("an unknown action returns 400", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);
  const res = await callPush({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { action: "not_real" } });
  assert.equal(res.statusCode, 400);
});

test("custom worlds are namespaced separately from built-in worlds", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);
  await callPush({ method: "POST", headers: {}, query: { world: "c_123" }, body: { action: "subscribe", payload: { player: "player1", subscription: VALID_SUBSCRIPTION } } });
  assert.ok(redis.get("push:c_123:subscriptions"));
  assert.equal(redis.get("push:manlandia:subscriptions"), undefined);
});
