const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

// Resonance is always adult-gated — set once so the resonance-world tests below
// (none of which are testing the gate itself) can pass the check.
const ADULT_PIN = "0000";
process.env.ADULT_PIN = ADULT_PIN;

function callState(req) {
  const handler = freshRequire("../api/state.js");
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("GET returns the stored state as-is", async (t) => {
  const stored = { session: 3, sessionLog: [], worldState: {}, characters: {} };
  t.mock.module("../lib/redis.js", statefulRedisMock(stored));

  const res = await callState({ method: "GET", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: {} });
  assert.deepEqual(res.body, stored);
});

test("GET falls back to a fresh initial state when nothing is stored", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));

  const res = await callState({ method: "GET", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: {} });
  assert.equal(res.body.characters.fen.harm, "Unhurt");
  assert.equal(res.body.characters.lyra.harm, "Unhurt");
});

test("POST is rejected without the correct X-Game-Secret when one is configured", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  process.env.GAME_SECRET = "supersecret";
  try {
    const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "reset" } });
    assert.equal(res.statusCode, 401);
  } finally {
    delete process.env.GAME_SECRET;
  }
});

test("reset on a built-in world replaces state with a fresh initial state", async (t) => {
  const dirty = { session: 5, sessionLog: [{ role: "gm", content: "..." }], worldState: { conclave_awareness: 9 }, characters: { fen: { harm: "Dying" }, lyra: { harm: "Wounded" } } };
  const redis = statefulRedisMock(dirty);
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "reset" } });
  assert.deepEqual(res.body, { ok: true });
  assert.equal(redis.state.session, 1);
  assert.equal(redis.state.characters.fen.harm, "Unhurt");
});

test("reset on a custom world preserves worldConfig but clears session progress", async (t) => {
  const dirty = {
    session: 4,
    sessionLog: [{ role: "gm", content: "..." }],
    worldConfig: { id: "c_1", name: "Star Reach", theme: "Space pirates", playerCount: 2, adult: false },
    worldState: { villain_awareness: 7 },
    characters: { player1: { name: "Zeb", harm: "Hurt" } },
  };
  const redis = statefulRedisMock(dirty);
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "c_1" }, body: { action: "reset" } });
  assert.equal(res.body.ok, true);
  assert.equal(redis.state.worldConfig.name, "Star Reach");
  assert.equal(redis.state.sessionLog.length, 0);
  assert.equal(redis.state.characters.player1.harm, "Unhurt");
});

test("toggle_ability flips a valid boolean ability and rejects an invalid one", async (t) => {
  const seeded = { characters: { fen: { lucky_break_used: false } }, worldState: {}, sessionLog: [] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const ok = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "toggle_ability", payload: { character: "fen", ability: "lucky_break_used" } } });
  assert.equal(ok.body.ok, true);
  assert.equal(redis.state.characters.fen.lucky_break_used, true);

  const bad = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "toggle_ability", payload: { character: "fen", ability: "not_a_real_ability" } } });
  assert.equal(bad.statusCode, 400);
});

test("use_magic decrements remaining charges and refuses when none are left", async (t) => {
  const seeded = { characters: { lyra: { magic_uses_remaining: 1 } }, worldState: {}, sessionLog: [] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const first = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "use_magic" } });
  assert.equal(first.body.ok, true);
  assert.equal(redis.state.characters.lyra.magic_uses_remaining, 0);

  const second = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "use_magic" } });
  assert.equal(second.body.ok, false);
});

test("recover_harm steps back one level, and refuses once already Unhurt", async (t) => {
  const seeded = { characters: { fen: { harm: "Wounded" } }, worldState: {}, sessionLog: [] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const first = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "recover_harm", payload: { character: "fen" } } });
  assert.equal(first.body.ok, true);
  assert.equal(redis.state.characters.fen.harm, "Hurt");

  redis.exports.setState("resonance:gamestate", { characters: { fen: { harm: "Unhurt" } }, worldState: {}, sessionLog: [] });
  const second = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "recover_harm", payload: { character: "fen" } } });
  assert.equal(second.body.ok, false);
});

test("new_session archives the log, increments the session, and resets Resonance abilities", async (t) => {
  const seeded = {
    session: 1,
    sessionLog: [{ role: "gm", content: "opening scene" }],
    worldState: {},
    characters: {
      lyra: { weight_of_knowing_used: true, magic_uses_remaining: 0 },
      fen: { not_on_my_watch_used: true, lucky_break_used: true },
    },
  };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "new_session", payload: { summary: "They escaped the pub." } } });
  assert.equal(res.body.session, 2);
  assert.equal(redis.state.worldState.session_archive.length, 1);
  assert.equal(redis.state.worldState.session_archive[0].summary, "They escaped the pub.");
  assert.equal(redis.state.sessionLog.length, 0);
  assert.equal(redis.state.characters.lyra.weight_of_knowing_used, false);
  assert.equal(redis.state.characters.lyra.magic_uses_remaining, 3);
  assert.equal(redis.state.characters.fen.not_on_my_watch_used, false);
  assert.equal(redis.state.characters.fen.lucky_break_used, false);
});

test("new_session fully resets harm to Unhurt for kid games (Manlandia)", async (t) => {
  const seeded = {
    session: 1,
    sessionLog: [],
    worldState: {},
    characters: {
      player1: { harm: "Broken", ability_used: true },
      player2: { harm: "Hurt", ability_used: false },
    },
  };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "new_session", payload: { summary: "They rested." } } });
  assert.equal(redis.state.characters.player1.harm, "Unhurt");
  assert.equal(redis.state.characters.player2.harm, "Unhurt");
});

test("new_session only partially heals harm for adult games (Resonance) — steps down at most 2 levels", async (t) => {
  const seeded = {
    session: 1,
    sessionLog: [],
    worldState: {},
    characters: {
      lyra: { harm: "Dying", weight_of_knowing_used: false, magic_uses_remaining: 3 },
      fen: { harm: "Hurt", not_on_my_watch_used: false, lucky_break_used: false },
    },
  };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "new_session", payload: { summary: "A rough night." } } });
  // Dying (index 5) steps down 2 to Wounded (index 3), not all the way to Unhurt.
  assert.equal(redis.state.characters.lyra.harm, "Wounded");
  // Hurt (index 2) steps down 2 to Unhurt (index 0), floored rather than negative.
  assert.equal(redis.state.characters.fen.harm, "Unhurt");
});

test("new_session on a non-adult custom world fully resets harm", async (t) => {
  const kidWorld = {
    session: 1,
    sessionLog: [],
    worldConfig: { adult: false },
    worldState: {},
    characters: { player1: { harm: "Wounded", ability_used: false } },
  };
  const kidRedis = statefulRedisMock(kidWorld);
  t.mock.module("../lib/redis.js", kidRedis);
  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "c_1" }, body: { action: "new_session", payload: { summary: "..." } } });
  assert.equal(kidRedis.state.characters.player1.harm, "Unhurt");
});

test("new_session on an adult-flagged custom world only partially heals harm", async (t) => {
  const adultWorld = {
    session: 1,
    sessionLog: [],
    worldConfig: { adult: true },
    worldState: {},
    characters: { player1: { harm: "Wounded", ability_used: false } },
  };
  const adultRedis = statefulRedisMock(adultWorld);
  t.mock.module("../lib/redis.js", adultRedis);
  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "c_2" }, body: { action: "new_session", payload: { summary: "..." } } });
  // Wounded (index 3) steps down 2 to Scratched (index 1).
  assert.equal(adultRedis.state.characters.player1.harm, "Scratched");
});

test("new_session awards baseline XP to created heroes in Manlandia, but not to empty character slots", async (t) => {
  const seeded = {
    session: 1,
    sessionLog: [],
    worldState: {},
    characters: {
      player1: { archetype: "fighter", ability_id: "lucky_break", xp: 5, harm: "Unhurt" },
      player2: {},
    },
  };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "new_session", payload: { summary: "..." } } });
  assert.equal(redis.state.characters.player1.xp, 15);
  assert.equal(redis.state.characters.player2.xp, undefined);
});

test("new_session does not grow characters in Resonance (no unlockable ability pool)", async (t) => {
  const seeded = {
    session: 1,
    sessionLog: [],
    worldState: {},
    characters: {
      lyra: { weight_of_knowing_used: true, magic_uses_remaining: 0, harm: "Unhurt" },
      fen: { not_on_my_watch_used: true, lucky_break_used: true, harm: "Unhurt" },
    },
  };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "new_session", payload: { summary: "..." } } });
  assert.equal(redis.state.characters.lyra.xp, undefined);
  assert.equal(redis.state.characters.fen.xp, undefined);
});

test("choose_ability adds the picked power and rejects one that wasn't offered", async (t) => {
  const seeded = {
    session: 1, sessionLog: [], worldState: {},
    characters: { player1: { bonus_abilities: [], pending_choice: { options: ["animal_friend", "protect_friend"] } } },
  };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const bad = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "choose_ability", payload: { character: "player1", ability_id: "ancient_magic" } } });
  assert.equal(bad.statusCode, 400);

  const good = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "choose_ability", payload: { character: "player1", ability_id: "animal_friend" } } });
  assert.equal(good.body.ok, true);
  assert.deepEqual(redis.state.characters.player1.bonus_abilities, ["animal_friend"]);
  assert.equal(redis.state.characters.player1.pending_choice, null);
});

test("choose_ability rejects an invalid character", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: {} });
  t.mock.module("../lib/redis.js", redis);
  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "choose_ability", payload: { character: "player9", ability_id: "animal_friend" } } });
  assert.equal(res.statusCode, 400);
});

test("new_session resets ability_used for each hero in Manlandia", async (t) => {
  const seeded = {
    session: 1,
    sessionLog: [],
    worldState: {},
    characters: {
      player1: { ability_used: true },
      player2: { ability_used: true },
      player3: { ability_used: false },
      player4: { ability_used: true },
    },
  };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "new_session", payload: { summary: "The heroes rested." } } });
  for (const p of ["player1", "player2", "player3", "player4"]) {
    assert.equal(redis.state.characters[p].ability_used, false);
  }
});

test("set_author_note stores a trimmed note, capped at 1000 characters", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: {} });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "set_author_note", payload: { note: "  Grandpa Joe is secretly the villain.  " } } });
  assert.equal(res.body.ok, true);
  assert.equal(redis.state.worldState.author_note, "Grandpa Joe is secretly the villain.");

  const long = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "set_author_note", payload: { note: "x".repeat(2000) } } });
  assert.equal(long.body.author_note.length, 1000);
});

test("set_author_note falls back to an empty string for a non-string note", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: { author_note: "old note" }, characters: {} });
  t.mock.module("../lib/redis.js", redis);

  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "set_author_note", payload: { note: 12345 } } });
  assert.equal(redis.state.worldState.author_note, "");
});

test("add_pinned_note appends a trimmed note with a timestamp", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: {} });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "add_pinned_note", payload: { text: "  Fen lied about the ledger  " } } });
  assert.equal(res.body.ok, true);
  assert.equal(redis.state.worldState.pinned_notes.length, 1);
  assert.equal(redis.state.worldState.pinned_notes[0].text, "Fen lied about the ledger");
  assert.equal(typeof redis.state.worldState.pinned_notes[0].timestamp, "number");
});

test("add_pinned_note rejects empty/whitespace-only text", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: {} });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "add_pinned_note", payload: { text: "   " } } });
  assert.equal(res.statusCode, 400);
});

test("add_pinned_note works for a kid world too (universal scope, not Resonance-only)", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: {} });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { action: "add_pinned_note", payload: { text: "The stone was hidden under the oak" } } });
  assert.equal(res.body.ok, true);
  assert.equal(redis.state.worldState.pinned_notes.length, 1);
});

test("add_pinned_note caps the list at 10, dropping the oldest", async (t) => {
  const existing = Array.from({ length: 10 }, (_, i) => ({ text: `note ${i}`, timestamp: i }));
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: { pinned_notes: existing }, characters: {} });
  t.mock.module("../lib/redis.js", redis);

  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "add_pinned_note", payload: { text: "note 10" } } });
  assert.equal(redis.state.worldState.pinned_notes.length, 10);
  assert.equal(redis.state.worldState.pinned_notes[0].text, "note 1");
  assert.equal(redis.state.worldState.pinned_notes[9].text, "note 10");
});

test("an unknown action returns 400", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "not_a_real_action" } });
  assert.equal(res.statusCode, 400);
});

test("methods other than GET/POST are rejected", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  const res = await callState({ method: "DELETE", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: {} });
  assert.equal(res.statusCode, 405);
});

test("GET on resonance is locked without the correct adult pin", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: {} }));
  const res = await callState({ method: "GET", headers: {}, query: { world: "resonance" }, body: {} });
  assert.equal(res.statusCode, 403);
});

test("POST on resonance is locked without the correct adult pin, even with a valid game secret", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: { fen: { harm: "Hurt" } } }));
  const res = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "recover_harm", payload: { character: "fen" } } });
  assert.equal(res.statusCode, 403);
});

test("manlandia is never adult-gated, even with no pin header at all", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: {} }));
  const res = await callState({ method: "GET", headers: {}, query: { world: "manlandia" }, body: {} });
  assert.equal(res.statusCode, 200);
});

/* ── Bonds — adult games only ── */

test("add_bond adds a relationship statement to the character's own bonds list (Resonance)", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: { fen: { bonds: [] }, lyra: { bonds: [] } } });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "add_bond", payload: { character: "fen", target: "lyra", text: "  I trust her with my life  " } } });
  assert.equal(res.body.ok, true);
  assert.deepEqual(redis.state.characters.fen.bonds, [{ target: "lyra", text: "I trust her with my life", resolved: false }]);
  assert.deepEqual(redis.state.characters.lyra.bonds, []);
});

test("add_bond rejects a kid game (Manlandia)", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: { player1: {}, player2: {} } });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "add_bond", payload: { character: "player1", target: "player2", text: "A bond" } } });
  assert.equal(res.statusCode, 400);
});

test("add_bond rejects a non-adult custom world", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldConfig: { adult: false }, worldState: {}, characters: { player1: {}, player2: {} } });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "c_kid" }, body: { action: "add_bond", payload: { character: "player1", target: "player2", text: "A bond" } } });
  assert.equal(res.statusCode, 400);
});

test("add_bond works for an adult-flagged custom world and lazily creates the bonds array", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldConfig: { adult: true }, worldState: {}, characters: { player1: { name: "Zeb" }, player2: { name: "Anya" } } });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "c_adult" }, body: { action: "add_bond", payload: { character: "player1", target: "player2", text: "I owe Anya a debt" } } });
  assert.equal(res.body.ok, true);
  assert.deepEqual(redis.state.characters.player1.bonds, [{ target: "player2", text: "I owe Anya a debt", resolved: false }]);
});

test("add_bond rejects bonding with yourself, an unknown target, or empty text", async (t) => {
  const seed = () => ({ session: 1, sessionLog: [], worldState: {}, characters: { fen: { bonds: [] }, lyra: { bonds: [] } } });
  t.mock.module("../lib/redis.js", statefulRedisMock(seed()));

  const self = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "add_bond", payload: { character: "fen", target: "fen", text: "..." } } });
  assert.equal(self.statusCode, 400);

  const unknown = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "add_bond", payload: { character: "fen", target: "nobody", text: "..." } } });
  assert.equal(unknown.statusCode, 400);

  const empty = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "add_bond", payload: { character: "fen", target: "lyra", text: "   " } } });
  assert.equal(empty.statusCode, 400);
});

test("resolve_bond marks a bond resolved and stays cosmetic-only for Resonance (no XP system)", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: { fen: { bonds: [{ target: "lyra", text: "I trust her", resolved: false }] } } });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "resolve_bond", payload: { character: "fen", index: 0 } } });
  assert.equal(res.body.ok, true);
  assert.equal(redis.state.characters.fen.bonds[0].resolved, true);
  assert.equal(redis.state.characters.fen.xp, undefined);
});

test("resolve_bond awards bonus XP for an adult-flagged custom world", async (t) => {
  const redis = statefulRedisMock({
    session: 1, sessionLog: [], worldConfig: { adult: true }, worldState: {},
    characters: { player1: { xp: 5, bonds: [{ target: "player2", text: "A debt owed", resolved: false }] } },
  });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "c_adult" }, body: { action: "resolve_bond", payload: { character: "player1", index: 0 } } });
  assert.equal(res.body.ok, true);
  assert.equal(redis.state.characters.player1.bonds[0].resolved, true);
  assert.equal(redis.state.characters.player1.xp, 20); // 5 + bondXp (15)
});

test("resolve_bond is idempotent — resolving an already-resolved bond doesn't double-award XP", async (t) => {
  const redis = statefulRedisMock({
    session: 1, sessionLog: [], worldConfig: { adult: true }, worldState: {},
    characters: { player1: { xp: 5, bonds: [{ target: "player2", text: "A debt owed", resolved: false }] } },
  });
  t.mock.module("../lib/redis.js", redis);

  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "c_adult" }, body: { action: "resolve_bond", payload: { character: "player1", index: 0 } } });
  await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "c_adult" }, body: { action: "resolve_bond", payload: { character: "player1", index: 0 } } });
  assert.equal(redis.state.characters.player1.xp, 20);
});

test("resolve_bond rejects a kid game", async (t) => {
  const kidRedis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: { player1: { bonds: [] } } });
  t.mock.module("../lib/redis.js", kidRedis);
  const kid = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "resolve_bond", payload: { character: "player1", index: 0 } } });
  assert.equal(kid.statusCode, 400);
});

test("resolve_bond rejects an invalid bond index", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: { fen: { bonds: [] } } });
  t.mock.module("../lib/redis.js", redis);
  const badIndex = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { action: "resolve_bond", payload: { character: "fen", index: 0 } } });
  assert.equal(badIndex.statusCode, 400);
});

/* ── end_combat — manual escape hatch, no LLM round-trip ── */

test("end_combat sets combat.active to false without touching the tracked enemies", async (t) => {
  const seeded = {
    session: 1, sessionLog: [], worldState: { combat: { active: true, round: 2, enemies: [{ name: "Goblin Scout", harm: "Hurt", defeated: false }] } },
    characters: {},
  };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "end_combat", payload: {} } });
  assert.equal(res.body.ok, true);
  assert.equal(res.body.worldState.combat.active, false);
  assert.equal(redis.state.worldState.combat.active, false);
  assert.equal(redis.state.worldState.combat.enemies[0].name, "Goblin Scout");
});

test("end_combat is a harmless no-op when there's no combat state at all yet", async (t) => {
  const redis = statefulRedisMock({ session: 1, sessionLog: [], worldState: {}, characters: {} });
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "manlandia" }, body: { action: "end_combat", payload: {} } });
  assert.equal(res.body.ok, true);
});
