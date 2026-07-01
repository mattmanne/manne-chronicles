const { test } = require("node:test");
const assert = require("node:assert/strict");

function freshRequire(modPath) {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

test("allows requests up to the limit, then rejects", async (t) => {
  let count = 0;
  const expireCalls = [];
  t.mock.module("../lib/redis.js", {
    exports: {
      redisCommand: async (cmd, key, arg) => {
        if (cmd === "INCR") return ++count;
        if (cmd === "EXPIRE") { expireCalls.push([key, arg]); return 1; }
        throw new Error("unexpected command " + cmd);
      },
    },
  });

  const { checkRateLimit } = freshRequire("../lib/ratelimit");

  for (let i = 1; i <= 3; i++) {
    assert.equal(await checkRateLimit("ratelimit:test:1.2.3.4", 3, 60), true);
  }
  assert.equal(await checkRateLimit("ratelimit:test:1.2.3.4", 3, 60), false);
});

test("sets an expiry only on the first request in a window", async (t) => {
  let count = 0;
  let expireCallCount = 0;
  t.mock.module("../lib/redis.js", {
    exports: {
      redisCommand: async (cmd) => {
        if (cmd === "INCR") return ++count;
        if (cmd === "EXPIRE") { expireCallCount++; return 1; }
      },
    },
  });

  const { checkRateLimit } = freshRequire("../lib/ratelimit");
  await checkRateLimit("k", 10, 60);
  await checkRateLimit("k", 10, 60);
  await checkRateLimit("k", 10, 60);
  assert.equal(expireCallCount, 1);
});

test("different keys are tracked independently", async (t) => {
  const counts = {};
  t.mock.module("../lib/redis.js", {
    exports: {
      redisCommand: async (cmd, key) => {
        if (cmd === "INCR") { counts[key] = (counts[key] || 0) + 1; return counts[key]; }
        return 1;
      },
    },
  });

  const { checkRateLimit } = freshRequire("../lib/ratelimit");
  assert.equal(await checkRateLimit("a", 1, 60), true);
  assert.equal(await checkRateLimit("b", 1, 60), true);
  assert.equal(await checkRateLimit("a", 1, 60), false);
  assert.equal(await checkRateLimit("b", 1, 60), false);
});
