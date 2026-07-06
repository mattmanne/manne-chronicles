const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

function mockGemini(t, response) {
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => response } });
}

function callGm(body, world = "manlandia") {
  const handler = freshRequire("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world }, body };
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("recognizes ROLL:STAT with no brackets (the documented format)", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  mockGemini(t, "You reach for the door.\nROLL:AGILITY");
  const res = await callGm({ player: "player1", message: "open it", type: "action" });
  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "agility");
  assert.equal(res.body.response, "You reach for the door.");
});

test("fires end-to-end when the trigger is embedded mid-sentence, not alone on its own line (live: Dark Wars, 'Note: ... The roll is: ROLL: WISDOM')", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  mockGemini(t, "What do you do?\n\nNote: As you consider the offer, you roll a Wisdom check to see if you can sense any potential dangers or pitfalls. The roll is: ROLL: WISDOM");
  const res = await callGm({ player: "player1", message: "consider the offer", type: "action" });
  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "acuity");
  assert.doesNotMatch(res.body.response, /ROLL:/i);
});

test("also recognizes ROLL:[STAT] wrapped in brackets, the format the model actually produces in practice", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  mockGemini(t, "The creature's eyes lock onto you.\nROLL:[ACUITY]");
  const res = await callGm({ player: "player1", message: "watch it", type: "action" });
  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "acuity");
  assert.equal(res.body.response, "The creature's eyes lock onto you.");
});

test("is case-insensitive on the stat name", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  mockGemini(t, "You try to slip past.\nroll:[agility]");
  const res = await callGm({ player: "player1", message: "sneak", type: "action" });
  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "agility");
});

test("recognizes a bracketed ADVANTAGE roll", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  mockGemini(t, "Nobody notices you.\nROLL:[AGILITY]:ADVANTAGE");
  const res = await callGm({ player: "player1", message: "hide", type: "action" });
  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "agility");
  assert.equal(res.body.rollAdvantage, true);
});

test("fires end-to-end on a plain-prose roll request with no ROLL: tag at all (live, 2026-07-05 playtest: 'Roll a FORCE to see how well Kestra can hold her ground')", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  mockGemini(t, "The figure lunges. Roll a FORCE to see how well Kestra can hold her ground and keep the figure at bay.");
  const res = await callGm({ player: "player1", message: "brace myself", type: "action" });
  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "force");
  // Unlike a raw ROLL: tag, this prose is real narration the player should still see.
  assert.equal(res.body.response, "The figure lunges. Roll a FORCE to see how well Kestra can hold her ground and keep the figure at bay.");
});

test("a truly unrecognized stat name doesn't trigger a roll, but the stray tag is still stripped from the narration", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  mockGemini(t, "The creature's eyes lock onto you.\nROLL:[LUCK]");
  const res = await callGm({ player: "player1", message: "watch it", type: "action" });
  assert.equal(res.body.needsRoll, false);
  assert.equal(res.body.response, "The creature's eyes lock onto you.");
});

test("a D&D-style synonym like PERCEPTION maps onto the real stat instead of silently dropping the roll (live, twice, in a custom campaign)", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  mockGemini(t, "The creature's eyes lock onto you.\nROLL:[PERCEPTION]");
  const res = await callGm({ player: "player1", message: "watch it", type: "action" });
  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "acuity");
  assert.equal(res.body.response, "The creature's eyes lock onto you.");
});
