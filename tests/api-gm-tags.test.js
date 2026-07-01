const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

function mockGemini(t, responses) {
  const queue = [...responses];
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => queue.shift() },
  });
}

function callGm(body, world = "manlandia") {
  const handler = freshRequire("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world }, body };
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
