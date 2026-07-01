const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, statefulRedisMock } = require("./helpers");

function callCharacters(redisInitial, body, world = "manlandia") {
  const redis = statefulRedisMock(redisInitial);
  return { redis, run: async (t) => {
    t.mock.module("../lib/redis.js", redis);
    const handler = freshRequire("../api/characters.js");
    const req = { method: "POST", headers: {}, query: { world }, body };
    const res = mockRes();
    await handler(req, res);
    return res;
  } };
}

const VALID_BODY = { player: "player1", name: "Taisha", archetype: "fighter", ability_id: "animal_friend" };

test("rejects worlds that aren't Manlandia or custom", async (t) => {
  const { run } = callCharacters(null, VALID_BODY, "resonance");
  const res = await run(t);
  assert.equal(res.statusCode, 400);
});

test("rejects an invalid player id", async (t) => {
  const { run } = callCharacters(null, { ...VALID_BODY, player: "player9" });
  const res = await run(t);
  assert.equal(res.statusCode, 400);
});

test("rejects a missing or blank name", async (t) => {
  const { run } = callCharacters(null, { ...VALID_BODY, name: "   " });
  const res = await run(t);
  assert.equal(res.statusCode, 400);
});

test("rejects an invalid archetype", async (t) => {
  const { run } = callCharacters(null, { ...VALID_BODY, archetype: "wizard" });
  const res = await run(t);
  assert.equal(res.statusCode, 400);
});

test("rejects an invalid ability id", async (t) => {
  const { run } = callCharacters(null, { ...VALID_BODY, ability_id: "super_speed" });
  const res = await run(t);
  assert.equal(res.statusCode, 400);
});

test("creates a new hero with stats matching the archetype, and sensible defaults", async (t) => {
  const { run, redis } = callCharacters(null, VALID_BODY);
  const res = await run(t);
  assert.equal(res.body.ok, true);
  const hero = res.body.characters.player1;
  assert.equal(hero.name, "Taisha");
  assert.deepEqual(hero.stats, { force: 3, acuity: 1, agility: 2, will: 1, presence: 0 });
  assert.equal(hero.ability_used, false);
  assert.equal(hero.harm, "Unhurt");
  assert.equal(hero.backstory, "");
  assert.ok(redis.state.characters.player1);
});

test("editing an existing hero preserves ability_used, harm, and backstory unless overwritten", async (t) => {
  const seeded = { characters: { player1: { name: "Old Name", harm: "Hurt", ability_used: true, backstory: "An old tale." } } };
  const { run, redis } = callCharacters(seeded, { player: "player1", name: "New Name", archetype: "mage", ability_id: "ancient_magic" });
  await run(t);
  const hero = redis.state.characters.player1;
  assert.equal(hero.name, "New Name");
  assert.equal(hero.archetype, "mage");
  assert.equal(hero.harm, "Hurt");
  assert.equal(hero.ability_used, true);
  assert.equal(hero.backstory, "An old tale.");
});

test("truncates an overly long name to 20 characters and backstory to 200", async (t) => {
  const longName = "N".repeat(50);
  const longBackstory = "B".repeat(500);
  const { run, redis } = callCharacters(null, { ...VALID_BODY, name: longName, backstory: longBackstory });
  await run(t);
  assert.equal(redis.state.characters.player1.name.length, 20);
  assert.equal(redis.state.characters.player1.backstory.length, 200);
});

test("a non-string backstory falls back to the existing one instead of overwriting it", async (t) => {
  const seeded = { characters: { player1: { backstory: "Keep me." } } };
  const { run, redis } = callCharacters(seeded, { ...VALID_BODY, backstory: 12345 });
  await run(t);
  assert.equal(redis.state.characters.player1.backstory, "Keep me.");
});

test("works for custom campaigns as well as Manlandia", async (t) => {
  const { run, redis } = callCharacters(null, VALID_BODY, "c_test123");
  const res = await run(t);
  assert.equal(res.body.ok, true);
  assert.equal(redis.state.characters.player1.name, "Taisha");
});

test("rejects requests with the wrong game secret when one is configured", async (t) => {
  const { run } = callCharacters(null, VALID_BODY);
  process.env.GAME_SECRET = "supersecret";
  try {
    const res = await run(t);
    assert.equal(res.statusCode, 401);
  } finally {
    delete process.env.GAME_SECRET;
  }
});
