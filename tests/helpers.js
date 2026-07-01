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
  // lib/ratelimit.js destructures redisCommand out of lib/redis.js once, at
  // require time — if it's still cached from an earlier test in this file,
  // it keeps using that test's (possibly now-stale) mocked redisCommand
  // instead of the one just registered via t.mock.module. Always clearing it
  // here forces a rebind against whatever mock is currently active.
  delete require.cache[require.resolve("../lib/ratelimit.js")];
  return require(modPath);
}

// Minimal INCR/EXPIRE/SET/DEL/GET backing so lib/ratelimit.js's checkRateLimit()
// and api/gm.js's SET-NX turn lock both work against these mocks without every
// test needing to know about it — a fresh store per mock instance means
// neither kicks in unless a test explicitly calls a handler enough times, or
// concurrently enough, to hit it. TTLs (EXPIRE seconds, SET PX/EX) are tracked
// against real wall-clock time — fine since no test needs to fast-forward past
// one, only to see NX correctly fail while an entry is still live.
function mockRedisCommand() {
  const store = new Map(); // key -> { value, expiresAt: epoch-ms|null }
  const live = (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) { store.delete(key); return null; }
    return entry;
  };
  return async (cmd, ...args) => {
    if (cmd === "INCR") {
      const [key] = args;
      const entry = live(key);
      const next = (entry ? Number(entry.value) : 0) + 1;
      store.set(key, { value: String(next), expiresAt: entry ? entry.expiresAt : null });
      return next;
    }
    if (cmd === "EXPIRE") {
      const [key, seconds] = args;
      const entry = store.get(key);
      if (entry) entry.expiresAt = Date.now() + Number(seconds) * 1000;
      return 1;
    }
    if (cmd === "SET") {
      const [key, value, ...opts] = args;
      const nx = opts.includes("NX");
      if (nx && live(key)) return null;
      let expiresAt = null;
      const pxIdx = opts.indexOf("PX");
      const exIdx = opts.indexOf("EX");
      if (pxIdx !== -1) expiresAt = Date.now() + Number(opts[pxIdx + 1]);
      else if (exIdx !== -1) expiresAt = Date.now() + Number(opts[exIdx + 1]) * 1000;
      store.set(key, { value: String(value), expiresAt });
      return "OK";
    }
    if (cmd === "DEL") {
      const [key] = args;
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }
    if (cmd === "GET") {
      const [key] = args;
      const entry = live(key);
      return entry ? entry.value : null;
    }
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

module.exports = { mockRes, freshRequire, statefulRedisMock, keyedRedisMock, mockRedisCommand };
