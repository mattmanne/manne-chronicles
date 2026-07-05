const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, keyedRedisMock } = require("./helpers");

const DAY_MS = 24 * 60 * 60 * 1000;
const STALLED_AT = () => Date.now() - 49 * 60 * 60 * 1000; // just past the 48h threshold
const AMBIENT_STALLED_AT = () => Date.now() - 73 * 60 * 60 * 1000; // just past the 72h ambient threshold

function mockGemini(t, response) {
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => response },
  });
}

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

/* ── The Living World: ambient "meanwhile..." beats ── */

test("sends an ambient beat once a world is stalled 72h+, as a flavor-only sessionLog entry, and skips the plain reminder that run", async (t) => {
  await withVapidConfigured(async () => {
    const stalledAt = AMBIENT_STALLED_AT();
    const redis = keyedRedisMock({
      "resonance:gamestate": {
        sessionLog: [],
        worldState: { last_actor: "fen", last_action_at: stalledAt, conclave_awareness: 2 },
        characters: { lyra: {}, fen: {} },
      },
      "push:resonance:subscriptions": [
        { player: "fen", endpoint: "https://push.example/fen", keys: { p256dh: "a", auth: "b" } },
        { player: "lyra", endpoint: "https://push.example/lyra", keys: { p256dh: "c", auth: "d" } },
      ],
    });
    t.mock.module("../lib/redis.js", redis);
    mockWebPush(t);
    mockGemini(t, "A rumor spreads through the Low Quarter about a Conclave warden asking odd questions.");

    const res = await callCron();
    const resonance = res.body.results.find((r) => r.worldId === "resonance");
    assert.equal(resonance.sent, true);
    assert.equal(resonance.sentTo, 2); // no single "sender" to exclude for an ambient beat

    const stored = redis.get("resonance:gamestate");
    assert.equal(stored.sessionLog.length, 1);
    assert.equal(stored.sessionLog[0].ambient, true);
    assert.match(stored.sessionLog[0].content, /Low Quarter/);
    assert.ok(stored.worldState.last_ambient_sent_at);
    // The ambient beat covers this stall — the plain "your turn is waiting"
    // reminder must not also have fired in the same run.
    assert.equal(stored.worldState.last_reminder_sent_at, undefined);
  });
});

test("does not send an ambient beat before 72h, even past the 48h plain-reminder threshold", async (t) => {
  await withVapidConfigured(async () => {
    const redis = keyedRedisMock({
      "manlandia:gamestate": { sessionLog: [], worldState: { last_actor: "player1", last_action_at: STALLED_AT() }, characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } } },
    });
    t.mock.module("../lib/redis.js", redis);
    mockWebPush(t);
    mockGemini(t, "should never be called");

    const res = await callCron();
    const manlandia = res.body.results.find((r) => r.worldId === "manlandia");
    // Falls through to the plain reminder path (no VAPID subscriptions
    // configured for it here, so it just reports the usual skip reason).
    assert.equal(manlandia.sent, undefined);
    assert.equal(redis.get("manlandia:gamestate").worldState.last_ambient_sent_at, undefined);
  });
});

test("does not send an ambient beat twice for the same stall", async (t) => {
  await withVapidConfigured(async () => {
    const stalledAt = AMBIENT_STALLED_AT();
    const redis = keyedRedisMock({
      "manlandia:gamestate": {
        sessionLog: [],
        worldState: { last_actor: "player1", last_action_at: stalledAt, last_ambient_sent_at: stalledAt + 1000 },
        characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } },
      },
    });
    t.mock.module("../lib/redis.js", redis);
    mockWebPush(t);
    mockGemini(t, "should never be called");

    await callCron();
    assert.equal(redis.get("manlandia:gamestate").sessionLog.length, 0);
  });
});

test("falls through to the plain reminder if ambient generation fails", async (t) => {
  await withVapidConfigured(async () => {
    const stalledAt = AMBIENT_STALLED_AT();
    const redis = keyedRedisMock({
      "manlandia:gamestate": {
        sessionLog: [],
        worldState: { last_actor: "player1", last_action_at: stalledAt },
        characters: { player1: { archetype: "fighter" }, player2: { archetype: "healer" } },
      },
      "push:manlandia:subscriptions": [{ player: "player2", endpoint: "https://push.example/other", keys: { p256dh: "c", auth: "d" } }],
    });
    t.mock.module("../lib/redis.js", redis);
    mockWebPush(t);
    t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => { throw new Error("Groq is down"); } } });

    const res = await callCron();
    const manlandia = res.body.results.find((r) => r.worldId === "manlandia");
    assert.equal(manlandia.sentTo, 1); // the plain reminder still went out
    assert.equal(redis.get("manlandia:gamestate").sessionLog.length, 0);
  });
});
