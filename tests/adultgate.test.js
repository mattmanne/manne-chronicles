const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isAdultWorld } = require("../lib/adultgate");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

// checkAdultAccess is now async (it rate-limits wrong-pin attempts via
// lib/ratelimit.js, which needs lib/redis.js) — freshRequire + a redis mock
// per test, same pattern every other Redis-touching module test uses.
function getCheckAdultAccess(t) {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  return freshRequire("../lib/adultgate").checkAdultAccess;
}

test("resonance is always adult, regardless of gameState", () => {
  assert.equal(isAdultWorld({ id: "resonance" }, {}), true);
  assert.equal(isAdultWorld({ id: "resonance" }, null), true);
});

test("manlandia is never adult", () => {
  assert.equal(isAdultWorld({ id: "manlandia" }, {}), false);
});

test("a custom world is adult only when its own worldConfig.adult is true", () => {
  assert.equal(isAdultWorld({ type: "custom" }, { worldConfig: { adult: true } }), true);
  assert.equal(isAdultWorld({ type: "custom" }, { worldConfig: { adult: false } }), false);
  assert.equal(isAdultWorld({ type: "custom" }, { worldConfig: {} }), false);
  assert.equal(isAdultWorld({ type: "custom" }, {}), false);
  assert.equal(isAdultWorld({ type: "custom" }, null), false);
});

test("checkAdultAccess allows non-adult worlds through with no header at all", async (t) => {
  const checkAdultAccess = getCheckAdultAccess(t);
  const res = mockRes();
  const allowed = await checkAdultAccess({ headers: {} }, res, { id: "manlandia" }, {});
  assert.equal(allowed, true);
  assert.equal(res.body, null);
});

test("checkAdultAccess rejects an adult world with a missing or wrong pin header", async (t) => {
  const checkAdultAccess = getCheckAdultAccess(t);
  process.env.ADULT_PIN = "5414";
  try {
    const noHeader = mockRes();
    assert.equal(await checkAdultAccess({ headers: {} }, noHeader, { id: "resonance" }, {}), false);
    assert.equal(noHeader.statusCode, 403);

    const wrongHeader = mockRes();
    assert.equal(await checkAdultAccess({ headers: { "x-adult-pin": "0000" } }, wrongHeader, { id: "resonance" }, {}), false);
    assert.equal(wrongHeader.statusCode, 403);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("checkAdultAccess allows an adult world through with the correct pin header", async (t) => {
  const checkAdultAccess = getCheckAdultAccess(t);
  process.env.ADULT_PIN = "5414";
  try {
    const res = mockRes();
    const allowed = await checkAdultAccess({ headers: { "x-adult-pin": "5414" } }, res, { id: "resonance" }, {});
    assert.equal(allowed, true);
    assert.equal(res.body, null);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("checkAdultAccess fails closed (denies) when ADULT_PIN isn't configured at all", async (t) => {
  const checkAdultAccess = getCheckAdultAccess(t);
  delete process.env.ADULT_PIN;
  const res = mockRes();
  const allowed = await checkAdultAccess({ headers: { "x-adult-pin": "anything" } }, res, { id: "resonance" }, {});
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
});

/* ── Rate limiting on wrong-pin guesses (not on correct/legitimate calls) ── */

test("repeated wrong guesses from the same IP eventually get 429'd instead of 403", async (t) => {
  const checkAdultAccess = getCheckAdultAccess(t);
  process.env.ADULT_PIN = "5414";
  try {
    const attempt = () => checkAdultAccess(
      { headers: { "x-adult-pin": "0000", "x-forwarded-for": "9.9.9.9" } },
      mockRes(), { id: "resonance" }, {}
    );
    for (let i = 0; i < 5; i++) await attempt(); // exhausts the 5/60s limit
    const res = mockRes();
    const allowed = await checkAdultAccess(
      { headers: { "x-adult-pin": "0000", "x-forwarded-for": "9.9.9.9" } },
      res, { id: "resonance" }, {}
    );
    assert.equal(allowed, false);
    assert.equal(res.statusCode, 429);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("a device with the CORRECT pin is never throttled, no matter how many times it's called", async (t) => {
  const checkAdultAccess = getCheckAdultAccess(t);
  process.env.ADULT_PIN = "5414";
  try {
    for (let i = 0; i < 20; i++) {
      const res = mockRes();
      const allowed = await checkAdultAccess(
        { headers: { "x-adult-pin": "5414", "x-forwarded-for": "1.2.3.4" } },
        res, { id: "resonance" }, {}
      );
      assert.equal(allowed, true, `call #${i + 1} with the correct pin should never be throttled`);
    }
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("the wrong-guess rate limit is tracked per IP", async (t) => {
  const checkAdultAccess = getCheckAdultAccess(t);
  process.env.ADULT_PIN = "5414";
  try {
    const attemptFrom = (ip) => checkAdultAccess(
      { headers: { "x-adult-pin": "0000", "x-forwarded-for": ip } },
      mockRes(), { id: "resonance" }, {}
    );
    for (let i = 0; i < 5; i++) await attemptFrom("1.1.1.1");
    const res = mockRes();
    await checkAdultAccess(
      { headers: { "x-adult-pin": "0000", "x-forwarded-for": "2.2.2.2" } },
      res, { id: "resonance" }, {}
    );
    assert.equal(res.statusCode, 403); // still a normal wrong-pin rejection, not yet rate-limited
  } finally {
    delete process.env.ADULT_PIN;
  }
});
