const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire } = require("./helpers");

function callVapid(req) {
  const handler = freshRequire("../api/vapid-public-key.js");
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("returns the configured public key", async () => {
  process.env.VAPID_PUBLIC_KEY = "test-public-key";
  try {
    const res = await callVapid({ method: "GET" });
    assert.equal(res.body.publicKey, "test-public-key");
  } finally {
    delete process.env.VAPID_PUBLIC_KEY;
  }
});

test("returns a clear error when push isn't configured yet", async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  const res = await callVapid({ method: "GET" });
  assert.equal(res.statusCode, 500);
  assert.ok(res.body.error);
});

test("rejects non-GET methods", async () => {
  const res = await callVapid({ method: "POST" });
  assert.equal(res.statusCode, 405);
});
