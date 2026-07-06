const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRedisCommand, statefulRedisMock, seedPendingRoll } = require("./helpers");
const { getWorldConfig } = require("../lib/worldconfig");

// Resonance is always adult-gated — set once for the private-scene tests
// below (none of which are testing the gate itself).
const ADULT_PIN = "0000";
process.env.ADULT_PIN = ADULT_PIN;

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { this.ended = true; },
  };
}

function freshHandler(modPath) {
  delete require.cache[require.resolve(modPath)];
  // lib/ratelimit.js destructures redisCommand out of lib/redis.js once, at
  // require time — clear it too so each test's mocked redisCommand actually
  // takes effect instead of an earlier test's stale binding sticking around.
  delete require.cache[require.resolve("../lib/ratelimit.js")];
  return require(modPath);
}

function mockRedisAndGemini(t, gmResponseText) {
  t.mock.module("../lib/redis.js", {
    exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() },
  });
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => gmResponseText },
  });
}

test("action turn returns parsed suggestions and strips the tag from the narration", async (t) => {
  mockRedisAndGemini(t, "You arrive at the village.\n\n[SUGGESTIONS: Look around | Talk to Bramble | Check your gear]");
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.deepEqual(res.body.suggestions, ["Look around", "Talk to Bramble", "Check your gear"]);
  assert.equal(res.body.response, "You arrive at the village.");
  assert.equal(res.body.needsRoll, false);
});

test("a roll-request turn forces suggestions to be empty even if the model includes the tag", async (t) => {
  mockRedisAndGemini(t, "You reach for the door.\nROLL:AGILITY\n[SUGGESTIONS: Push harder | Look for another way]");
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I open the door", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.body.needsRoll, true);
  assert.equal(res.body.rollStat, "agility");
  assert.deepEqual(res.body.suggestions, []);
  assert.equal(res.body.response, "You reach for the door.");
});

test("a roll_result turn forces suggestions to be empty", async (t) => {
  const seeded = seedPendingRoll(getWorldConfig("manlandia").getInitialState(), "player1");
  t.mock.module("../lib/redis.js", {
    exports: { getState: async () => seeded, setState: async () => {}, redisCommand: mockRedisCommand() },
  });
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => "The door creaks open. [SUGGESTIONS: Step inside | Listen first]" },
  });
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "rolled a 9", type: "roll_result" } };
  const res = mockRes();
  await handler(req, res);

  assert.deepEqual(res.body.suggestions, []);
  assert.equal(res.body.response, "The door creaks open.");
});

test("no suggestions tag present yields an empty array", async (t) => {
  mockRedisAndGemini(t, "Nothing else happens.");
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "wait", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.deepEqual(res.body.suggestions, []);
});

test("rejects a message longer than 1000 characters without calling the model", async (t) => {
  let generateContentCalls = 0;
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {} } });
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => { generateContentCalls++; return "x"; } } });

  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "a".repeat(1001), type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(generateContentCalls, 0);
});

test("accepts a message exactly at the 1000 character limit", async (t) => {
  mockRedisAndGemini(t, "Fine.");
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "a".repeat(1000), type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
});

test("a Groq 429 surfaces as a 429 with a friendly, non-leaky message", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() } });
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async () => {
        const err = new Error("Groq error: Rate limit reached for model in organization on tokens per minute (TPM)");
        err.status = 429;
        err.code = "rate_limit_exceeded";
        throw err;
      },
    },
  });

  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 429);
  assert.match(res.body.error, /wait a few seconds/i);
  assert.doesNotMatch(res.body.error, /tokens per minute/i);
});

test("a Groq 429 with a known short retryAfterSeconds still says 'a few seconds', not a specific number", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() } });
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async () => {
        const err = new Error("Groq error: Rate limit reached. Please try again in 3.2s.");
        err.status = 429;
        err.retryAfterSeconds = 3.2;
        throw err;
      },
    },
  });

  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 429);
  assert.match(res.body.error, /wait a few seconds/i);
  assert.doesNotMatch(res.body.error, /\d+ seconds/); // no leaked specific number under 5s
});

test("a Groq 429 with a longer known retryAfterSeconds tells the player about how long to wait", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() } });
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async () => {
        const err = new Error("Groq error: Rate limit reached. Please try again in 17.4s.");
        err.status = 429;
        err.retryAfterSeconds = 17.4;
        throw err;
      },
    },
  });

  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 429);
  assert.match(res.body.error, /wait about 18 seconds/i); // rounded up from 17.4
});

function mockGroq429(t, retryAfterSeconds) {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() } });
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async () => {
        const err = new Error("Groq error: Rate limit reached.");
        err.status = 429;
        err.retryAfterSeconds = retryAfterSeconds;
        throw err;
      },
    },
  });
}

test("a Groq 429 with a wait measured in minutes reports minutes, not raw seconds", async (t) => {
  mockGroq429(t, 125); // 2m 5s
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 429);
  assert.match(res.body.error, /wait about 2 minutes/i);
  assert.doesNotMatch(res.body.error, /125 seconds/);
});

// Live example: a daily/hourly Groq quota (not just a per-minute burst) once
// reported exactly this — printing "3750 seconds" would be unreadable.
test("a Groq 429 with a wait measured in hours reports hours, not a huge seconds count", async (t) => {
  mockGroq429(t, 3750); // ~1h 2.5m
  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 429);
  assert.match(res.body.error, /wait about 1 hour\b/i);
  assert.doesNotMatch(res.body.error, /3750/);
});

test("a non-429 Groq error still surfaces as a 500 with the underlying message", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() } });
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async () => { throw new Error("Groq error: invalid API key"); },
    },
  });

  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } };
  const res = mockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /invalid API key/);
});

// Two calls are made to "overlap" by holding the first one's generateContent
// call open on a gate until the second call has had a chance to run — this is
// what real concurrent submissions from two devices look like, unlike two
// fully-sequential awaited calls (which never actually overlap in time).
function mockOverlappingGemini(t) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async () => {
        calls++;
        if (calls === 1) { await gate; return "First response."; }
        return "Second response.";
      },
    },
  });
  return { release };
}

async function letFirstCallReachGemini() {
  // A few macrotask turns are enough for the synchronous-ish work before the
  // generateContent call (getState, adult check, prompt building) to run.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

test("a second action turn for the same world while the first is still in flight is rejected with a friendly 429", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() } });
  const { release } = mockOverlappingGemini(t);
  const handler = freshHandler("../api/gm.js");
  const makeReq = () => ({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } });

  const res1 = mockRes();
  const firstCall = handler(makeReq(), res1);
  await letFirstCallReachGemini();

  const res2 = mockRes();
  await handler(makeReq(), res2);
  assert.equal(res2.statusCode, 429);
  assert.match(res2.body.error, /wait a few seconds/i);

  release();
  await firstCall;
  assert.equal(res1.statusCode, 200);
});

test("an overlapping turn for a DIFFERENT world is not blocked by another world's in-flight lock", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() } });
  const { release } = mockOverlappingGemini(t);
  const handler = freshHandler("../api/gm.js");

  const res1 = mockRes();
  const firstCall = handler({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } }, res1);
  await letFirstCallReachGemini();

  const res2 = mockRes();
  await handler({ method: "POST", headers: {}, query: { world: "c_test_spacing" }, body: { player: "player1", message: "I arrive", type: "action" } }, res2);
  assert.equal(res2.statusCode, 200);

  release();
  await firstCall;
  assert.equal(res1.statusCode, 200);
});

// Regression coverage for the "double roll" bug: if the same player has the
// game open on two devices, both can independently resume the very same
// pending roll and submit roll_result concurrently. roll_result used to be
// exempt from the in-flight lock (on the assumption it could never be a
// competing submission) — that exemption is what let both concurrent calls
// through and produced two GM narrations for one roll. Now every submission
// type takes the lock, so the second one is rejected instead.
test("two concurrent roll_result submissions for the same pending roll are serialized, not both allowed through", async (t) => {
  const seeded = seedPendingRoll(getWorldConfig("manlandia").getInitialState(), "player1");
  t.mock.module("../lib/redis.js", {
    exports: { getState: async () => seeded, setState: async () => {}, redisCommand: mockRedisCommand() },
  });
  const { release } = mockOverlappingGemini(t);
  const handler = freshHandler("../api/gm.js");
  const makeReq = () => ({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "rolled a 9", type: "roll_result" } });

  const res1 = mockRes();
  const firstCall = handler(makeReq(), res1);
  await letFirstCallReachGemini();

  const res2 = mockRes();
  await handler(makeReq(), res2);
  assert.equal(res2.statusCode, 429);

  release();
  await firstCall;
  assert.equal(res1.statusCode, 200);
});

// Complementary case: not concurrent, but delayed — the first roll_result
// already fully resolved (state saved, rolling flags cleared) by the time a
// second device's stale resume attempt arrives. The lock alone wouldn't
// catch this (it was already released), so this needs its own check.
test("a roll_result submitted after its pending roll was already resolved is rejected, not treated as a new turn", async (t) => {
  const seeded = seedPendingRoll(getWorldConfig("manlandia").getInitialState(), "player1");
  const redis = statefulRedisMock(seeded);
  t.mock.module("../lib/redis.js", redis);
  let generateContentCalls = 0;
  t.mock.module("../lib/gemini.js", {
    exports: { generateContent: async () => { generateContentCalls++; return "The door creaks open."; } },
  });
  const handler = freshHandler("../api/gm.js");
  const makeReq = () => ({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "rolled a 9", type: "roll_result" } });

  const res1 = mockRes();
  await handler(makeReq(), res1);
  assert.equal(res1.statusCode, 200);
  assert.equal(generateContentCalls, 1);

  const res2 = mockRes();
  await handler(makeReq(), res2);
  assert.equal(res2.statusCode, 409);
  assert.equal(generateContentCalls, 1); // the stale duplicate never reaches the model
});

test("a solo player submitting again right after their own turn resolves is never blocked", async (t) => {
  mockRedisAndGemini(t, "Fine.");
  const handler = freshHandler("../api/gm.js");
  const req = () => ({ method: "POST", headers: {}, query: { world: "c_dark_wars" }, body: { player: "player1", message: "I keep moving", type: "action" } });

  const res1 = mockRes();
  await handler(req(), res1);
  assert.equal(res1.statusCode, 200);

  // The first call fully resolved (and released its lock) before this one
  // even starts — this is what a real fast-Groq-response solo player looks
  // like, and must never be treated as a collision.
  const res2 = mockRes();
  await handler(req(), res2);
  assert.equal(res2.statusCode, 200);
});

test("the lock is released even when generateContent throws, so an immediate retry can succeed", async (t) => {
  t.mock.module("../lib/redis.js", { exports: { getState: async () => null, setState: async () => {}, redisCommand: mockRedisCommand() } });
  let shouldFail = true;
  t.mock.module("../lib/gemini.js", {
    exports: {
      generateContent: async () => {
        if (shouldFail) { shouldFail = false; throw new Error("Groq error: boom"); }
        return "Fine.";
      },
    },
  });
  const handler = freshHandler("../api/gm.js");
  const req = () => ({ method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I arrive", type: "action" } });

  const res1 = mockRes();
  await handler(req(), res1);
  assert.equal(res1.statusCode, 500);

  const res2 = mockRes();
  await handler(req(), res2);
  assert.equal(res2.statusCode, 200);
});

/* ── Solo/private scenes (Resonance-only) ── */

test("private: true stamps private_to on both the player and GM entries, for Resonance", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "Lyra investigates alone." } });

  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { player: "lyra", message: "I look around without Fen", type: "action", private: true } };
  await handler(req, mockRes());

  const log = redis.state.sessionLog;
  assert.equal(log.length, 2);
  assert.equal(log[0].private_to, "lyra");
  assert.equal(log[1].private_to, "lyra");
});

test("private scenes are Resonance-only — the flag is silently ignored for other world types", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "You look around." } });

  const handler = freshHandler("../api/gm.js");
  const req = { method: "POST", headers: {}, query: { world: "manlandia" }, body: { player: "player1", message: "I look around", type: "action", private: true } };
  await handler(req, mockRes());

  const log = redis.state.sessionLog;
  assert.equal(log[0].private_to, undefined);
  assert.equal(log[1].private_to, undefined);
});

test("a normal (non-private) Resonance turn never gets a private_to field", async (t) => {
  const redis = statefulRedisMock(null);
  t.mock.module("../lib/redis.js", redis);
  t.mock.module("../lib/gemini.js", { exports: { generateContent: async () => "Fen pours a drink." } });

  const handler = freshHandler("../api/gm.js");
  // soloOverride: Resonance's fen+lyra are both always "real" characters, so
  // a single-player submission would otherwise be held pending for the
  // wait-for-both turn gating — not what this test is about.
  const req = { method: "POST", headers: { "x-adult-pin": ADULT_PIN }, query: { world: "resonance" }, body: { player: "fen", message: "I work the bar", type: "action", soloOverride: true } };
  await handler(req, mockRes());

  const log = redis.state.sessionLog;
  assert.equal(log[0].private_to, undefined);
  assert.equal(log[1].private_to, undefined);
});
