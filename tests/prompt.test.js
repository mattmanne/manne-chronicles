const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSystemPrompt } = require("../lib/prompt");
const { buildSystemPromptManlandia } = require("../lib/prompt-manlandia");
const { buildSystemPromptCustom } = require("../lib/prompt-custom");
const { getInitialState } = require("../lib/gamestate");
const { getInitialStateManlandia } = require("../lib/gamestate-manlandia");
const { getInitialStateCustom } = require("../lib/gamestate-custom");

test("buildSystemPrompt (Resonance) includes the Author's Note when set", () => {
  const gs = getInitialState();
  gs.worldState.author_note = "Fen secretly loves cooking shows.";
  const prompt = buildSystemPrompt(gs);
  assert.match(prompt, /AUTHOR'S NOTE/);
  assert.match(prompt, /Fen secretly loves cooking shows\./);
});

test("buildSystemPrompt (Resonance) omits the Author's Note block when empty", () => {
  const gs = getInitialState();
  const prompt = buildSystemPrompt(gs);
  assert.doesNotMatch(prompt, /AUTHOR'S NOTE/);
});

test("buildSystemPromptManlandia includes the Author's Note when set", () => {
  const gs = getInitialStateManlandia();
  gs.worldState.author_note = "Bramble is actually 300 years old.";
  const prompt = buildSystemPromptManlandia(gs);
  assert.match(prompt, /AUTHOR'S NOTE/);
  assert.match(prompt, /Bramble is actually 300 years old\./);
});

test("buildSystemPromptManlandia omits the Author's Note block when empty", () => {
  const gs = getInitialStateManlandia();
  const prompt = buildSystemPromptManlandia(gs);
  assert.doesNotMatch(prompt, /AUTHOR'S NOTE/);
});

test("buildSystemPromptCustom includes the Author's Note when set", () => {
  const gs = getInitialStateCustom({ name: "Star Reach", theme: "Space pirates", playerCount: 2, adult: false });
  gs.worldState.author_note = "The captain has a secret twin.";
  const prompt = buildSystemPromptCustom(gs);
  assert.match(prompt, /AUTHOR'S NOTE/);
  assert.match(prompt, /The captain has a secret twin\./);
});

test("buildSystemPromptCustom omits the Author's Note block when empty", () => {
  const gs = getInitialStateCustom({ name: "Star Reach", theme: "Space pirates", playerCount: 2, adult: false });
  const prompt = buildSystemPromptCustom(gs);
  assert.doesNotMatch(prompt, /AUTHOR'S NOTE/);
});

test("buildSystemPrompt (Resonance) includes pinned notes when present", () => {
  const gs = getInitialState();
  gs.worldState.pinned_notes = [{ text: "Fen lied about the ledger", timestamp: 1 }];
  const prompt = buildSystemPrompt(gs);
  assert.match(prompt, /REMEMBERED MOMENTS/);
  assert.match(prompt, /Fen lied about the ledger/);
});

test("buildSystemPrompt (Resonance) omits the pinned-notes block when empty", () => {
  const gs = getInitialState();
  const prompt = buildSystemPrompt(gs);
  assert.doesNotMatch(prompt, /REMEMBERED MOMENTS/);
});

test("buildSystemPromptManlandia includes pinned notes when present", () => {
  const gs = getInitialStateManlandia();
  gs.worldState.pinned_notes = [{ text: "The stone was hidden under the oak", timestamp: 1 }];
  const prompt = buildSystemPromptManlandia(gs);
  assert.match(prompt, /REMEMBERED MOMENTS/);
  assert.match(prompt, /The stone was hidden under the oak/);
});

test("buildSystemPromptCustom includes pinned notes when present", () => {
  const gs = getInitialStateCustom({ name: "Star Reach", theme: "Space pirates", playerCount: 2, adult: false });
  gs.worldState.pinned_notes = [{ text: "The captain trusts no one from the Reach", timestamp: 1 }];
  const prompt = buildSystemPromptCustom(gs);
  assert.match(prompt, /REMEMBERED MOMENTS/);
  assert.match(prompt, /The captain trusts no one from the Reach/);
});

// buildCombatStatusBlock (lib/prompt-shared.js) — added 2026-07-06 after a
// live playtest found enemy harm/defeat drifting out of sync with narration,
// or combat never engaging at all. Echoing the tracker's own current state
// back every turn (the same way character harm already is) gives the model
// something to check its narration against instead of tracking blind.
test("buildSystemPrompt (Resonance) shows 'no active fight' when combat isn't active", () => {
  const gs = getInitialState();
  const prompt = buildSystemPrompt(gs);
  assert.match(prompt, /No active fight right now/);
});

test("buildSystemPrompt (Resonance) shows the live enemy roster when combat is active", () => {
  const gs = getInitialState();
  gs.worldState.combat = { active: true, round: 2, enemies: [{ name: "Warden", harm: "Hurt", defeated: false }, { name: "Guard", harm: "Unhurt", defeated: true }] };
  const prompt = buildSystemPrompt(gs);
  assert.match(prompt, /Combat: ACTIVE \(round 2\)/);
  assert.match(prompt, /Warden: Hurt/);
  assert.match(prompt, /Guard: Defeated/);
});

test("buildSystemPromptManlandia shows 'no active fight' when combat isn't active", () => {
  const gs = getInitialStateManlandia();
  const prompt = buildSystemPromptManlandia(gs);
  assert.match(prompt, /No active fight right now/);
});

test("buildSystemPromptManlandia shows the live enemy roster when combat is active", () => {
  const gs = getInitialStateManlandia();
  gs.worldState.combat = { active: true, round: 1, enemies: [{ name: "Wolf", harm: "Scratched", defeated: false }] };
  const prompt = buildSystemPromptManlandia(gs);
  assert.match(prompt, /Combat: ACTIVE \(round 1\)/);
  assert.match(prompt, /Wolf: Scratched/);
});

test("buildSystemPromptCustom shows 'no active fight' when combat isn't active", () => {
  const gs = getInitialStateCustom({ name: "Star Reach", theme: "Space pirates", playerCount: 2, adult: false });
  const prompt = buildSystemPromptCustom(gs);
  assert.match(prompt, /No active fight right now/);
});

test("buildSystemPromptCustom shows the live enemy roster when combat is active", () => {
  const gs = getInitialStateCustom({ name: "Star Reach", theme: "Space pirates", playerCount: 2, adult: false });
  gs.worldState.combat = { active: true, round: 3, enemies: [{ name: "Raider", harm: "Wounded", defeated: false }] };
  const prompt = buildSystemPromptCustom(gs);
  assert.match(prompt, /Combat: ACTIVE \(round 3\)/);
  assert.match(prompt, /Raider: Wounded/);
});
