function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() {},
  };
}

function freshRequire(modPath) {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

// Minimal INCR/EXPIRE backing so lib/ratelimit.js's checkRateLimit() works
// against these mocks without every test needing to know about it — a fresh
// counters map per mock instance means rate limiting never triggers unless a
// test explicitly calls a handler enough times to hit it.
function mockRedisCommand() {
  const counters = new Map();
  return async (cmd, key) => {
    if (cmd === "INCR") {
      const v = (counters.get(key) || 0) + 1;
      counters.set(key, v);
      return v;
    }
    if (cmd === "EXPIRE") return 1;
    throw new Error("unsupported command in mock: " + cmd);
  };
}

// A stateful in-memory stand-in for lib/redis.js's getState/setState, so a
// test can call a handler more than once and see state persisted between calls.
function statefulRedisMock(initial = null) {
  let state = initial;
  return {
    exports: {
      getState: async () => state,
      setState: async (key, value) => { state = value; },
      redisCommand: mockRedisCommand(),
    },
    get state() { return state; },
  };
}

// A keyed in-memory stand-in for lib/redis.js, for handlers (like api/campaigns.js)
// that read/write more than one Redis key in the same request.
function keyedRedisMock(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    exports: {
      getState: async (key) => (store.has(key) ? store.get(key) : null),
      setState: async (key, value) => { store.set(key, value); },
      redisCommand: mockRedisCommand(),
    },
    get(key) { return store.get(key); },
  };
}

module.exports = { mockRes, freshRequire, statefulRedisMock, keyedRedisMock };
