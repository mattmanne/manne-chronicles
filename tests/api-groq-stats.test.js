const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, mockRedisCommand } = require("./helpers");

const GAME_SECRET = "s3cr3t";

function freshHandler() {
  return freshRequire("../api/groq-stats.js");
}

test("returns aggregated stats", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { redisCommand: mockRedisCommand() } });
  const { recordRateLimitHit } = freshRequire("../lib/groq-tracking");
  await recordRateLimitHit("resonance");

  const handler = freshHandler();
  const req = { method: "GET", headers: {} };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totalAllTime, 1);
  assert.deepEqual(res.body.byWorld, { resonance: 1 });
});

test("requires the correct X-Game-Secret when one is configured", async (t) => {
  process.env.GAME_SECRET = GAME_SECRET;
  try {
    t.mock.module("../lib/redis.js", { exports: { redisCommand: mockRedisCommand() } });
    const handler = freshHandler();

    const wrongSecret = mockRes();
    await handler({ method: "GET", headers: { "x-game-secret": "wrong" } }, wrongSecret);
    assert.equal(wrongSecret.statusCode, 401);

    const rightSecret = mockRes();
    await handler({ method: "GET", headers: { "x-game-secret": GAME_SECRET } }, rightSecret);
    assert.equal(rightSecret.statusCode, 200);
  } finally {
    delete process.env.GAME_SECRET;
  }
});

test("rejects non-GET methods", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { redisCommand: mockRedisCommand() } });
  const handler = freshHandler();
  const res = mockRes();
  await handler({ method: "POST", headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
