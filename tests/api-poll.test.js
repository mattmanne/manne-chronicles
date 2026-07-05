const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

// Resonance is always adult-gated — set once so the resonance-world test below
// (which isn't testing the gate itself) can pass the check.
const ADULT_PIN = "0000";
process.env.ADULT_PIN = ADULT_PIN;

function callPoll(stored, query) {
  return async (t) => {
    t.mock.module("../lib/redis.js", statefulRedisMock(stored));
    const handler = freshRequire("../api/poll.js");
    const req = { method: "GET", headers: { "x-adult-pin": ADULT_PIN }, query };
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

test("a trailing rolling entry with a persisted rollStat is surfaced as pendingRoll", async (t) => {
  const log = [
    { role: "user", content: "Player1: push on", player: "player1", timestamp: 100, rolling: true },
    { role: "gm", content: "You push toward the ledge.", timestamp: 100, rolling: true, rollStat: "AGILITY", rollAdvantage: false },
  ];
  const stored = { session: 1, sessionLog: log, characters: {}, worldState: { villain_awareness: 0, curse_level: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "manlandia" })(t);
  assert.deepEqual(res.body.pendingRoll, { stat: "AGILITY", advantage: false, player: "player1" });
});

test("a trailing rolling entry with no rollStat (a pre-fix stuck entry) is not surfaced", async (t) => {
  const stored = { session: 1, sessionLog: BASE_LOG, characters: {}, worldState: { villain_awareness: 0, curse_level: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "manlandia" })(t);
  assert.equal(res.body.pendingRoll, null);
});

test("a resolved turn after the rolling pair means no pendingRoll, even though an older rolling entry exists", async (t) => {
  const log = [
    ...BASE_LOG,
    { role: "user", content: "Player1: something else", player: "player1", timestamp: 300 },
    { role: "gm", content: "A new scene unfolds.", timestamp: 300 },
  ];
  const stored = { session: 1, sessionLog: log, characters: {}, worldState: { villain_awareness: 0, curse_level: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "manlandia" })(t);
  assert.equal(res.body.pendingRoll, null);
});

test("last_actor is exposed for all three world types", async (t) => {
  const stored = { session: 1, sessionLog: [], characters: {}, worldState: { villain_awareness: 0, curse_level: 0, location: "x", visited_locations: [], location_scars: [], last_actor: "player2" } };
  const res = await callPoll(stored, { since: "0", world: "manlandia" })(t);
  assert.equal(res.body.worldState.last_actor, "player2");
});

test("last_actor defaults to null when never set", async (t) => {
  const stored = { session: 1, sessionLog: [], characters: {}, worldState: { conclave_awareness: 0, fen_dissonance_awakening: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "resonance" })(t);
  assert.equal(res.body.worldState.last_actor, null);
});

/* ── Solo/private scenes ── */

const PRIVATE_LOG = [
  { role: "user", content: "Lyra: I go alone", player: "lyra", timestamp: 100, private_to: "lyra" },
  { role: "gm", content: "You slip away unnoticed.", timestamp: 100, private_to: "lyra" },
  { role: "user", content: "Fen: I pour a drink", player: "fen", timestamp: 200 },
  { role: "gm", content: "Business as usual at the bar.", timestamp: 200 },
];

test("a private_to entry is visible to the character it's private to", async (t) => {
  const stored = { session: 1, sessionLog: PRIVATE_LOG, characters: {}, worldState: { conclave_awareness: 0, fen_dissonance_awakening: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "resonance", player: "lyra" })(t);
  const contents = res.body.entries.map(e => e.content);
  assert.ok(contents.includes("You slip away unnoticed."));
  assert.ok(contents.includes("Business as usual at the bar."));
});

test("a private_to entry is hidden from the OTHER character", async (t) => {
  const stored = { session: 1, sessionLog: PRIVATE_LOG, characters: {}, worldState: { conclave_awareness: 0, fen_dissonance_awakening: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "resonance", player: "fen" })(t);
  const contents = res.body.entries.map(e => e.content);
  assert.ok(!contents.includes("You slip away unnoticed."));
  assert.ok(contents.includes("Business as usual at the bar.")); // non-private entries stay visible to everyone
});

test("omitting the player param hides private entries by default (safe default for any caller that doesn't identify a viewer)", async (t) => {
  const stored = { session: 1, sessionLog: PRIVATE_LOG, characters: {}, worldState: { conclave_awareness: 0, fen_dissonance_awakening: 0, location: "x", visited_locations: [], location_scars: [] } };
  const res = await callPoll(stored, { since: "0", world: "resonance" })(t);
  const contents = res.body.entries.map(e => e.content);
  assert.equal(res.body.entries.length, 2);
  assert.ok(contents.includes("Business as usual at the bar.")); // non-private entries are unaffected
});

test("resonance is locked to reads without the correct adult pin", async (t) => {
  const stored = { session: 1, sessionLog: [], characters: {}, worldState: { conclave_awareness: 0 } };
  t.mock.module("../lib/redis.js", statefulRedisMock(stored));
  const handler = freshRequire("../api/poll.js");
  const req = { method: "GET", headers: {}, query: { since: "0", world: "resonance" } };
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
});
