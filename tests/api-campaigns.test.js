const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockRes, freshRequire, keyedRedisMock } = require("./helpers");

function callCampaigns(req) {
  const handler = freshRequire("../api/campaigns.js");
  const res = mockRes();
  return handler(req, res).then(() => res);
}

test("GET returns an empty campaigns array when nothing is stored", async (t) => {
  t.mock.module("../lib/redis.js", keyedRedisMock());
  const res = await callCampaigns({ method: "GET", headers: {}, query: {}, body: {} });
  assert.deepEqual(res.body, { campaigns: [] });
});

test("create requires both a name and a theme", async (t) => {
  t.mock.module("../lib/redis.js", keyedRedisMock());

  const noName = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { theme: "Space pirates" } } });
  assert.equal(noName.statusCode, 400);

  const noTheme = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "Star Reach" } } });
  assert.equal(noTheme.statusCode, 400);
});

test("create clamps playerCount into 1-4 and defaults invalid values to 2", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);

  // 0 is falsy, so it hits the "|| 2" default rather than the floor-clamp — a negative
  // number is needed to actually exercise Math.max(1, ...).
  const negative = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "A", theme: "T", playerCount: -5 } } });
  assert.equal(negative.body.campaign.playerCount, 1);

  const zero = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "A0", theme: "T", playerCount: 0 } } });
  assert.equal(zero.body.campaign.playerCount, 2);

  const ten = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "B", theme: "T", playerCount: 10 } } });
  assert.equal(ten.body.campaign.playerCount, 4);

  const nonNumeric = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "C", theme: "T", playerCount: "banana" } } });
  assert.equal(nonNumeric.body.campaign.playerCount, 2);
});

test("create only sets adult:true when explicitly passed as boolean true", async (t) => {
  t.mock.module("../lib/redis.js", keyedRedisMock());

  const truthyString = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "A", theme: "T", adult: "true" } } });
  assert.equal(truthyString.body.campaign.adult, false);

  const realBool = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "A", theme: "T", adult: true } } });
  assert.equal(realBool.body.campaign.adult, true);
});

test("create appends to the campaign index and writes a separate gamestate key", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);

  const res = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "Star Reach", theme: "Space pirates hunting a lost relic", playerCount: 3 } } });
  const id = res.body.campaign.id;

  assert.match(id, /^c_\d+$/);
  assert.equal(redis.get("campaigns:index").length, 1);
  assert.equal(redis.get("campaigns:index")[0].id, id);
  assert.ok(redis.get(`campaign:${id}:gamestate`), "gamestate for the new campaign should be persisted under its own key");
  assert.equal(redis.get(`campaign:${id}:gamestate`).worldConfig.playerCount, 3);
});

test("create truncates overly long names and themes, and shortens the subtitle with an ellipsis", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);

  const longName = "N".repeat(100);
  const longTheme = "T".repeat(1000);
  const res = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: longName, theme: longTheme } } });

  assert.equal(res.body.campaign.name.length, 40);
  assert.ok(res.body.campaign.subtitle.endsWith("…"));
  assert.equal(redis.get(`campaign:${res.body.campaign.id}:gamestate`).worldConfig.theme.length, 600);
});

test("delete removes the campaign from the index but rejects a non c_ id", async (t) => {
  const redis = keyedRedisMock({ "campaigns:index": [{ id: "c_1", name: "Star Reach" }, { id: "c_2", name: "Dark Wars" }] });
  t.mock.module("../lib/redis.js", redis);

  const bad = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "delete", payload: { id: "not-a-campaign" } } });
  assert.equal(bad.statusCode, 400);

  const good = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "delete", payload: { id: "c_1" } } });
  assert.equal(good.body.ok, true);
  assert.deepEqual(redis.get("campaigns:index").map(c => c.id), ["c_2"]);
});

test("an unknown action returns 400", async (t) => {
  t.mock.module("../lib/redis.js", keyedRedisMock());
  const res = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "not_real" } });
  assert.equal(res.statusCode, 400);
});
