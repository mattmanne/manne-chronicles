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

// A stateful in-memory stand-in for lib/redis.js's getState/setState, so a
// test can call a handler more than once and see state persisted between calls.
function statefulRedisMock(initial = null) {
  let state = initial;
  return {
    exports: {
      getState: async () => state,
      setState: async (key, value) => { state = value; },
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
    },
    get(key) { return store.get(key); },
  };
}

module.exports = { mockRes, freshRequire, statefulRedisMock, keyedRedisMock };
