const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, keyedRedisMock } = require("./helpers");

function withVapidConfigured(fn) {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  return fn().finally(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });
}

function mockGemini(t, response) {
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => response } });
}

function callGm(redis, body, world = "manlandia") {
  const handler = freshRequire("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world }, body };
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("sends a notification to the other subscribed player, but not the sender, on a resolved turn", async (t) => {
  await withVapidConfigured(async () => {
    const seeded = {
      "manlandia:gamestate": null,
      "push:manlandia:subscriptions": [
        { player: "player1", endpoint: "https://push.example/sender", keys: { p256dh: "a", auth: "b" } },
        { player: "player2", endpoint: "https://push.example/other", keys: { p256dh: "c", auth: "d" } },
      ],
    };
    const redis = keyedRedisMock(seeded);
    t.mock.module("../lib/redis.js", redis);
    mockGemini(t, "Nothing risky happens.");

    let sentTo = [];
    t.mock.module("web-push", {
      exports: {
        setVapidDetails: () => {},
        sendNotification: async (sub) => { sentTo.push(sub.endpoint); return {}; },
      },
    });

    await callGm(redis, { player: "player1", message: "look around", type: "action" });
    assert.deepEqual(sentTo, ["https://push.example/other"]);
  });
});

test("does not send any notification while a roll is pending (needsRoll true)", async (t) => {
  await withVapidConfigured(async () => {
    const seeded = {
      "manlandia:gamestate": null,
      "push:manlandia:subscriptions": [
        { player: "player2", endpoint: "https://push.example/other", keys: { p256dh: "c", auth: "d" } },
      ],
    };
    const redis = keyedRedisMock(seeded);
    t.mock.module("../lib/redis.js", redis);
    mockGemini(t, "You reach for the door.\nROLL:AGILITY");

    let sendCalls = 0;
    t.mock.module("web-push", {
      exports: { setVapidDetails: () => {}, sendNotification: async () => { sendCalls++; return {}; } },
    });

    await callGm(redis, { player: "player1", message: "open the door", type: "action" });
    assert.equal(sendCalls, 0);
  });
});

test("sends a notification for the roll_result follow-up turn (the turn is resolved by then)", async (t) => {
  await withVapidConfigured(async () => {
    const seeded = {
      "manlandia:gamestate": null,
      "push:manlandia:subscriptions": [
        { player: "player2", endpoint: "https://push.example/other", keys: { p256dh: "c", auth: "d" } },
      ],
    };
    const redis = keyedRedisMock(seeded);
    t.mock.module("../lib/redis.js", redis);
    mockGemini(t, "The door creaks open.");

    let sendCalls = 0;
    t.mock.module("web-push", {
      exports: { setVapidDetails: () => {}, sendNotification: async () => { sendCalls++; return {}; } },
    });

    await callGm(redis, { player: "player1", message: "rolled a 9", type: "roll_result" });
    assert.equal(sendCalls, 1);
  });
});

test("does nothing (no error) when nobody has subscribed to this world", async (t) => {
  await withVapidConfigured(async () => {
    const redis = keyedRedisMock({ "manlandia:gamestate": null });
    t.mock.module("../lib/redis.js", redis);
    mockGemini(t, "Fine.");
    t.mock.module("web-push", { exports: { setVapidDetails: () => {}, sendNotification: async () => ({}) } });

    const res = await callGm(redis, { player: "player1", message: "hi", type: "action" });
    assert.equal(res.statusCode, 200);
  });
});

test("removes a subscription that comes back as gone (410), keeps the others", async (t) => {
  await withVapidConfigured(async () => {
    const seeded = {
      "manlandia:gamestate": null,
      "push:manlandia:subscriptions": [
        { player: "player2", endpoint: "https://push.example/dead", keys: { p256dh: "c", auth: "d" } },
        { player: "player3", endpoint: "https://push.example/alive", keys: { p256dh: "e", auth: "f" } },
      ],
    };
    const redis = keyedRedisMock(seeded);
    t.mock.module("../lib/redis.js", redis);
    mockGemini(t, "Fine.");
    t.mock.module("web-push", {
      exports: {
        setVapidDetails: () => {},
        sendNotification: async (sub) => {
          if (sub.endpoint === "https://push.example/dead") {
            const err = new Error("Gone"); err.statusCode = 410; throw err;
          }
          return {};
        },
      },
    });

    await callGm(redis, { player: "player1", message: "hi", type: "action" });
    const remaining = redis.get("push:manlandia:subscriptions");
    assert.deepEqual(remaining.map((s) => s.endpoint), ["https://push.example/alive"]);
  });
});

test("does not send any notification for a private scene, even though the turn is fully resolved", async (t) => {
  await withVapidConfigured(async () => {
    process.env.ADULT_PIN = "0000";
    try {
      const seeded = {
        "resonance:gamestate": null,
        "push:resonance:subscriptions": [
          { player: "fen", endpoint: "https://push.example/fen-device", keys: { p256dh: "a", auth: "b" } },
        ],
      };
      const redis = keyedRedisMock(seeded);
      t.mock.module("../lib/redis.js", redis);
      mockGemini(t, "You slip away unnoticed.");

      let sendCalls = 0;
      t.mock.module("web-push", {
        exports: { setVapidDetails: () => {}, sendNotification: async () => { sendCalls++; return {}; } },
      });

      const handler = freshRequire("../api/gm.js");
      const req = { method: "POST", headers: { "x-adult-pin": "0000" }, query: { world: "resonance" }, body: { player: "lyra", message: "I go alone", type: "action", private: true } };
      await handler(req, mockRes());
      assert.equal(sendCalls, 0);
    } finally {
      delete process.env.ADULT_PIN;
    }
  });
});

test("skips sending entirely when VAPID isn't configured, without erroring", async (t) => {
  const redis = keyedRedisMock({
    "manlandia:gamestate": null,
    "push:manlandia:subscriptions": [{ player: "player2", endpoint: "x", keys: { p256dh: "a", auth: "b" } }],
  });
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, "Fine.");
  let sendCalls = 0;
  t.mock.module("web-push", { exports: { setVapidDetails: () => {}, sendNotification: async () => { sendCalls++; return {}; } } });

  const res = await callGm(redis, { player: "player1", message: "hi", type: "action" });
  assert.equal(res.statusCode, 200);
  assert.equal(sendCalls, 0);
});
