const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isAdultWorld, checkAdultAccess } = require("../lib/adultgate");
const { mockRes } = require("./helpers");

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

test("checkAdultAccess allows non-adult worlds through with no header at all", () => {
  const res = mockRes();
  const allowed = checkAdultAccess({ headers: {} }, res, { id: "manlandia" }, {});
  assert.equal(allowed, true);
  assert.equal(res.body, null);
});

test("checkAdultAccess rejects an adult world with a missing or wrong pin header", () => {
  process.env.ADULT_PIN = "5414";
  try {
    const noHeader = mockRes();
    assert.equal(checkAdultAccess({ headers: {} }, noHeader, { id: "resonance" }, {}), false);
    assert.equal(noHeader.statusCode, 403);

    const wrongHeader = mockRes();
    assert.equal(checkAdultAccess({ headers: { "x-adult-pin": "0000" } }, wrongHeader, { id: "resonance" }, {}), false);
    assert.equal(wrongHeader.statusCode, 403);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("checkAdultAccess allows an adult world through with the correct pin header", () => {
  process.env.ADULT_PIN = "5414";
  try {
    const res = mockRes();
    const allowed = checkAdultAccess({ headers: { "x-adult-pin": "5414" } }, res, { id: "resonance" }, {});
    assert.equal(allowed, true);
    assert.equal(res.body, null);
  } finally {
    delete process.env.ADULT_PIN;
  }
});

test("checkAdultAccess fails closed (denies) when ADULT_PIN isn't configured at all", () => {
  delete process.env.ADULT_PIN;
  const res = mockRes();
  const allowed = checkAdultAccess({ headers: { "x-adult-pin": "anything" } }, res, { id: "resonance" }, {});
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
});
