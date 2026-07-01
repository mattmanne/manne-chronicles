const { test } = require("node:test");
const assert = require("node:assert/strict");

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { this.ended = true; },
  };
}

function freshHandler(modPath) {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function mockRedisAndGemini(t, gmResponseText) {
  t.mock.module("../lib/redis.js", {
    exports: { getState: async () => null, setState: async () => {} },
  });
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => gmResponseText },
  });
}

test("action turn returns parsed suggestions and strips the tag from the narration", async (t) => {
  mockRedisAndGemini(t, "You arrive at the village.\n\n[SUGGESTIONS: Look around | Talk to Bramble | Check your gear]");
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.deepEqual(res.body.suggestions, ["Look around", "Talk to Bramble", "Check your gear"]);
  assert.equal(res.body.response, "You arrive at the village.");
  assert.equal(res.body.needsRoll, false);
});

test("a roll-request turn forces suggestions to be empty even if the model includes the tag", async (t) => {
  mockRedisAndGemini(t, "You reach for the door.\nROLL:AGILITY\n[SUGGESTIONS: Push harder | Look for another way]");
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I open the door", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "agility");
  assert.deepEqual(res.body.suggestions, []);
  assert.equal(res.body.response, "You reach for the door.");
});

test("a roll_result turn forces suggestions to be empty", async (t) => {
  mockRedisAndGemini(t, "The door creaks open. [SUGGESTIONS: Step inside | Listen first]");
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "rolled a 9", type: "roll_result" } };
  const res = mockRes();
  await handler(req, res);

  assert.deepEqual(res.body.suggestions, []);
  assert.equal(res.body.response, "The door creaks open.");
});

test("no suggestions tag present yields an empty array", async (t) => {
  mockRedisAndGemini(t, "Nothing else happens.");
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "wait", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.deepEqual(res.body.suggestions, []);
});
