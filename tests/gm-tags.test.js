const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeHarm, buildNameToKeyMap, extractRoll, extractCounterUpdate,
  extractCharacterHarmUpdates, extractResonanceHarmUpdates, extractAbilityUsedKeys,
} = require("../lib/gm-tags");

/* ── extractRoll — every variant below is a real string captured from live campaigns ── */

test("extractRoll recognizes the documented bracket-free format", () => {
  const r = extractRoll("You reach for the door.\nROLL:AGILITY");
  assert.deepEqual(r, { clean: "You reach for the door.", needsRoll: true, rollStat: "agility", rollAdvantage: false });
});

test("extractRoll recognizes ROLL:[STAT] — what the model actually writes in practice", () => {
  const r = extractRoll("The creature's eyes lock onto you.\n\nROLL:[ACUITY] ");
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollStat, "acuity");
  assert.equal(r.clean, "The creature's eyes lock onto you.");
});

test("extractRoll recognizes a space after the colon (live: 'ROLL: [AGILITY]')", () => {
  const r = extractRoll("You try to slip past.\nROLL: [AGILITY]");
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollStat, "agility");
});

test("extractRoll strips a stray ROLL: line the model prefixed onto its own explanation, live example", () => {
  // Captured verbatim from a real Manlandia turn: the model wrote "ROLL:" twice —
  // once prefixing its own explanation sentence, then again for the real trigger.
  const raw = "**What do you do?**\n• Investigate.\n\nROLL: This looks tricky! To investigate the mist, you'll need to be careful and stealthy. Roll your Agility — high numbers mean you move quietly and quickly; low numbers mean you make some noise and might attract attention. \nROLL: [AGILITY]";
  const r = extractRoll(raw);
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollStat, "agility");
  assert.doesNotMatch(r.clean, /ROLL:/i);
});

test("extractRoll is case-insensitive", () => {
  const r = extractRoll("You hide.\nroll:[agility]");
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollStat, "agility");
});

test("extractRoll recognizes ADVANTAGE with brackets", () => {
  const r = extractRoll("Nobody notices you.\nROLL:[AGILITY]:ADVANTAGE");
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollAdvantage, true);
});

test("extractRoll strips an unrecognized stat from display without triggering a roll (live: PERCEPTION isn't a real stat)", () => {
  const r = extractRoll("The creature's eyes lock onto you.\nROLL:[PERCEPTION]");
  assert.equal(r.needsRoll, false);
  assert.equal(r.clean, "The creature's eyes lock onto you.");
});

test("extractRoll leaves narration with no ROLL: line completely untouched", () => {
  const r = extractRoll("Nothing risky happens here.");
  assert.equal(r.needsRoll, false);
  assert.equal(r.clean, "Nothing risky happens here.");
});

/* ── normalizeHarm ── */

test("normalizeHarm matches case-insensitively and returns the canonical spelling", () => {
  assert.equal(normalizeHarm("unhurt"), "Unhurt");
  assert.equal(normalizeHarm("SCRATCHED"), "Scratched");
  assert.equal(normalizeHarm("  Hurt  "), "Hurt");
});

test("normalizeHarm rejects anything that isn't a real harm level", () => {
  assert.equal(normalizeHarm("Dead"), null);
  assert.equal(normalizeHarm(""), null);
  assert.equal(normalizeHarm(null), null);
});

/* ── extractCounterUpdate ── */

test("extractCounterUpdate matches the Unicode arrow", () => {
  assert.equal(extractCounterUpdate("[CURSE: 1 → 2]", "CURSE"), 2);
});

test("extractCounterUpdate also matches an ASCII arrow, in case the model ever uses one", () => {
  assert.equal(extractCounterUpdate("[CURSE: 1 -> 2]", "CURSE"), 2);
});

test("extractCounterUpdate tolerates extra whitespace and is case-insensitive", () => {
  assert.equal(extractCounterUpdate("[curse:  1   →   2 ]", "CURSE"), 2);
});

test("extractCounterUpdate returns null when the tag isn't present", () => {
  assert.equal(extractCounterUpdate("Nothing here.", "CURSE"), null);
});

/* ── extractCharacterHarmUpdates ── */

test("extractCharacterHarmUpdates matches the documented CHARACTER N format", () => {
  const characters = { player2: { name: "Taisha" } };
  const updates = extractCharacterHarmUpdates("[CHARACTER 2: Unhurt → Hurt]", characters);
  assert.deepEqual(updates, [{ key: "player2", harm: "Hurt" }]);
});

test("extractCharacterHarmUpdates also matches the hero's real name — live example: '[Globak: Unhurt → Scratched]'", () => {
  const characters = { player1: { name: "Globak" }, player2: { name: "Orion" } };
  const updates = extractCharacterHarmUpdates("Your lack of agility has put the mission at risk. You're now:\n[Globak: Unhurt → Scratched]", characters);
  assert.deepEqual(updates, [{ key: "player1", harm: "Scratched" }]);
});

test("extractCharacterHarmUpdates ignores a name that isn't any known character", () => {
  const characters = { player1: { name: "Globak" } };
  const updates = extractCharacterHarmUpdates("[Stranger: Unhurt → Hurt]", characters);
  assert.deepEqual(updates, []);
});

test("extractCharacterHarmUpdates ignores an unrecognized harm word", () => {
  const characters = { player1: { name: "Globak" } };
  const updates = extractCharacterHarmUpdates("[Globak: Unhurt → Dead]", characters);
  assert.deepEqual(updates, []);
});

test("extractCharacterHarmUpdates does not confuse a CURSE or VILLAIN AWARENESS tag for a named-hero tag", () => {
  const characters = { player1: { name: "Globak" } };
  const updates = extractCharacterHarmUpdates("[CURSE: 0 → 1] [VILLAIN AWARENESS: 0 → 1]", characters);
  assert.deepEqual(updates, []);
});

test("extractCharacterHarmUpdates handles the arrow-less variant — live example: '[CHARACTER 1: Hurt]'", () => {
  const characters = { player1: { name: "Sumai" } };
  const updates = extractCharacterHarmUpdates("[CHARACTER 1: Hurt]", characters);
  assert.deepEqual(updates, [{ key: "player1", harm: "Hurt" }]);
});

test("extractCharacterHarmUpdates does not double-count an arrow-less match inside a well-formed arrow tag", () => {
  const characters = { player1: { name: "Sumai" } };
  const updates = extractCharacterHarmUpdates("[CHARACTER 1: Scratched → Hurt]", characters);
  assert.deepEqual(updates, [{ key: "player1", harm: "Hurt" }]);
});

/* ── extractResonanceHarmUpdates ── */

test("extractResonanceHarmUpdates matches LYRA/FEN with either arrow style", () => {
  assert.deepEqual(extractResonanceHarmUpdates("[LYRA: Unhurt → Scratched]"), [{ key: "lyra", harm: "Scratched" }]);
  assert.deepEqual(extractResonanceHarmUpdates("[FEN: Unhurt -> Hurt]"), [{ key: "fen", harm: "Hurt" }]);
});

test("extractResonanceHarmUpdates ignores an unrecognized harm word", () => {
  assert.deepEqual(extractResonanceHarmUpdates("[LYRA: Unhurt → Deceased]"), []);
});

/* ── extractAbilityUsedKeys ── */

test("extractAbilityUsedKeys matches the documented plain format", () => {
  const characters = { player1: {} };
  assert.deepEqual(extractAbilityUsedKeys("[ABILITY 1: used]", characters), ["player1"]);
});

test("extractAbilityUsedKeys tolerates the model padding in the ability's name", () => {
  const characters = { player1: {} };
  assert.deepEqual(extractAbilityUsedKeys("[ABILITY 1: Lucky Break used]", characters), ["player1"]);
});

test("extractAbilityUsedKeys does NOT fire on an explicit negation — live example: '[ABILITY 1: Lucky Break - not used]'", () => {
  const characters = { player1: {} };
  assert.deepEqual(extractAbilityUsedKeys("[ABILITY 1: Lucky Break - not used]", characters), []);
});

test("extractAbilityUsedKeys ignores a character slot that doesn't exist", () => {
  const characters = { player1: {} };
  assert.deepEqual(extractAbilityUsedKeys("[ABILITY 3: used]", characters), []);
});

/* ── buildNameToKeyMap ── */

test("buildNameToKeyMap lowercases names and skips characters with no name yet", () => {
  const characters = { player1: { name: "Globak" }, player2: {}, player3: { name: "Orion" } };
  assert.deepEqual(buildNameToKeyMap(characters), { globak: "player1", orion: "player3" });
});
