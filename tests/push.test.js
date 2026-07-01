const { test } = require("node:test");
const assert = require("node:assert/strict");
const { selectNotifyTargets, buildNotificationPayload } = require("../lib/push");

test("selectNotifyTargets excludes the sender's own devices but includes everyone else", () => {
  const subs = [
    { player: "player1", endpoint: "a" },
    { player: "player1", endpoint: "a2" },
    { player: "player2", endpoint: "b" },
    { player: "player3", endpoint: "c" },
  ];
  const targets = selectNotifyTargets(subs, "player1");
  assert.deepEqual(targets.map((t) => t.endpoint), ["b", "c"]);
});

test("selectNotifyTargets returns an empty array when nobody else is subscribed", () => {
  const subs = [{ player: "fen", endpoint: "a" }];
  assert.deepEqual(selectNotifyTargets(subs, "fen"), []);
});

test("selectNotifyTargets handles a world with no subscriptions at all", () => {
  assert.deepEqual(selectNotifyTargets(null, "fen"), []);
  assert.deepEqual(selectNotifyTargets(undefined, "fen"), []);
  assert.deepEqual(selectNotifyTargets([], "fen"), []);
});

test("buildNotificationPayload is generic and never includes story content", () => {
  const payload = buildNotificationPayload("Manlandia", "Taisha");
  assert.equal(payload.title, "Manlandia");
  assert.equal(payload.body, "Taisha took a turn — tap to see what happens!");
});
