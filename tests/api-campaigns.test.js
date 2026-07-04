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

test("update requires a valid id, name, and theme", async (t) => {
  t.mock.module("../lib/redis.js", keyedRedisMock());

  const badId = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "update", payload: { id: "not-a-campaign", name: "A", theme: "T" } } });
  assert.equal(badId.statusCode, 400);

  const noName = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "update", payload: { id: "c_1", theme: "T" } } });
  assert.equal(noName.statusCode, 400);

  const noTheme = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "update", payload: { id: "c_1", name: "A" } } });
  assert.equal(noTheme.statusCode, 400);
});

test("update returns 404 for a campaign whose gamestate doesn't exist", async (t) => {
  t.mock.module("../lib/redis.js", keyedRedisMock());
  const res = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "update", payload: { id: "c_missing", name: "A", theme: "T" } } });
  assert.equal(res.statusCode, 404);
});

test("update changes name/theme on both the index and the campaign's own gamestate, but leaves playerCount and adult untouched", async (t) => {
  const redis = keyedRedisMock({
    "campaigns:index": [{ id: "c_1", name: "Star Reach", subtitle: "Space pirates", playerCount: 3, adult: true }],
    "campaign:c_1:gamestate": { worldConfig: { id: "c_1", name: "Star Reach", theme: "Space pirates", playerCount: 3, adult: true } },
  });
  t.mock.module("../lib/redis.js", redis);

  const res = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "update", payload: { id: "c_1", name: "Star Reach II", theme: "Space pirates hunting a lost relic" } } });
  assert.equal(res.body.ok, true);
  assert.equal(res.body.campaign.name, "Star Reach II");
  assert.equal(res.body.campaign.subtitle, "Space pirates hunting a lost relic");

  const indexEntry = redis.get("campaigns:index")[0];
  assert.equal(indexEntry.name, "Star Reach II");
  // Untouched even though not in the payload — playerCount/adult are locked.
  assert.equal(indexEntry.playerCount, 3);
  assert.equal(indexEntry.adult, true);

  const gs = redis.get("campaign:c_1:gamestate");
  assert.equal(gs.worldConfig.name, "Star Reach II");
  assert.equal(gs.worldConfig.theme, "Space pirates hunting a lost relic");
  assert.equal(gs.worldConfig.playerCount, 3);
  assert.equal(gs.worldConfig.adult, true);
});

test("update ignores a playerCount or adult value sent in the payload", async (t) => {
  const redis = keyedRedisMock({
    "campaigns:index": [{ id: "c_1", name: "Star Reach", subtitle: "Space pirates", playerCount: 2, adult: false }],
    "campaign:c_1:gamestate": { worldConfig: { id: "c_1", name: "Star Reach", theme: "Space pirates", playerCount: 2, adult: false } },
  });
  t.mock.module("../lib/redis.js", redis);

  await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "update", payload: { id: "c_1", name: "Star Reach", theme: "Space pirates", playerCount: 4, adult: true } } });
  assert.equal(redis.get("campaign:c_1:gamestate").worldConfig.playerCount, 2);
  assert.equal(redis.get("campaign:c_1:gamestate").worldConfig.adult, false);
  assert.equal(redis.get("campaigns:index")[0].playerCount, 2);
  assert.equal(redis.get("campaigns:index")[0].adult, false);
});

test("update truncates an overly long name and theme", async (t) => {
  const redis = keyedRedisMock({
    "campaigns:index": [{ id: "c_1", name: "Star Reach", subtitle: "Space pirates" }],
    "campaign:c_1:gamestate": { worldConfig: { id: "c_1", name: "Star Reach", theme: "Space pirates" } },
  });
  t.mock.module("../lib/redis.js", redis);

  const longName  = "N".repeat(100);
  const longTheme = "T".repeat(1000);
  await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "update", payload: { id: "c_1", name: longName, theme: longTheme } } });
  assert.equal(redis.get("campaign:c_1:gamestate").worldConfig.name.length, 40);
  assert.equal(redis.get("campaign:c_1:gamestate").worldConfig.theme.length, 600);
  assert.ok(redis.get("campaigns:index")[0].subtitle.endsWith("…"));
});

test("create marks a new campaign as active by default", async (t) => {
  const redis = keyedRedisMock();
  t.mock.module("../lib/redis.js", redis);
  const res = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "create", payload: { name: "Star Reach", theme: "Space pirates" } } });
  assert.equal(res.body.campaign.status, "active");
});

test("archive and unarchive toggle a campaign's status, reversibly", async (t) => {
  const redis = keyedRedisMock({ "campaigns:index": [{ id: "c_1", name: "Star Reach", status: "active" }] });
  t.mock.module("../lib/redis.js", redis);

  const archived = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "archive", payload: { id: "c_1" } } });
  assert.equal(archived.body.ok, true);
  assert.equal(redis.get("campaigns:index")[0].status, "archived");

  const restored = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "unarchive", payload: { id: "c_1" } } });
  assert.equal(restored.body.ok, true);
  assert.equal(redis.get("campaigns:index")[0].status, "active");
});

test("archive rejects an invalid id or a campaign that doesn't exist", async (t) => {
  const redis = keyedRedisMock({ "campaigns:index": [{ id: "c_1", name: "Star Reach", status: "active" }] });
  t.mock.module("../lib/redis.js", redis);

  const badId = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "archive", payload: { id: "not-a-campaign" } } });
  assert.equal(badId.statusCode, 400);

  const missing = await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "archive", payload: { id: "c_999" } } });
  assert.equal(missing.statusCode, 404);
});

test("archiving one campaign leaves the others untouched", async (t) => {
  const redis = keyedRedisMock({ "campaigns:index": [
    { id: "c_1", name: "Star Reach", status: "active" },
    { id: "c_2", name: "Dark Wars", status: "active" },
  ] });
  t.mock.module("../lib/redis.js", redis);

  await callCampaigns({ method: "POST", headers: {}, query: {}, body: { action: "archive", payload: { id: "c_1" } } });
  const index = redis.get("campaigns:index");
  assert.equal(index.find(c => c.id === "c_1").status, "archived");
  assert.equal(index.find(c => c.id === "c_2").status, "active");
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
