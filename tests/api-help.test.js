const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

function callHelp(req) {
  const handler = freshRequire("../api/help.js");
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("answers a question for a non-adult world with no pin needed", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "Agility is how nimble you are." } });

  const res = await callHelp({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { question: "What is Agility?" } });
  assert.equal(res.body.answer, "Agility is how nimble you are.");
});

test("resonance help is locked without the correct adult pin", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "should not be reached" } });

  const res = await callHelp({ method: "POST", headers: {}, query: { world: "resonance" }, body: { question: "What has happened so far?" } });
  assert.equal(res.statusCode, 403);
});

test("resonance help works once the correct adult pin is supplied", async (t) => {
  process.env.ADULT_PIN = "0000";
  try {
    t.mock.module("../lib/redis.js", statefulRedisMock(null));
    t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "The Conclave rules Varek." } });

    const res = await callHelp({ method: "POST", headers: { "x-adult-pin": "0000" }, query: { world: "resonance" }, body: { question: "Who rules Varek?" } });
    assert.equal(res.body.answer, "The Conclave rules Varek.");
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("returns 429 once the per-IP rate limit is exceeded", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "An answer." } });

  const handler = freshRequire("../api/help.js");
  for (let i = 0; i < 10; i++) {
    const res = mockRes();
    await handler({ method: "POST", headers: { "x-forwarded-for": "8.8.8.8" }, query: { world: "manlandia" }, body: { question: "Q" } }, res);
    assert.equal(res.statusCode, 200);
  }
  const limited = mockRes();
  await handler({ method: "POST", headers: { "x-forwarded-for": "8.8.8.8" }, query: { world: "manlandia" }, body: { question: "Q" } }, limited);
  assert.equal(limited.statusCode, 429);
});

test("rejects a question over 500 characters", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "x" } });

  const res = await callHelp({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { question: "a".repeat(501) } });
  assert.equal(res.statusCode, 400);
});

test("rejects non-POST methods", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "x" } });

  const res = await callHelp({ method: "GET", headers: {}, query: { world: "manlandia" }, body: {} });
  assert.equal(res.statusCode, 405);
});
