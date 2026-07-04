const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, keyedRedisMock } = require("./helpers");

const DAY_MS = 24 * 60 * 60 * 1000;
const STALLED_AT = () => Date.now() - 49 * 60 * 60 * 1000; // just past the 48h threshold

function withVapidConfigured(fn) {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  return fn().finally(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });
}

function mockWebPush(t, onSend) {
  t.mock.module("web-push", {
    exports: {
      setVapidDetails: () => {},
      sendNotification: async (sub) => { onSend?.(sub); return {}; },
    },
  });
}

function callCron(headers = {}) {
  const handler = freshRequire("../api/cron-turn-reminder.js");
  const req = { headers };
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("skips a world with no activity yet", async (t) => {
  const redis = keyedRedisMock({ "resonance:gamestate": null, "manlandia:gamestate": null });
  t.mock.module("../lib/redis.js", redis);
  mockWebPush(t);

  const res = await callCron();
  const resonance = res.body.results.find(r => r.worldId === "resonance");
  assert.equal(resonance.skipped, "no activity yet");
});

test("skips a world that hasn't been idle 48h yet", async (t) => {
  const redis = keyedRedisMock({
    "manlandia:gamestate": { worldState: { last_actor: "player1", last_action_at: Date.now() - DAY_MS }, characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } } },
  });
  t.mock.module("../lib/redis.js", redis);
  mockWebPush(t);

  const res = await callCron();
  const manlandia = res.body.results.find(r => r.worldId === "manlandia");
  assert.equal(manlandia.skipped, "not stalled");
});

test("sends a reminder to the hero who didn't go last, once a world is stalled", async (t) => {
  await withVapidConfigured(async () => {
    const redis = keyedRedisMock({
      "manlandia:gamestate": { worldState: { last_actor: "player1", last_action_at: STALLED_AT() }, characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } } },
      "push:manlandia:subscriptions": [
        { player: "player1", endpoint: "https://push.example/sender", keys: { p256dh: "a", auth: "b" } },
        { player: "player2", endpoint: "https://push.example/other", keys: { p256dh: "c", auth: "d" } },
      ],
    });
    t.mock.module("../lib/redis.js", redis);
    const sentTo = [];
    mockWebPush(t, (sub) => sentTo.push(sub.endpoint));

    const res = await callCron();
    const manlandia = res.body.results.find(r => r.worldId === "manlandia");
    assert.equal(manlandia.sentTo, 1);
    assert.deepEqual(sentTo, ["https://push.example/other"]);
    assert.ok(redis.get("manlandia:gamestate").worldState.last_reminder_sent_at);
  });
});

test("does not remind twice for the same stall", async (t) => {
  await withVapidConfigured(async () => {
    const lastActionAt = STALLED_AT();
    const redis = keyedRedisMock({
      "manlandia:gamestate": { worldState: { last_actor: "player1", last_action_at: lastActionAt, last_reminder_sent_at: lastActionAt + 1000 }, characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } } },
      "push:manlandia:subscriptions": [{ player: "player2", endpoint: "https://push.example/other", keys: { p256dh: "c", auth: "d" } }],
    });
    t.mock.module("../lib/redis.js", redis);
    let sendCalls = 0;
    mockWebPush(t, () => sendCalls++);

    const res = await callCron();
    const manlandia = res.body.results.find(r => r.worldId === "manlandia");
    assert.equal(manlandia.skipped, "already reminded for this stall");
    assert.equal(sendCalls, 0);
  });
});

test("skips a solo world with nobody else to remind", async (t) => {
  const redis = keyedRedisMock({
    "manlandia:gamestate": { worldState: { last_actor: "player1", last_action_at: STALLED_AT() }, characters: { player1: { archetype: "fighter" }, player2: {} } },
  });
  t.mock.module("../lib/redis.js", redis);
  mockWebPush(t);

  const res = await callCron();
  const manlandia = res.body.results.find(r => r.worldId === "manlandia");
  assert.equal(manlandia.skipped, "nobody to remind");
});

test("skips when push isn't configured yet (no VAPID keys)", async (t) => {
  const redis = keyedRedisMock({
    "manlandia:gamestate": { worldState: { last_actor: "player1", last_action_at: STALLED_AT() }, characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } } },
  });
  t.mock.module("../lib/redis.js", redis);
  mockWebPush(t);

  const res = await callCron();
  const manlandia = res.body.results.find(r => r.worldId === "manlandia");
  assert.equal(manlandia.skipped, "push not configured");
});

test("checks active custom campaigns from campaigns:index but skips archived ones", async (t) => {
  const stalledAt = STALLED_AT();
  const redis = keyedRedisMock({
    "campaigns:index": [
      { id: "c_active", name: "Active World", status: "active" },
      { id: "c_gone", name: "Archived World", status: "archived" },
    ],
    "campaign:c_active:gamestate": { worldState: { last_actor: "player1", last_action_at: stalledAt }, characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } } },
    "campaign:c_gone:gamestate": { worldState: { last_actor: "player1", last_action_at: stalledAt }, characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } } },
  });
  t.mock.module("../lib/redis.js", redis);
  mockWebPush(t);

  const res = await callCron();
  assert.ok(res.body.results.some(r => r.worldId === "c_active"));
  assert.ok(!res.body.results.some(r => r.worldId === "c_gone"));
});

test("rejects a call with the wrong CRON_SECRET, allows the right one", async (t) => {
  process.env.CRON_SECRET = "supersecret";
  try {
    const redis = keyedRedisMock({});
    t.mock.module("../lib/redis.js", redis);
    mockWebPush(t);

    const bad = await callCron({ authorization: "Bearer wrong" });
    assert.equal(bad.statusCode, 401);

    const good = await callCron({ authorization: "Bearer supersecret" });
    assert.equal(good.statusCode, 200);
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test("allows the call with no secret at all when CRON_SECRET isn't configured (fails open, same as GAME_SECRET)", async (t) => {
  const redis = keyedRedisMock({});
  t.mock.module("../lib/redis.js", redis);
  mockWebPush(t);

  const res = await callCron();
  assert.equal(res.statusCode, 200);
});
