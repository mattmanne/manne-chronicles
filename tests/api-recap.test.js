const { test } = require("node:test");
const assert = require("node:assert/strict");

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() {},
  };
}

function freshHandler() {
  delete require.cache[require.resolve("../api/recap.js")];
  return require("../api/recap.js");
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
  t.mock.module("../lib/redis.js", { exports: { getState: async () => gameState } });
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async (systemPrompt) => {
        receivedSystemPrompt = systemPrompt;
        return "  The heroes arrived and met Bramble.  ";
      },
    },
  });

  const handler = freshHandler();
  const req = { method: "GET", query: { world: "manlandia" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.body.recap, "The heroes arrived and met Bramble.");
  assert.match(receivedSystemPrompt, /child aged 8/);
});

test("uses adult-tone copy for the resonance world", async (t) => {
  let receivedSystemPrompt = null;
  const gameState = { sessionLog: [{ role: "gm", content: "The pub was quiet." }], worldState: {} };
  t.mock.module("../lib/redis.js", { exports: { getState: async () => gameState } });
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async (systemPrompt) => { receivedSystemPrompt = systemPrompt; return "Recap text."; } },
  });

  const handler = freshHandler();
  const req = { method: "GET", query: { world: "resonance" } };
  const res = mockRes();
  await handler(req, res);

  assert.doesNotMatch(receivedSystemPrompt, /child aged 8/);
});

test("short-circuits with a friendly message when there is no history, without calling the model", async (t) => {
  let generateContentCalls = 0;
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null } });
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => { generateContentCalls++; return "should not be called"; } },
  });

  const handler = freshHandler();
  const req = { method: "GET", query: { world: "manlandia" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(generateContentCalls, 0);
  assert.match(res.body.recap, /hasn't begun yet/);
});

test("returns a 500 with a friendly error when the model call fails", async (t) => {
  const gameState = { sessionLog: [{ role: "gm", content: "Something happened." }], worldState: {} };
  t.mock.module("../lib/redis.js", { exports: { getState: async () => gameState } });
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => { throw new Error("Groq is down"); } },
  });

  const handler = freshHandler();
  const req = { method: "GET", query: { world: "manlandia" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.ok(res.body.error);
});

test("rejects non-GET methods", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null } });
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "" } });

  const handler = freshHandler();
  const req = { method: "POST", query: { world: "manlandia" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 405);
});
