const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

const ADULT_PIN = "0000";

function freshHandler() {
  return freshRequire("../api/recap.js");
}

test("returns a recap string built from the session transcript", async (t) => {
  let receivedSystemPrompt = null;
  const gameState = {
    sessionLog: [
      { role: "user", player: "player1", content: "We entered the village." },
      { role: "gm", content: "Bramble greeted the heroes warmly." },
    ],
    worldState: {},
  };
  t.mock.module("../lib/redis.js", statefulRedisMock(gameState));
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async (systemPrompt) => {
        receivedSystemPrompt = systemPrompt;
        return "  The heroes arrived and met Bramble.  ";
      },
    },
  });

  const handler = freshHandler();
  const req = { method: "GET", headers: {}, query: { world: "manlandia" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.body.recap, "The heroes arrived and met Bramble.");
  assert.match(receivedSystemPrompt, /child aged 8/);
});

test("uses adult-tone copy for the resonance world, once unlocked with the adult pin", async (t) => {
  process.env.ADULT_PIN = ADULT_PIN;
  try {
    let receivedSystemPrompt = null;
    const gameState = { sessionLog: [{ role: "gm", content: "The pub was quiet." }], worldState: {} };
    t.mock.module("../lib/redis.js", statefulRedisMock(gameState));
    t.mock.module("../lib/gemini.js", {
      exports: { generateContent: async (systemPrompt) => { receivedSystemPrompt = systemPrompt; return "Recap text."; } },
    });

    const handler = freshHandler();
    const req = { method: "GET", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" } };
    const res = mockRes();
    await handler(req, res);

    assert.doesNotMatch(receivedSystemPrompt, /child aged 8/);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("resonance is locked without the correct adult pin", async (t) => {
  process.env.ADULT_PIN = ADULT_PIN;
  try {
    const gameState = { sessionLog: [{ role: "gm", content: "The pub was quiet." }], worldState: {} };
    t.mock.module("../lib/redis.js", statefulRedisMock(gameState));
    t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "should not be reached" } });

    const handler = freshHandler();
    const req = { method: "GET", headers: {}, query: { world: "resonance" } };
    const res = mockRes();
    await handler(req, res);

    assert.equal(res.statusCode, 403);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("short-circuits with a friendly message when there is no history, without calling the model", async (t) => {
  let generateContentCalls = 0;
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => { generateContentCalls++; return "should not be called"; } },
  });

  const handler = freshHandler();
  const req = { method: "GET", headers: {}, query: { world: "manlandia" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(generateContentCalls, 0);
  assert.match(res.body.recap, /hasn't begun yet/);
});

test("returns a 500 with a friendly error when the model call fails", async (t) => {
  const gameState = { sessionLog: [{ role: "gm", content: "Something happened." }], worldState: {} };
  t.mock.module("../lib/redis.js", statefulRedisMock(gameState));
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => { throw new Error("Groq is down"); } },
  });

  const handler = freshHandler();
  const req = { method: "GET", headers: {}, query: { world: "manlandia" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.ok(res.body.error);
});

test("rejects non-GET methods", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "" } });

  const handler = freshHandler();
  const req = { method: "POST", headers: {}, query: { world: "manlandia" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 405);
});

test("returns 429 once the per-IP rate limit is exceeded", async (t) => {
  const gameState = { sessionLog: [{ role: "gm", content: "Something happened." }], worldState: {} };
  const redis = statefulRedisMock(gameState);
  t.mock.module("../lib/redis.js", redis);
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "Recap." } });

  const handler = freshHandler();
  for (let i = 0; i < 10; i++) {
    const res = mockRes();
    await handler({ method: "GET", headers: { "x-forwarded-for": "9.9.9.9" }, query: { world: "manlandia" } }, res);
    assert.equal(res.statusCode, 200);
  }
  const limited = mockRes();
  await handler({ method: "GET", headers: { "x-forwarded-for": "9.9.9.9" }, query: { world: "manlandia" } }, limited);
  assert.equal(limited.statusCode, 429);
});
