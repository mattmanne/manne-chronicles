const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

function callUnlock(t, req) {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  const handler = freshRequire("../api/unlock.js");
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("accepts the correct PIN", async (t) => {
  process.env.ADULT_PIN = "1234";
  try {
    const res = await callUnlock(t, { method: "POST", headers: {}, body: { pin: "1234" } });
    assert.equal(res.body.ok, true);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("rejects the wrong PIN with 401, without leaking the real one", async (t) => {
  process.env.ADULT_PIN = "1234";
  try {
    const res = await callUnlock(t, { method: "POST", headers: {}, body: { pin: "0000" } });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.ok, false);
    assert.doesNotMatch(JSON.stringify(res.body), /1234/);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("tolerates surrounding whitespace on the submitted PIN", async (t) => {
  process.env.ADULT_PIN = "1234";
  try {
    const res = await callUnlock(t, { method: "POST", headers: {}, body: { pin: "  1234  " } });
    assert.equal(res.body.ok, true);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("rejects a missing PIN", async (t) => {
  process.env.ADULT_PIN = "1234";
  try {
    const res = await callUnlock(t, { method: "POST", headers: {}, body: {} });
    assert.equal(res.statusCode, 401);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("fails closed (500) when ADULT_PIN isn't configured at all, even with a submitted pin", async (t) => {
  delete process.env.ADULT_PIN;
  const res = await callUnlock(t, { method: "POST", headers: {}, body: { pin: "anything" } });
  assert.equal(res.statusCode, 500);
});

test("rejects non-POST methods", async (t) => {
  const res = await callUnlock(t, { method: "GET", headers: {}, body: {} });
  assert.equal(res.statusCode, 405);
});

test("OPTIONS preflight succeeds with no auth or rate-limit check", async (t) => {
  const res = await callUnlock(t, { method: "OPTIONS", headers: {} });
  assert.equal(res.statusCode, 200);
});

test("rate-limits repeated WRONG PIN attempts from the same IP — a 4-digit PIN is only 10,000 combinations, so this must not be guessable at will", async (t) => {
  process.env.ADULT_PIN = "1234";
  try {
    const redis = statefulRedisMock(null);
    t.mock.module("../lib/redis.js", redis);
    const handler = freshRequire("../api/unlock.js");
    const attempt = (pin) => handler({ method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: { pin } }, mockRes());

    for (let i = 0; i < 5; i++) await attempt("0000"); // exhausts the 5/60s limit
    const res = await attempt("0000");
    assert.equal(res.statusCode, 429);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("the CORRECT pin is never throttled, even right after exhausting the wrong-guess limit from the same IP — Matt's whole family shares one home IP", async (t) => {
  process.env.ADULT_PIN = "1234";
  try {
    const redis = statefulRedisMock(null);
    t.mock.module("../lib/redis.js", redis);
    const handler = freshRequire("../api/unlock.js");
    const attempt = (pin) => handler({ method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: { pin } }, mockRes());

    for (let i = 0; i < 5; i++) await attempt("0000"); // exhausts the wrong-guess limit
    const res = await attempt("1234"); // correct pin, same IP, same moment
    assert.equal(res.body.ok, true);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("rate limit is tracked per IP — a different IP is unaffected by another IP's wrong guesses", async (t) => {
  process.env.ADULT_PIN = "1234";
  try {
    const redis = statefulRedisMock(null);
    t.mock.module("../lib/redis.js", redis);
    const handler = freshRequire("../api/unlock.js");
    const attempt = (ip, pin) => handler({ method: "POST", headers: { "x-forwarded-for": ip }, body: { pin } }, mockRes());

    for (let i = 0; i < 5; i++) await attempt("1.1.1.1", "0000");
    const res = await attempt("2.2.2.2", "0000");
    assert.equal(res.statusCode, 401); // still a normal wrong-pin rejection, not yet rate-limited
  } finally {
    delete process.env.ADULT_PIN;
  }
});
