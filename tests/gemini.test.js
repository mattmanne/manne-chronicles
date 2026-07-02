const { test } = require("node:test");
const assert = require("node:assert");
const { freshRequire } = require("./helpers");

async function flushMicrotasks(times = 10) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

test("generateContent retries once on a 429 and returns the retry's result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 1) {
      return { status: 429, json: async () => ({ error: { message: "rate limit reached", code: "rate_limit_exceeded" } }) };
    }
    return { status: 200, json: async () => ({ choices: [{ message: { content: "ok after retry" } }] }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const { generateContent } = freshRequire("../lib/gemini.js");
  const promise = generateContent("sys", [], "hi");
  await flushMicrotasks();
  await t.mock.timers.tick(1500);
  const result = await promise;

  assert.equal(result, "ok after retry");
  assert.equal(calls, 2);
});

test("generateContent falls back to the smaller model, with a trimmed history and lower token budget, when the primary is still 429 after retrying", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = global.fetch;
  const modelsUsed = [];
  let fallbackBody = null;
  global.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    modelsUsed.push(body.model);
    if (body.model === "llama-3.3-70b-versatile") {
      return { status: 429, json: async () => ({ error: { message: "rate limit reached", code: "rate_limit_exceeded" } }) };
    }
    fallbackBody = body;
    return { status: 200, json: async () => ({ choices: [{ message: { content: "ok from fallback model" } }] }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const longHistory = Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `turn ${i}` }));
  const { generateContent } = freshRequire("../lib/gemini.js");
  const promise = generateContent("sys", longHistory, "hi");
  await flushMicrotasks();
  await t.mock.timers.tick(1500);
  const result = await promise;

  assert.equal(result, "ok from fallback model");
  assert.deepEqual(modelsUsed, ["llama-3.3-70b-versatile", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]);
  // Only the most recent 6 history entries and a much smaller response
  // budget — the fallback model's free-tier TPM is a fraction of the
  // primary's, confirmed live against the real Groq account (6000 TPM vs.
  // the request this app normally sends).
  assert.equal(fallbackBody.max_tokens, 400);
  const historySent = fallbackBody.messages.slice(1, -1); // drop system + trailing user message
  assert.deepEqual(historySent, longHistory.slice(-6));
});

test("generateContent throws the primary's 429 (with its retryAfterSeconds) when the fallback model also fails", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return {
      status: 429,
      headers: { get: (name) => (name === "retry-after" ? "20" : null) },
      json: async () => ({ error: { message: "rate limit reached", code: "rate_limit_exceeded" } }),
    };
  };
  t.after(() => { global.fetch = originalFetch; });

  const { generateContent } = freshRequire("../lib/gemini.js");
  const promise = generateContent("sys", [], "hi");
  await flushMicrotasks();
  await t.mock.timers.tick(1500);

  try {
    await promise;
    assert.fail("expected generateContent to reject");
  } catch (err) {
    assert.match(err.message, /Groq error: rate limit reached/);
    assert.equal(err.retryAfterSeconds, 20);
  }
  assert.equal(calls, 3); // primary, primary retry, fallback
});

test("generateContent throws immediately on a non-429 error, without retrying", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { status: 500, json: async () => ({ error: { message: "boom" } }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const { generateContent } = freshRequire("../lib/gemini.js");
  await assert.rejects(() => generateContent("sys", [], "hi"), /Groq error: boom/);
  assert.equal(calls, 1);
});

test("generateContent returns the message content on success", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ status: 200, json: async () => ({ choices: [{ message: { content: "hello" } }] }) });
  t.after(() => { global.fetch = originalFetch; });

  const { generateContent } = freshRequire("../lib/gemini.js");
  const result = await generateContent("sys", [], "hi");
  assert.equal(result, "hello");
});

test("a 429's thrown error carries retryAfterSeconds from the Retry-After header when present", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    status: 429,
    headers: { get: (name) => (name === "retry-after" ? "12" : null) },
    json: async () => ({ error: { message: "Rate limit reached. Please try again in 3.6s.", code: "rate_limit_exceeded" } }),
  });
  t.after(() => { global.fetch = originalFetch; });

  const { generateContent } = freshRequire("../lib/gemini.js");
  const promise = generateContent("sys", [], "hi");
  await flushMicrotasks();
  await t.mock.timers.tick(1500);

  try {
    await promise;
    assert.fail("expected generateContent to reject");
  } catch (err) {
    assert.equal(err.retryAfterSeconds, 12); // header wins over the text in the message
  }
});

test("a 429's thrown error falls back to parsing 'try again in X.Xs' from the message when there's no header", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    status: 429,
    headers: { get: () => null },
    json: async () => ({ error: { message: "Rate limit reached. Please try again in 3.6s.", code: "rate_limit_exceeded" } }),
  });
  t.after(() => { global.fetch = originalFetch; });

  const { generateContent } = freshRequire("../lib/gemini.js");
  const promise = generateContent("sys", [], "hi");
  await flushMicrotasks();
  await t.mock.timers.tick(1500);

  try {
    await promise;
    assert.fail("expected generateContent to reject");
  } catch (err) {
    assert.equal(err.retryAfterSeconds, 3.6);
  }
});

test("a 429's thrown error has a null retryAfterSeconds when neither a header nor message text is available", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = global.fetch;
  global.fetch = async () => ({ status: 429, json: async () => ({ error: { message: "Rate limited.", code: "rate_limit_exceeded" } }) });
  t.after(() => { global.fetch = originalFetch; });

  const { generateContent } = freshRequire("../lib/gemini.js");
  const promise = generateContent("sys", [], "hi");
  await flushMicrotasks();
  await t.mock.timers.tick(1500);

  try {
    await promise;
    assert.fail("expected generateContent to reject");
  } catch (err) {
    assert.equal(err.retryAfterSeconds, null);
  }
});
