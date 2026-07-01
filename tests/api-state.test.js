const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

function callState(req) {
  const handler = freshRequire("../api/state.js");
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("GET returns the stored state as-is", async (t) => {
  const stored = { session: 3, sessionLog: [], worldState: {}, characters: {} };
  t.mock.module("../lib/redis.js", statefulRedisMock(stored));

  const res = await callState({ method: "GET", headers: {}, query: { world: "resonance" }, body: {} });
  assert.deepEqual(res.body, stored);
});

test("GET falls back to a fresh initial state when nothing is stored", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));

  const res = await callState({ method: "GET", headers: {}, query: { world: "resonance" }, body: {} });
  assert.equal(res.body.characters.fen.harm, "Unhurt");
  assert.equal(res.body.characters.lyra.harm, "Unhurt");
});

test("POST is rejected without the correct X-Game-Secret when one is configured", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  process.env.GAME_SECRET = "supersecret";
  try {
    const res = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "reset" } });
    assert.equal(res.statusCode, 401);
  } finally {
    delete process.env.GAME_SECRET;
  }
});

test("reset on a built-in world replaces state with a fresh initial state", async (t) => {
  const dirty = { session: 5, sessionLog: [{ role: "gm", content: "..." }], worldState: { conclave_awareness: 9 }, characters: { fen: { harm: "Dying" }, lyra: { harm: "Wounded" } } };
  const redis = statefulRedisMock(dirty);
  t.mock.module("../lib/redis.js", redis);

  const res = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "reset" } });
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

  const res = await callState({ method: "POST", headers: {}, query: { world: "c_1" }, body: { action: "reset" } });
  assert.equal(res.body.ok, true);
  assert.equal(redis.state.worldConfig.name, "Star Reach");
  assert.equal(redis.state.sessionLog.length, 0);
  assert.equal(redis.state.characters.player1.harm, "Unhurt");
});

test("toggle_ability flips a valid boolean ability and rejects an invalid one", async (t) => {
  const seeded = { characters: { fen: { lucky_break_used: false } }, worldState: {}, sessionLog: [] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const ok = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "toggle_ability", payload: { character: "fen", ability: "lucky_break_used" } } });
  assert.equal(ok.body.ok, true);
  assert.equal(redis.state.characters.fen.lucky_break_used, true);

  const bad = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "toggle_ability", payload: { character: "fen", ability: "not_a_real_ability" } } });
  assert.equal(bad.statusCode, 400);
});

test("use_magic decrements remaining charges and refuses when none are left", async (t) => {
  const seeded = { characters: { lyra: { magic_uses_remaining: 1 } }, worldState: {}, sessionLog: [] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const first = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "use_magic" } });
  assert.equal(first.body.ok, true);
  assert.equal(redis.state.characters.lyra.magic_uses_remaining, 0);

  const second = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "use_magic" } });
  assert.equal(second.body.ok, false);
});

test("recover_harm steps back one level, and refuses once already Unhurt", async (t) => {
  const seeded = { characters: { fen: { harm: "Wounded" } }, worldState: {}, sessionLog: [] };
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);

  const first = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "recover_harm", payload: { character: "fen" } } });
  assert.equal(first.body.ok, true);
  assert.equal(redis.state.characters.fen.harm, "Hurt");

  redis.exports.setState("resonance:gamestate", { characters: { fen: { harm: "Unhurt" } }, worldState: {}, sessionLog: [] });
  const second = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "recover_harm", payload: { character: "fen" } } });
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

  const res = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "new_session", payload: { summary: "They escaped the pub." } } });
  assert.equal(res.body.session, 2);
  assert.equal(redis.state.worldState.session_archive.length, 1);
  assert.equal(redis.state.worldState.session_archive[0].summary, "They escaped the pub.");
  assert.equal(redis.state.sessionLog.length, 0);
  assert.equal(redis.state.characters.lyra.weight_of_knowing_used, false);
  assert.equal(redis.state.characters.lyra.magic_uses_remaining, 3);
  assert.equal(redis.state.characters.fen.not_on_my_watch_used, false);
  assert.equal(redis.state.characters.fen.lucky_break_used, false);
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

  await callState({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { action: "new_session", payload: { summary: "The heroes rested." } } });
  for (const p of ["player1", "player2", "player3", "player4"]) {
    assert.equal(redis.state.characters[p].ability_used, false);
  }
});

test("an unknown action returns 400", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  const res = await callState({ method: "POST", headers: {}, query: { world: "resonance" }, body: { action: "not_a_real_action" } });
  assert.equal(res.statusCode, 400);
});

test("methods other than GET/POST are rejected", async (t) => {
  t.mock.module("../lib/redis.js", statefulRedisMock(null));
  const res = await callState({ method: "DELETE", headers: {}, query: { world: "resonance" }, body: {} });
  assert.equal(res.statusCode, 405);
});
