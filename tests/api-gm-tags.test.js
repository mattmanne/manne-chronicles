const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

// Resonance is always adult-gated — set once so every resonance-world test
// below (none of which are testing the gate itself) can pass the check.
const ADULT_PIN = "0000";
process.env.ADULT_PIN = ADULT_PIN;

function mockGemini(t, responses) {
  const queue = [...responses];
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => queue.shift() },
  });
}

function callGm(body, world = "manlandia") {
  const handler = freshRequire("../api/gm.js");
  const req = { method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world }, body };
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("LOCATION tag sets location and dedups visited_locations across turns", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "You arrive at the Frost Lands. [LOCATION: Frost Lands]",
    "The wind howls again. [LOCATION: Frost Lands]",
  ]);

  const res1 = await callGm({ player: "player1", message: "go north", type: "action" });
  assert.equal(res1.body.gameState.worldState.location, "Frost Lands");
  assert.equal(res1.body.gameState.worldState.visited_locations.filter(l => l === "frost-lands").length, 1);

  const res2 = await callGm({ player: "player1", message: "look around", type: "action" });
  assert.equal(res2.body.gameState.worldState.visited_locations.filter(l => l === "frost-lands").length, 1);
});

test("LOCATION tag populates visited_locations for custom worlds too, keyed by the location's own text (no fixed place list to match against)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "You arrive at the Whispering Bog. [LOCATION: Whispering Bog]",
    "Still here. [LOCATION: Whispering Bog]",
    "You push onward. [LOCATION: Dragon's Spire]",
  ]);

  const res1 = await callGm({ player: "player1", message: "explore", type: "action" }, "c_test");
  assert.deepEqual(res1.body.gameState.worldState.visited_locations, ["Whispering Bog"]);

  const res2 = await callGm({ player: "player1", message: "look around", type: "action" }, "c_test");
  assert.deepEqual(res2.body.gameState.worldState.visited_locations, ["Whispering Bog"]);

  const res3 = await callGm({ player: "player1", message: "continue", type: "action" }, "c_test");
  assert.deepEqual(res3.body.gameState.worldState.visited_locations, ["Whispering Bog", "Dragon's Spire"]);
});

test("SCAR tag adds a location scar and dedups identical scars", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "The ice cracks ominously. [SCAR: Frost Lands: Ice cracked open]",
    "Nothing new happens. [SCAR: Frost Lands: Ice cracked open]",
  ]);

  const res1 = await callGm({ player: "player1", message: "strike the ice", type: "action" });
  assert.deepEqual(res1.body.gameState.worldState.location_scars, [{ id: "frost-lands", label: "Ice cracked open" }]);

  const res2 = await callGm({ player: "player1", message: "strike again", type: "action" });
  assert.equal(res2.body.gameState.worldState.location_scars.length, 1);
});

test("SCAR tag works for custom worlds too, keyed by the location's own text", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["The bridge collapses! [SCAR: Whispering Bog: Bridge collapsed]"]);

  const res = await callGm({ player: "player1", message: "cross the bridge", type: "action" }, "c_test");
  assert.deepEqual(res.body.gameState.worldState.location_scars, [{ id: "Whispering Bog", label: "Bridge collapsed" }]);
});

test("CHARACTER tag updates the named hero's harm (Manlandia)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Taisha stumbles, hurt. [CHARACTER 2: Unhurt → Hurt]"]);

  const res = await callGm({ player: "player1", message: "push forward", type: "action" });
  assert.equal(res.body.gameState.characters.player2.harm, "Hurt");
  assert.equal(res.body.gameState.characters.player1.harm, "Unhurt");
});

test("ABILITY N: used tag marks the hero's power as spent (Manlandia)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Isibel unleashes her power! [ABILITY 3: used]"]);

  const res = await callGm({ player: "player3", message: "use my power", type: "action" });
  assert.equal(res.body.gameState.characters.player3.ability_used, true);
});

test("VILLAIN AWARENESS and CURSE tags update world state (Manlandia)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Something watches from the mist. [VILLAIN AWARENESS: 0 → 1]\n[CURSE: 0 → 2]"]);

  const res = await callGm({ player: "player1", message: "explore", type: "action" });
  assert.equal(res.body.gameState.worldState.villain_awareness, 1);
  assert.equal(res.body.gameState.worldState.curse_level, 2);
});

test("STONE FOUND tag adds a stone and dedups across turns (Manlandia only)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "You find the Earthstone! [STONE FOUND: earthstone]",
    "Nothing else here. [STONE FOUND: earthstone]",
  ]);

  const res1 = await callGm({ player: "player1", message: "search", type: "action" });
  assert.deepEqual(res1.body.gameState.worldState.stones_found, ["earthstone"]);

  const res2 = await callGm({ player: "player1", message: "search more", type: "action" });
  assert.deepEqual(res2.body.gameState.worldState.stones_found, ["earthstone"]);
});

test("OBJECTIVE tags add and complete quest goals, generalized to every world type", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "Bramble asks for your help. [OBJECTIVE: Find the lost stones]",
    "You found one! [OBJECTIVE COMPLETE: Find the lost stones]",
  ]);

  const res1 = await callGm({ player: "player1", message: "talk to Bramble", type: "action" });
  assert.deepEqual(res1.body.gameState.worldState.objectives, [{ text: "Find the lost stones", done: false }]);

  const res2 = await callGm({ player: "player1", message: "search the cave", type: "action" });
  assert.deepEqual(res2.body.gameState.worldState.objectives, [{ text: "Find the lost stones", done: true }]);
});

test("OBJECTIVE tags work for Resonance too, not just Manlandia/custom", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A lead emerges. [OBJECTIVE: Track down the informant]"]);

  const res = await callGm({ player: "fen", message: "investigate", type: "action" }, "resonance");
  assert.deepEqual(res.body.gameState.worldState.objectives, [{ text: "Track down the informant", done: false }]);
});

test("an OBJECTIVE tag in a roll-request turn is deferred until the roll resolves, same as other state tags", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "A new lead appears. [OBJECTIVE: Track down the informant]\nROLL:ACUITY",
    "You piece it together.",
  ]);

  const res1 = await callGm({ player: "player1", message: "investigate", type: "action" });
  assert.equal(res1.body.needsRoll, true);
  assert.deepEqual(res1.body.gameState.worldState.objectives, []);

  const res2 = await callGm({ player: "player1", message: "rolled a 9", type: "roll_result" });
  assert.deepEqual(res2.body.gameState.worldState.objectives, [{ text: "Track down the informant", done: false }]);
});

test("XP N tag awards bonus XP on top of any baseline already accumulated (Manlandia)", async (t) => {
  const seeded = require("../lib/gamestate-manlandia").getInitialStateManlandia();
  seeded.characters.player1 = { ...seeded.characters.player1, archetype: "fighter", ability_id: "lucky_break", xp: 5 };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Great thinking! [XP 1: +10]"]);

  const res = await callGm({ player: "player1", message: "clever plan", type: "action" });
  assert.equal(res.body.gameState.characters.player1.xp, 15);
});

test("XP tag is ignored for Resonance (no unlockable ability pool to grow into)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A clever plan. [XP 1: +10]"]);

  const res = await callGm({ player: "fen", message: "clever plan", type: "action" }, "resonance");
  assert.equal(res.body.gameState.characters.fen.xp, undefined);
});

test("CONCLAVE AWARENESS and DISSONANCE tags update world state (Resonance)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A Warden's gaze lingers. [CONCLAVE AWARENESS: 0 → 1]\n[DISSONANCE: 0 → 1]"]);

  const res = await callGm({ player: "fen", message: "slip past the warden", type: "action" }, "resonance");
  assert.equal(res.body.gameState.worldState.conclave_awareness, 1);
  assert.equal(res.body.gameState.worldState.fen_dissonance_awakening, 1);
});

test("LYRA/FEN harm tag updates the named character (Resonance)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Lyra takes a hit. [LYRA: Unhurt → Scratched]"]);

  const res = await callGm({ player: "lyra", message: "confront the warden", type: "action" }, "resonance");
  assert.equal(res.body.gameState.characters.lyra.harm, "Scratched");
});

test("ABILITY FEN: <name> tag marks a boolean ability true (Resonance)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Somehow it just works out. [ABILITY FEN: lucky_break_used]"]);

  const res = await callGm({ player: "fen", message: "try something risky", type: "action" }, "resonance");
  assert.equal(res.body.gameState.characters.fen.lucky_break_used, true);
});

test("ABILITY LYRA: magic tag spends a Resonance charge instead of setting a flag", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Lyra reads the room. [ABILITY LYRA: magic]"]);

  const res = await callGm({ player: "lyra", message: "read the resonance here", type: "action" }, "resonance");
  assert.equal(res.body.gameState.characters.lyra.magic_uses_remaining, 2);
});

test("a roll-request turn flags entries as rolling, and the roll_result turn un-flags them", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "You reach for the chest.\nROLL:FORCE",
    "The chest creaks open, revealing treasure inside.",
  ]);

  const res1 = await callGm({ player: "player1", message: "open the chest", type: "action" });
  assert.equal(res1.body.needsRoll, true);
  assert.equal(redis.state.sessionLog.length, 2);
  assert.equal(redis.state.sessionLog[0].rolling, true);
  assert.equal(redis.state.sessionLog[1].rolling, true);

  await callGm({ player: "player1", message: "rolled a 9", type: "roll_result" });
  assert.equal(redis.state.sessionLog.length, 4);
  assert.equal(redis.state.sessionLog[0].rolling, undefined);
  assert.equal(redis.state.sessionLog[1].rolling, undefined);
  assert.equal(redis.state.sessionLog[0].timestamp, redis.state.sessionLog[1].timestamp);
});

test("state tags in a roll-request turn are deferred until the roll resolves", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "You push toward the Frost Lands. [LOCATION: Frost Lands]\nROLL:FORCE",
    "You make it through.",
  ]);

  const res1 = await callGm({ player: "player1", message: "push on", type: "action" });
  assert.equal(res1.body.needsRoll, true);
  // Not applied yet — the roll hasn't resolved, so this shouldn't be visible
  // as confirmed state (this is the exact bug found in a real stuck live turn).
  assert.notEqual(res1.body.gameState.worldState.location, "Frost Lands");
  assert.notEqual(redis.state.worldState.location, "Frost Lands");
  assert.equal(redis.state.sessionLog[1].rollStat, "force");

  const res2 = await callGm({ player: "player1", message: "rolled a 9", type: "roll_result" });
  // Now that the roll resolved, the deferred LOCATION tag is applied.
  assert.equal(res2.body.gameState.worldState.location, "Frost Lands");
  assert.equal(redis.state.worldState.location, "Frost Lands");
});

test("sessionLog is trimmed to the most recent 80 entries once it exceeds 100", async (t) => {
  const seeded = require("../lib/gamestate-manlandia").getInitialStateManlandia();
  for (let i = 0; i < 100; i++) {
    seeded.sessionLog.push({ role: i % 2 === 0 ? "user" : "gm", content: `entry ${i}`, timestamp: i });
  }
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Nothing tag-worthy happens."]);

  await callGm({ player: "player1", message: "wait", type: "action" });
  assert.equal(redis.state.sessionLog.length, 80);
  assert.equal(redis.state.sessionLog[redis.state.sessionLog.length - 1].content, "Nothing tag-worthy happens.");
});

test("resonance is locked without the correct adult pin, even with a valid game turn", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["This should never be reached."]);

  const handler = freshRequire("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "resonance" }, body: { player: "fen", message: "hello", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 403);
});

test("manlandia is never adult-gated, even with no pin header at all", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Fine."]);

  const handler = freshRequire("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "hello", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
});

test("end-to-end: a harm tag using the hero's real name instead of CHARACTER N still updates the right hero (real Dark Wars scenario)", async (t) => {
  const seeded = require("../lib/gamestate-manlandia").getInitialStateManlandia();
  seeded.characters.player1.name = "Globak";
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Your lack of agility has put the mission at risk. You're now:\n[Globak: Unhurt → Scratched]"]);

  const res = await callGm({ player: "player1", message: "climb down", type: "action" }, "c_test1");
  assert.equal(res.body.gameState.characters.player1.harm, "Scratched");
});
