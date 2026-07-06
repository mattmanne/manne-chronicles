const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock, mockRedisCommand } = require("./helpers");
const { getWorldConfig } = require("../lib/worldconfig");

// Resonance is always adult-gated.
const ADULT_PIN = "0000";
process.env.ADULT_PIN = ADULT_PIN;

function mockGemini(t, responses) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => queue.shift() } });
}

function callGm(body, world = "resonance") {
  const handler = freshRequire("../api/gm.js");
  const req = { method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world }, body };
  const res = mockRes();
  return handler(req, res).then(() => res);
}

/* ── Resonance: two always-real characters ── */

test("a single Resonance action is held pending instead of advancing the story alone", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  let generateContentCalls = 0;
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => { generateContentCalls++; return "Should not be reached."; } } });

  const res = await callGm({ player: "fen", message: "I wipe down the bar", type: "action" });

  assert.equal(res.body.waiting, true);
  assert.deepEqual(res.body.waitingOn, ["lyra"]);
  assert.equal(generateContentCalls, 0);
  assert.equal(redis.state.sessionLog.length, 0); // nothing pushed to the shared log yet
  assert.equal(redis.state.worldState.pending_turn.fen.message, "I wipe down the bar");
});

test("once both Resonance players have acted, the GM is called once with both actions merged", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  let receivedUserMessage = null;
  let generateContentCalls = 0;
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async (systemPrompt, history, userMessage) => {
        generateContentCalls++;
        receivedUserMessage = userMessage;
        return "The evening carries on for both of them.";
      },
    },
  });

  const res1 = await callGm({ player: "fen", message: "I wipe down the bar", type: "action" });
  assert.equal(res1.body.waiting, true);

  const res2 = await callGm({ player: "lyra", message: "I read my book quietly", type: "action" });
  assert.equal(res2.body.waiting, undefined);
  assert.equal(res2.body.response, "The evening carries on for both of them.");
  assert.equal(generateContentCalls, 1);
  assert.match(receivedUserMessage, /Fen: I wipe down the bar/);
  assert.match(receivedUserMessage, /Lyra: I read my book quietly/);

  // Both contributors' own lines land in the shared log, plus one GM entry.
  const log = redis.state.sessionLog;
  assert.equal(log.length, 3);
  assert.equal(log[0].player, "fen");
  assert.equal(log[1].player, "lyra");
  assert.equal(log[2].role, "gm");
  assert.deepEqual(redis.state.worldState.pending_turn, {});
});

test("soloOverride sends immediately without waiting for the other player", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, "Fen carries on alone.");

  const res = await callGm({ player: "fen", message: "I lock up for the night", type: "action", soloOverride: true });

  assert.equal(res.body.waiting, undefined);
  assert.equal(res.body.response, "Fen carries on alone.");
  assert.equal(redis.state.sessionLog.length, 2);
});

test("a private scene bypasses the wait-for-both gate automatically", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, "Lyra investigates alone.");

  const res = await callGm({ player: "lyra", message: "I look around without Fen", type: "action", private: true });

  assert.equal(res.body.waiting, undefined);
  assert.equal(res.body.response, "Lyra investigates alone.");
});

test("the opening [SESSION BEGINS] turn is never held pending", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, "The pub is warm and busy this evening.");

  const res = await callGm({ player: "fen", message: "[SESSION BEGINS]", type: "begin" });

  assert.equal(res.body.waiting, undefined);
  assert.equal(res.body.response, "The pub is warm and busy this evening.");
});

test("a roll_result is never held pending, even though it's not soloOverride", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Fen tries to slip past.\nROLL:AGILITY", "He makes it through."]);

  const res1 = await callGm({ player: "fen", message: "I sneak past the warden", type: "action", soloOverride: true });
  assert.equal(res1.body.needsRoll, true);

  const res2 = await callGm({ player: "fen", message: "rolled a 9", type: "roll_result" });
  assert.equal(res2.body.waiting, undefined);
  assert.equal(res2.body.response, "He makes it through.");
});

/* ── Manlandia: 1-4 real characters, gated on who's actually created a hero ── */

function manlandiaStateWithHeroes(...playerKeys) {
  const state = getWorldConfig("manlandia").getInitialState();
  for (const key of playerKeys) state.characters[key].archetype = "mage";
  return state;
}

test("a solo Manlandia game (one real hero) never waits", async (t) => {
  const seeded = manlandiaStateWithHeroes("player1");
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, "You continue on alone.");

  const res = await callGm({ player: "player1", message: "I explore the ruins", type: "action" }, "manlandia");

  assert.equal(res.body.waiting, undefined);
  assert.equal(res.body.response, "You continue on alone.");
});

test("a Manlandia hero with no archetype yet doesn't count as real, so a solo created hero still doesn't wait", async (t) => {
  // player2 exists in the base state but has never picked an archetype.
  const seeded = manlandiaStateWithHeroes("player1");
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, "You continue on alone.");

  const res = await callGm({ player: "player1", message: "I explore the ruins", type: "action" }, "manlandia");
  assert.equal(res.body.waiting, undefined);
});

test("two created Manlandia heroes wait for each other, same as Resonance", async (t) => {
  const seeded = manlandiaStateWithHeroes("player1", "player2");
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  let receivedUserMessage = null;
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async (sp, h, userMessage) => { receivedUserMessage = userMessage; return "Both heroes press on together."; } },
  });

  const res1 = await callGm({ player: "player1", message: "I search the ruins", type: "action" }, "manlandia");
  assert.equal(res1.body.waiting, true);
  assert.deepEqual(res1.body.waitingOn, ["player2"]);

  const res2 = await callGm({ player: "player2", message: "I keep watch", type: "action" }, "manlandia");
  assert.equal(res2.body.response, "Both heroes press on together.");
  assert.match(receivedUserMessage, /I search the ruins/);
  assert.match(receivedUserMessage, /I keep watch/);
});

/* ── Roll attribution for a merged turn ── */

test("a roll requested during a merged turn is attributed to the named character, not the player who completed the merge", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, "Fen tries to slip past the warden while Lyra keeps talking.\nROLL:FEN:AGILITY");

  await callGm({ player: "fen", message: "I try to sneak past", type: "action" });
  // Lyra's submission is the one that completes the merge and gets the real
  // response back, but the roll the GM called for is explicitly Fen's.
  const res2 = await callGm({ player: "lyra", message: "I distract the warden", type: "action" });

  assert.equal(res2.body.needsRoll, true);
  assert.equal(res2.body.rollStat, "agility");
  assert.equal(res2.body.rollPlayer, "fen");
});

test("a roll with no explicit name defaults to the submitter, unchanged single-actor behavior", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, "Fen tries to slip past.\nROLL:AGILITY");

  const res = await callGm({ player: "fen", message: "I sneak past", type: "action", soloOverride: true });
  assert.equal(res.body.rollPlayer, "fen");
});

/* ── Notifications exclude every contributor of a merged turn ── */

test("a merged turn's notification excludes both contributors, not just the one who completed it", async (t) => {
  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  try {
    const seeded = getWorldConfig("resonance").getInitialState();
    const store = new Map([
      ["resonance:gamestate", seeded],
      ["push:resonance:subscriptions", [
        { player: "fen", endpoint: "https://push.example/fen", keys: { p256dh: "a", auth: "b" } },
        { player: "lyra", endpoint: "https://push.example/lyra", keys: { p256dh: "c", auth: "d" } },
      ]],
    ]);
    t.mock.module("../lib/redis.js", {
      exports: {
        getState: async (k) => store.get(k),
        setState: async (k, v) => store.set(k, v),
        redisCommand: mockRedisCommand(),
      },
    });
    mockGemini(t, "The evening carries on for both of them.");
    let sentTo = [];
    t.mock.module("web-push", {
      exports: { setVapidDetails: () => {}, sendNotification: async (sub) => { sentTo.push(sub.endpoint); return {}; } },
    });

    await callGm({ player: "fen", message: "I wipe down the bar", type: "action" });
    await callGm({ player: "lyra", message: "I read my book quietly", type: "action" });

    assert.deepEqual(sentTo, []);
  } finally {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  }
});
