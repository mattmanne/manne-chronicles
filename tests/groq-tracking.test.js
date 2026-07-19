const { test } = require("node:test");
const assert = require("node:assert/strict");
const { freshRequire, mockRedisCommand } = require("./helpers");

test("records a hit and reflects it in the total and recent events", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { redisCommand: mockRedisCommand() } });
  const { recordRateLimitHit, getRateLimitStats } = freshRequire("../lib/groq-tracking");

  await recordRateLimitHit("resonance");
  const stats = await getRateLimitStats();

  assert.equal(stats.totalAllTime, 1);
  assert.equal(stats.recentEventsTracked, 1);
  assert.equal(stats.last24h, 1);
  assert.equal(stats.last7d, 1);
  assert.ok(stats.lastHitAt && stats.lastHitAt <= Date.now());
  assert.deepEqual(stats.byWorld, { resonance: 1 });
});

test("returns all-zero stats when nothing has ever been recorded", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { redisCommand: mockRedisCommand() } });
  const { getRateLimitStats } = freshRequire("../lib/groq-tracking");

  const stats = await getRateLimitStats();
  assert.equal(stats.totalAllTime, 0);
  assert.equal(stats.recentEventsTracked, 0);
  assert.equal(stats.last24h, 0);
  assert.equal(stats.last7d, 0);
  assert.equal(stats.lastHitAt, null);
  assert.deepEqual(stats.byWorld, {});
});

test("tallies hits across multiple worlds independently", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { redisCommand: mockRedisCommand() } });
  const { recordRateLimitHit, getRateLimitStats } = freshRequire("../lib/groq-tracking");

  await recordRateLimitHit("resonance");
  await recordRateLimitHit("resonance");
  await recordRateLimitHit("manlandia");

  const stats = await getRateLimitStats();
  assert.equal(stats.totalAllTime, 3);
  assert.deepEqual(stats.byWorld, { resonance: 2, manlandia: 1 });
});

test("lastHitAt reflects the most recently recorded event, not the first", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { redisCommand: mockRedisCommand() } });
  const { recordRateLimitHit, getRateLimitStats } = freshRequire("../lib/groq-tracking");

  await recordRateLimitHit("resonance");
  const afterFirst = (await getRateLimitStats()).lastHitAt;
  await recordRateLimitHit("manlandia");
  const afterSecond = (await getRateLimitStats()).lastHitAt;

  assert.ok(afterSecond >= afterFirst);
});

test("a Redis failure during recording never throws — diagnostic only", async (t) => {
  t.mock.module("../lib/redis.js", {
    exports: { redisCommand: async () => { throw new Error("redis is down"); } },
  });
  const { recordRateLimitHit } = freshRequire("../lib/groq-tracking");

  await assert.doesNotReject(recordRateLimitHit("resonance"));
});
