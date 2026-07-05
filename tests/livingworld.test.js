const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildAmbientPrompt, AMBIENT_TRIGGER } = require("../lib/livingworld");

test("AMBIENT_TRIGGER is a plain, non-empty string", () => {
  assert.equal(typeof AMBIENT_TRIGGER, "string");
  assert.ok(AMBIENT_TRIGGER.length > 0);
});

test("buildAmbientPrompt never mentions bracket-tag notation, for any world type", () => {
  const resonance = buildAmbientPrompt({ id: "resonance" }, {});
  const manlandia = buildAmbientPrompt({ id: "manlandia" }, {});
  const custom = buildAmbientPrompt({ id: "c_test", type: "custom" }, { worldConfig: { name: "Star Reach", theme: "Space pirates", adult: false } });

  for (const prompt of [resonance, manlandia, custom]) {
    assert.doesNotMatch(prompt, /\[OBJECTIVE|\[LOCATION|\[CLUE|\[CHARACTER|\[NPC|\[ITEM|STATE NOTATION/i);
  }
});

test("buildAmbientPrompt is Varek/Conclave-flavored for Resonance", () => {
  const prompt = buildAmbientPrompt({ id: "resonance" }, {});
  assert.match(prompt, /Varek/);
  assert.match(prompt, /Conclave/);
});

test("buildAmbientPrompt is Manlandia/curse-flavored for Manlandia", () => {
  const prompt = buildAmbientPrompt({ id: "manlandia" }, {});
  assert.match(prompt, /Manlandia/);
  assert.match(prompt, /Greying Curse/);
});

test("buildAmbientPrompt uses the custom world's own name/theme, and picks kid-safe tone for a non-adult campaign", () => {
  const prompt = buildAmbientPrompt(
    { id: "c_test", type: "custom" },
    { worldConfig: { name: "Star Reach", theme: "Space pirates", adult: false } }
  );
  assert.match(prompt, /Star Reach/);
  assert.match(prompt, /Space pirates/);
  assert.match(prompt, /kid-safe/i);
});

test("buildAmbientPrompt picks a mature tone for an adult-flagged custom campaign", () => {
  const prompt = buildAmbientPrompt(
    { id: "c_test", type: "custom" },
    { worldConfig: { name: "Dark Wars", theme: "Space adventure", adult: true } }
  );
  assert.match(prompt, /mature|tense|dramatic/i);
  assert.doesNotMatch(prompt, /kid-safe/i);
});
