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

test("CLUE tags add and resolve leads, generalized to every world type, separate from Objectives", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "Something's off. [CLUE: The ledger has been altered]",
    "It clicks into place. [CLUE RESOLVED: The ledger has been altered]",
  ]);

  const res1 = await callGm({ player: "player1", message: "check the ledger", type: "action" });
  assert.deepEqual(res1.body.gameState.worldState.clues, [{ text: "The ledger has been altered", done: false }]);
  assert.deepEqual(res1.body.gameState.worldState.objectives, []);

  const res2 = await callGm({ player: "player1", message: "confront the clerk", type: "action" });
  assert.deepEqual(res2.body.gameState.worldState.clues, [{ text: "The ledger has been altered", done: true }]);
});

test("CLUE tags work for Resonance too, not just Manlandia/custom", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A contradiction surfaces. [CLUE: Fen's alibi doesn't match the ledger]"]);

  const res = await callGm({ player: "fen", message: "investigate", type: "action" }, "resonance");
  assert.deepEqual(res.body.gameState.worldState.clues, [{ text: "Fen's alibi doesn't match the ledger", done: false }]);
});

test("a CLUE tag in a roll-request turn is deferred until the roll resolves, same as other state tags", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "A detail nags at you. [CLUE: The guard's story has a gap]\nROLL:ACUITY",
    "You piece it together.",
  ]);

  const res1 = await callGm({ player: "player1", message: "press the guard", type: "action" });
  assert.equal(res1.body.needsRoll, true);
  assert.deepEqual(res1.body.gameState.worldState.clues, []);

  const res2 = await callGm({ player: "player1", message: "rolled a 9", type: "roll_result" });
  assert.deepEqual(res2.body.gameState.worldState.clues, [{ text: "The guard's story has a gap", done: false }]);
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

/* ── NPC lorebook — shared across all world types, same as OBJECTIVE ── */

test("NPC tag adds a lorebook entry and dedups by name across turns", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "A stranger approaches. [NPC: Old Marrow: A one-eyed lighthouse keeper]",
    "He waves again. [NPC: Old Marrow: A one-eyed lighthouse keeper]",
  ]);

  const res1 = await callGm({ player: "player1", message: "look around", type: "action" });
  assert.deepEqual(res1.body.gameState.worldState.npcs, [{ name: "Old Marrow", description: "A one-eyed lighthouse keeper" }]);

  const res2 = await callGm({ player: "player1", message: "look again", type: "action" });
  assert.equal(res2.body.gameState.worldState.npcs.length, 1);
});

test("NPC tag works for Resonance too, not just Manlandia/custom", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A Warden introduces herself. [NPC: Captain Reyes: A stern Warden patrolling the Docks]"]);

  const res = await callGm({ player: "fen", message: "greet her", type: "action" }, "resonance");
  assert.deepEqual(res.body.gameState.worldState.npcs, [{ name: "Captain Reyes", description: "A stern Warden patrolling the Docks" }]);
});

test("an NPC tag in a roll-request turn is deferred until the roll resolves, same as other state tags", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "A figure emerges. [NPC: Old Marrow: A lighthouse keeper]\nROLL:ACUITY",
    "You size him up.",
  ]);

  const res1 = await callGm({ player: "player1", message: "approach", type: "action" });
  assert.equal(res1.body.needsRoll, true);
  assert.deepEqual(res1.body.gameState.worldState.npcs, []);

  const res2 = await callGm({ player: "player1", message: "rolled a 9", type: "roll_result" });
  assert.deepEqual(res2.body.gameState.worldState.npcs, [{ name: "Old Marrow", description: "A lighthouse keeper" }]);
});

/* ── Inventory: shared party loot for kid-friendly games ── */

test("ITEM FOUND tag adds to the shared party inventory and dedups across turns (Manlandia)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "You find a key. [ITEM FOUND: A rusty iron key]",
    "Nothing else here. [ITEM FOUND: A rusty iron key]",
  ]);

  const res1 = await callGm({ player: "player1", message: "search", type: "action" });
  assert.deepEqual(res1.body.gameState.worldState.inventory, ["A rusty iron key"]);

  const res2 = await callGm({ player: "player1", message: "search more", type: "action" });
  assert.deepEqual(res2.body.gameState.worldState.inventory, ["A rusty iron key"]);
});

test("ITEM FOUND tag works for a non-adult custom world too (shared inventory)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["You find a map fragment. [ITEM FOUND: A torn map fragment]"]);

  const res = await callGm({ player: "player1", message: "search the chest", type: "action" }, "c_test");
  assert.deepEqual(res.body.gameState.worldState.inventory, ["A torn map fragment"]);
});

/* ── Inventory: per-character, adult games only ── */

test("ITEM N tag adds to that hero's own inventory in an adult-flagged custom campaign", async (t) => {
  const seeded = require("../lib/gamestate-custom").getInitialStateCustom({ adult: true });
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["You pocket the locket. [ITEM 1: A silver locket]"]);

  const res = await callGm({ player: "player1", message: "take it", type: "action" }, "c_adult_test");
  assert.deepEqual(res.body.gameState.characters.player1.inventory, ["A silver locket"]);
  // The shared worldState.inventory array still gets lazily created (same
  // defensive init every tag here uses), it just never gets anything pushed
  // into it for an adult game — no [ITEM FOUND: ...] tag to match.
  assert.deepEqual(res.body.gameState.worldState.inventory, []);
});

test("ITEM FEN/LYRA tags add to each character's own inventory (Resonance)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Fen pockets a knife, Lyra tucks away a journal. [ITEM FEN: A pocketknife]\n[ITEM LYRA: A worn journal]"]);

  const res = await callGm({ player: "fen", message: "gather supplies", type: "action" }, "resonance");
  assert.deepEqual(res.body.gameState.characters.fen.inventory, ["A pocketknife"]);
  assert.deepEqual(res.body.gameState.characters.lyra.inventory, ["A worn journal"]);
});

/* ── last_actor / last_action_at — powers the waiting-on banner + stall reminder cron ── */

test("every turn records who took it and when, regardless of roll state", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["Nothing risky happens."]);

  const before = Date.now();
  const res = await callGm({ player: "player2", message: "look around", type: "action" });
  assert.equal(res.body.gameState.worldState.last_actor, "player2");
  assert.ok(res.body.gameState.worldState.last_actor);
  assert.ok(redis.state.worldState.last_action_at >= before);
});

test("last_actor updates to whoever acts next, overwriting the previous value", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["First turn.", "Second turn."]);

  await callGm({ player: "player1", message: "go", type: "action" });
  assert.equal(redis.state.worldState.last_actor, "player1");

  await callGm({ player: "player2", message: "go too", type: "action" });
  assert.equal(redis.state.worldState.last_actor, "player2");
});

/* ── Combat — still Dungeon-World-style (one roll resolves one exchange),
   this just tracks enemy state persisting across several exchanges ── */

test("COMBAT START adds enemies and marks combat active (Manlandia)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A goblin and a wolf leap out! [COMBAT START: Goblin Scout, Wolf]"]);

  const res = await callGm({ player: "player1", message: "walk into the clearing", type: "action" });
  assert.equal(res.body.gameState.worldState.combat.active, true);
  assert.deepEqual(res.body.gameState.worldState.combat.enemies, [
    { name: "Goblin Scout", harm: "Unhurt", defeated: false },
    { name: "Wolf", harm: "Unhurt", defeated: false },
  ]);
});

test("COMBAT START works for Resonance and custom worlds too, not just Manlandia", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A Warden draws steel! [COMBAT START: Warden]"]);

  const res = await callGm({ player: "fen", message: "stand ground", type: "action" }, "resonance");
  assert.equal(res.body.gameState.worldState.combat.active, true);
  assert.equal(res.body.gameState.worldState.combat.enemies[0].name, "Warden");
});

test("ENEMY tag updates harm across turns, tolerating a fuzzy name match", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "A fight breaks out! [COMBAT START: Grunk the Goblin Scout]",
    "You land a hit! [ENEMY: the goblin: Unhurt → Hurt]",
  ]);

  await callGm({ player: "player1", message: "attack", type: "action" });
  const res = await callGm({ player: "player1", message: "attack again", type: "action" });
  assert.equal(res.body.gameState.worldState.combat.enemies[0].harm, "Hurt");
});

test("ENEMY DEFEATED marks that enemy defeated, and combat auto-ends once every enemy is down", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "[COMBAT START: Goblin Scout]",
    "You strike true! [ENEMY DEFEATED: Goblin Scout]",
  ]);

  await callGm({ player: "player1", message: "attack", type: "action" });
  const res = await callGm({ player: "player1", message: "finish it", type: "action" });
  assert.equal(res.body.gameState.worldState.combat.enemies[0].defeated, true);
  assert.equal(res.body.gameState.worldState.combat.active, false);
});

test("a defeat synonym folded into the ENEMY harm arrow still ends combat once it's the last enemy standing", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "[COMBAT START: Goblin Scout]",
    "Down it goes! [ENEMY: Goblin Scout: Hurt → Defeated]",
  ]);

  await callGm({ player: "player1", message: "attack", type: "action" });
  const res = await callGm({ player: "player1", message: "finish it", type: "action" });
  assert.equal(res.body.gameState.worldState.combat.enemies[0].defeated, true);
  assert.equal(res.body.gameState.worldState.combat.active, false);
});

test("COMBAT END explicitly ends a fight even with enemies still standing (e.g. the party flees)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "[COMBAT START: Goblin Scout]",
    "You break away and flee! [COMBAT END]",
  ]);

  await callGm({ player: "player1", message: "fight", type: "action" });
  const res = await callGm({ player: "player1", message: "run!", type: "action" });
  assert.equal(res.body.gameState.worldState.combat.active, false);
  assert.equal(res.body.gameState.worldState.combat.enemies[0].defeated, false);
});

test("combat round only advances on an actual resolved roll, and only while combat is active", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "A fight begins! [COMBAT START: Goblin Scout]\nROLL:FORCE",
    "You strike hard.",
  ]);

  const res1 = await callGm({ player: "player1", message: "attack", type: "action" });
  assert.equal(res1.body.needsRoll, true);
  // Combat tags are deferred while the roll is pending, same as every other tag.
  assert.equal(res1.body.gameState.worldState.combat.active, false);

  const res2 = await callGm({ player: "player1", message: "rolled a 12", type: "roll_result" });
  assert.equal(res2.body.gameState.worldState.combat.active, true);
  assert.equal(res2.body.gameState.worldState.combat.round, 1);
});

test("combat round does not advance on an ordinary narration turn (no roll involved)", async (t) => {
  const seeded = require("../lib/gamestate-manlandia").getInitialStateManlandia();
  seeded.worldState.combat = { active: true, round: 2, enemies: [{ name: "Goblin Scout", harm: "Hurt", defeated: false }] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["The goblin snarls but nothing else happens."]);

  const res = await callGm({ player: "player1", message: "look around", type: "action" });
  assert.equal(res.body.gameState.worldState.combat.round, 2);
});

test("kid-world combat caps a hero's harm at Broken, never Dying, while a fight is active (Manlandia)", async (t) => {
  const seeded = require("../lib/gamestate-manlandia").getInitialStateManlandia();
  seeded.worldState.combat = { active: true, round: 1, enemies: [{ name: "Goblin Scout", harm: "Unhurt", defeated: false }] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A brutal blow lands! [CHARACTER 1: Broken → Dying]"]);

  const res = await callGm({ player: "player1", message: "take the hit", type: "action" });
  assert.equal(res.body.gameState.characters.player1.harm, "Broken");
});

test("the kid-world harm cap does not apply outside of combat", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A terrible curse takes hold. [CHARACTER 1: Broken → Dying]"]);

  const res = await callGm({ player: "player1", message: "touch the cursed idol", type: "action" });
  assert.equal(res.body.gameState.characters.player1.harm, "Dying");
});

test("the kid-world harm cap does not apply to Resonance (always adult)", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, [
    "[COMBAT START: Warden]",
    "A killing blow! [FEN: Broken → Dying]",
  ]);

  await callGm({ player: "fen", message: "fight", type: "action" }, "resonance");
  const res = await callGm({ player: "fen", message: "keep fighting", type: "action" }, "resonance");
  assert.equal(res.body.gameState.characters.fen.harm, "Dying");
});

test("an adult-flagged custom world's combat harm is not capped either", async (t) => {
  const seeded = require("../lib/gamestate-custom").getInitialStateCustom({ adult: true });
  seeded.worldState.combat = { active: true, round: 1, enemies: [{ name: "Raider", harm: "Unhurt", defeated: false }] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  mockGemini(t, ["A killing blow! [CHARACTER 1: Broken → Dying]"]);

  const res = await callGm({ player: "player1", message: "fight on", type: "action" }, "c_adult_combat_test");
  assert.equal(res.body.gameState.characters.player1.harm, "Dying");
});
