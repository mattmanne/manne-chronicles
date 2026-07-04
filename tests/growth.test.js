const { test } = require("node:test");
const assert = require("node:assert/strict");
const { applyXpGain, chooseAbility, ABILITY_POOL } = require("../lib/growth");

const KID_CFG = { badgeXp: 15, abilityXp: 50, abilityPool: ABILITY_POOL };

test("applyXpGain accumulates xp on top of the character's existing total", () => {
  const result = applyXpGain({ xp: 5 }, 10, KID_CFG);
  assert.equal(result.xp, 15);
});

test("applyXpGain treats a missing or negative amount as zero gain", () => {
  assert.equal(applyXpGain({ xp: 5 }, 0, KID_CFG).xp, 5);
  assert.equal(applyXpGain({ xp: 5 }, -20, KID_CFG).xp, 5);
  assert.equal(applyXpGain({ xp: 5 }, undefined, KID_CFG).xp, 5);
});

test("applyXpGain awards a milestone badge once xp crosses the threshold", () => {
  const result = applyXpGain({ xp: 10 }, 10, KID_CFG); // 20 xp, threshold 15
  assert.equal(result.milestones.length, 1);
});

test("applyXpGain awards multiple badges in one jump if xp crosses several thresholds at once", () => {
  const result = applyXpGain({ xp: 0 }, 50, KID_CFG); // thresholds at 15, 30, 45
  assert.equal(result.milestones.length, 3);
});

test("applyXpGain does not re-award a badge that was already earned", () => {
  const result = applyXpGain({ xp: 16, milestones: ["Rising Hero"] }, 1, KID_CFG); // 17 xp, still under 30
  assert.equal(result.milestones.length, 1);
});

test("applyXpGain sets a pending_choice once the ability threshold is crossed, offering up to 3 unowned abilities", () => {
  const character = { xp: 40, ability_id: "lucky_break", bonus_abilities: [] };
  const result = applyXpGain(character, 10, KID_CFG); // 50 xp, threshold 50
  assert.ok(result.pending_choice);
  assert.equal(result.pending_choice.options.length, 3);
  assert.ok(!result.pending_choice.options.includes("lucky_break"));
});

test("applyXpGain does not overwrite an already-pending choice with a new one", () => {
  const character = { xp: 90, ability_id: "lucky_break", bonus_abilities: [], pending_choice: { options: ["animal_friend"] } };
  const result = applyXpGain(character, 10, KID_CFG);
  assert.deepEqual(result.pending_choice, { options: ["animal_friend"] });
});

test("applyXpGain offers no choice once every ability in the pool is already owned", () => {
  const character = { xp: 140, ability_id: "lucky_break", bonus_abilities: ["animal_friend", "protect_friend", "ancient_magic"] };
  const result = applyXpGain(character, 10, KID_CFG);
  assert.equal(result.pending_choice, null);
});

test("applyXpGain's ability threshold scales up after each unlock (evenly spaced multiples)", () => {
  // Already unlocked one bonus ability — next threshold should be 2 * abilityXp = 100, not 50 again.
  const character = { xp: 60, ability_id: "lucky_break", bonus_abilities: ["animal_friend"] };
  const notYet = applyXpGain(character, 10, KID_CFG); // 70 xp, still under 100
  assert.equal(notYet.pending_choice, null);

  const crosses = applyXpGain(character, 40, KID_CFG); // 100 xp
  assert.ok(crosses.pending_choice);
});

test("chooseAbility adds the picked ability to bonus_abilities and clears the pending choice", () => {
  const character = { bonus_abilities: [], pending_choice: { options: ["animal_friend", "protect_friend"] } };
  const result = chooseAbility(character, "animal_friend");
  assert.deepEqual(result.bonus_abilities, ["animal_friend"]);
  assert.equal(result.pending_choice, null);
});

test("chooseAbility returns null for a choice that wasn't actually offered", () => {
  const character = { bonus_abilities: [], pending_choice: { options: ["animal_friend"] } };
  assert.equal(chooseAbility(character, "ancient_magic"), null);
});

test("chooseAbility returns null when there's no pending choice at all", () => {
  assert.equal(chooseAbility({ bonus_abilities: [], pending_choice: null }, "animal_friend"), null);
});
