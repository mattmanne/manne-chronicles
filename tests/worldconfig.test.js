const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getWorldConfig } = require("../lib/worldconfig");

test("resonance resolves to its own key and prompt builder", () => {
  const wc = getWorldConfig("resonance");
  assert.equal(wc.id, "resonance");
  assert.equal(wc.key, "resonance:gamestate");
  assert.equal(typeof wc.getInitialState, "function");
  assert.equal(typeof wc.buildSystemPrompt, "function");
});

test("manlandia resolves to its own key and prompt builder", () => {
  const wc = getWorldConfig("manlandia");
  assert.equal(wc.id, "manlandia");
  assert.equal(wc.key, "manlandia:gamestate");
});

test("a c_ prefixed id resolves to a custom world with a namespaced Redis key", () => {
  const wc = getWorldConfig("c_1782834686899");
  assert.equal(wc.id, "c_1782834686899");
  assert.equal(wc.type, "custom");
  assert.equal(wc.key, "campaign:c_1782834686899:gamestate");
  assert.equal(typeof wc.getInitialState, "function");
  assert.equal(typeof wc.buildSystemPrompt, "function");
});

test("an unknown, empty, or missing world id falls back to resonance", () => {
  assert.equal(getWorldConfig("not_a_real_world").id, "resonance");
  assert.equal(getWorldConfig("").id, "resonance");
  assert.equal(getWorldConfig(undefined).id, "resonance");
  assert.equal(getWorldConfig(null).id, "resonance");
});

test("a bare 'c' with no suffix does not match the custom-world prefix check incorrectly", () => {
  // "c_" prefix check requires the underscore; "c" alone should fall back to resonance.
  assert.equal(getWorldConfig("c").id, "resonance");
});
