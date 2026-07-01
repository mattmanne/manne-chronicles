const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

function callPoll(stored, query) {
  return async (t) => {
    t.mock.module("../lib/redis.js", statefulRedisMock(stored));
    const handler = freshRequire("../api/poll.js");
    const req = { method: "GET", query };
    const res = mockRes();
    await handler(req, res);
    return res;
  };
}

const BASE_LOG = [
  { role: "gm", content: "old entry", timestamp: 100 },
  { role: "user", content: "new entry", timestamp: 200 },
  { role: "gm", content: "mid-roll entry", timestamp: 150, rolling: true },
];

test("resonance world exposes conclave/dissonance fields and omits villain-awareness fields", async (t) => {
  const stored = { session: 1, sessionLog: [], characters: {}, worldState: { conclave_awareness: 3, fen_dissonance_awakening: 1, location: "The Docks", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "resonance" })(t);
  assert.equal(res.body.worldState.conclave_awareness, 3);
  assert.equal(res.body.worldState.fen_dissonance_awakening, 1);
  assert.equal("villain_awareness" in res.body.worldState, false);
});

test("manlandia world includes stones_found", async (t) => {
  const stored = { session: 1, sessionLog: [], characters: {}, worldState: { villain_awareness: 2, curse_level: 1, stones_found: ["earthstone"], location: "Frost Lands", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "manlandia" })(t);
  assert.equal(res.body.worldState.villain_awareness, 2);
  assert.deepEqual(res.body.worldState.stones_found, ["earthstone"]);
});

test("custom worlds include villain/curse fields but not stones_found", async (t) => {
  const stored = { session: 1, sessionLog: [], characters: {}, worldState: { villain_awareness: 1, curse_level: 0, stones_found: ["earthstone"], location: "Somewhere", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "c_1" })(t);
  assert.equal(res.body.worldState.villain_awareness, 1);
  assert.equal("stones_found" in res.body.worldState, false);
});

test("since filters out entries at or before the given timestamp", async (t) => {
  const stored = { session: 1, sessionLog: BASE_LOG, characters: {}, worldState: { villain_awareness: 0, curse_level: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "100", world: "manlandia" })(t);
  const contents = res.body.entries.map(e => e.content);
  assert.ok(!contents.includes("old entry"));
});

test("entries flagged rolling are always excluded, regardless of timestamp", async (t) => {
  const stored = { session: 1, sessionLog: BASE_LOG, characters: {}, worldState: { villain_awareness: 0, curse_level: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "manlandia" })(t);
  const contents = res.body.entries.map(e => e.content);
  assert.ok(!contents.includes("mid-roll entry"));
  assert.ok(contents.includes("old entry"));
  assert.ok(contents.includes("new entry"));
});

test("since defaults to 0 when omitted, returning the full log (minus rolling entries)", async (t) => {
  const stored = { session: 1, sessionLog: BASE_LOG, characters: {}, worldState: { villain_awareness: 0, curse_level: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { world: "manlandia" })(t);
  assert.equal(res.body.entries.length, 2);
});
