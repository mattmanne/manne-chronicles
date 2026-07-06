const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeHarm, buildNameToKeyMap, extractRoll, extractCounterUpdate,
  extractCharacterHarmUpdates, extractResonanceHarmUpdates, extractAbilityUsedKeys,
  objectivesMatch, extractObjectiveUpdates, extractClueUpdates,
  extractLorebookUpdates, extractSharedItemAdditions,
  extractCharacterItemAdditions, extractResonanceItemAdditions,
  extractCombatStart, extractEnemyUpdates, extractEnemyDefeated, extractCombatEnd,
} = require("../lib/gm-tags");

/* ── extractRoll — every variant below is a real string captured from live campaigns ── */

test("extractRoll recognizes the documented bracket-free format", () => {
  const r = extractRoll("You reach for the door.\nROLL:AGILITY");
  assert.deepEqual(r, { clean: "You reach for the door.", needsRoll: true, rollStat: "agility", rollAdvantage: false, rollPlayer: null });
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

test("extractRoll fires even when the trigger is embedded mid-sentence instead of alone on its own line — live example: 'Note: ... The roll is: ROLL: WISDOM' (Dark Wars, reported live after the synonym-mapping fix shipped)", () => {
  const raw = "You look through the documents. What do you do?\n\nNote: As you consider the offer, you roll a Wisdom check to see if you can sense any potential dangers or pitfalls. The roll is: ROLL: WISDOM";
  const r = extractRoll(raw);
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollStat, "acuity");
  assert.doesNotMatch(r.clean, /ROLL:/i);
  assert.doesNotMatch(r.clean, /the roll is/i);
});

test("extractRoll keeps scanning past an unrecognized word to find a real stat later in the same text", () => {
  const raw = "The roll is: ROLL: nervousness, actually: ROLL: [AGILITY]";
  const r = extractRoll(raw);
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollStat, "agility");
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

test("extractRoll strips a truly unrecognized stat from display without triggering a roll", () => {
  const r = extractRoll("The creature's eyes lock onto you.\nROLL:[LUCK]");
  assert.equal(r.needsRoll, false);
  assert.equal(r.clean, "The creature's eyes lock onto you.");
});

test("extractRoll maps common D&D-style synonyms onto the real five stats (live: PERCEPTION in a custom campaign, despite the prompt naming it as a forbidden example)", () => {
  const cases = [
    ["PERCEPTION", "acuity"], ["WISDOM", "acuity"], ["INTELLIGENCE", "acuity"],
    ["STRENGTH", "force"], ["MIGHT", "force"],
    ["DEXTERITY", "agility"], ["SPEED", "agility"], ["STEALTH", "agility"],
    ["CONSTITUTION", "will"], ["RESOLVE", "will"], ["COURAGE", "will"],
    ["CHARISMA", "presence"], ["PERSUASION", "presence"],
  ];
  for (const [synonym, canonical] of cases) {
    const r = extractRoll(`The scene tenses.\nROLL:[${synonym}]`);
    assert.equal(r.needsRoll, true, `${synonym} should trigger a roll`);
    assert.equal(r.rollStat, canonical, `${synonym} should map to ${canonical}`);
    assert.equal(r.clean, "The scene tenses.");
  }
});

test("extractRoll leaves narration with no ROLL: line completely untouched", () => {
  const r = extractRoll("Nothing risky happens here.");
  assert.equal(r.needsRoll, false);
  assert.equal(r.clean, "Nothing risky happens here.");
});

/* ── extractRoll roller attribution — needed once a merged multi-character
   turn means there's no longer a single implicit submitter ── */

test("extractRoll resolves an explicit roller name (name then stat)", () => {
  const r = extractRoll("Fen slips past the guard.\nROLL:FEN:AGILITY", { fen: {}, lyra: {} });
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollStat, "agility");
  assert.equal(r.rollPlayer, "fen");
});

test("extractRoll resolves an explicit roller name regardless of token order (stat then name)", () => {
  const r = extractRoll("Lyra reads the room.\nROLL:ACUITY:LYRA", { fen: {}, lyra: {} });
  assert.equal(r.rollStat, "acuity");
  assert.equal(r.rollPlayer, "lyra");
});

test("extractRoll resolves a roller by their custom hero name, not just a fixed key", () => {
  const r = extractRoll("Globak leaps the chasm.\nROLL:GLOBAK:FORCE", { player1: { name: "Globak" }, player2: { name: "Mira" } });
  assert.equal(r.rollStat, "force");
  assert.equal(r.rollPlayer, "player1");
});

test("extractRoll returns a null rollPlayer when no name is present, unchanged single-actor behavior", () => {
  const r = extractRoll("You reach for the door.\nROLL:AGILITY", { fen: {}, lyra: {} });
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollPlayer, null);
});

test("extractRoll still resolves correctly with no characters map passed at all", () => {
  const r = extractRoll("You reach for the door.\nROLL:AGILITY");
  assert.equal(r.needsRoll, true);
  assert.equal(r.rollStat, "agility");
  assert.equal(r.rollPlayer, null);
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

test("extractCharacterHarmUpdates tolerates trailing commentary after the new harm word, live example: '[CHARACTER 1: Scratched → Scratched, no change]'", () => {
  const characters = { player1: { name: "Globak" } };
  const updates = extractCharacterHarmUpdates("[CHARACTER 1: Scratched → Scratched, no change]", characters);
  assert.deepEqual(updates, [{ key: "player1", harm: "Scratched" }]);
});

test("extractCharacterHarmUpdates's trailing-commentary tolerance also applies to the named-hero variant", () => {
  const characters = { player1: { name: "Globak" } };
  const updates = extractCharacterHarmUpdates("[Globak: Scratched → Hurt, wincing in pain]", characters);
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

test("extractResonanceHarmUpdates tolerates trailing commentary after the new harm word", () => {
  assert.deepEqual(extractResonanceHarmUpdates("[FEN: Unhurt → Scratched, a bit shaken]"), [{ key: "fen", harm: "Scratched" }]);
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

/* ── objectivesMatch / extractObjectiveUpdates ── */

test("objectivesMatch is true for identical text", () => {
  assert.equal(objectivesMatch("Find the sword", "Find the sword"), true);
});

test("objectivesMatch tolerates the model paraphrasing a goal slightly, not just retyping it verbatim", () => {
  assert.equal(objectivesMatch("Find the sword", "Find the enchanted sword"), true);
  assert.equal(objectivesMatch("Rescue Bramble", "Go rescue Bramble from the cave"), true);
});

test("objectivesMatch is false for genuinely unrelated goals", () => {
  assert.equal(objectivesMatch("Find the sword", "Talk to the merchant"), false);
});

test("objectivesMatch is false when either side is empty", () => {
  assert.equal(objectivesMatch("", "Find the sword"), false);
  assert.equal(objectivesMatch("Find the sword", ""), false);
});

test("extractObjectiveUpdates adds a new objective not already known", () => {
  const { additions } = extractObjectiveUpdates("You should find the ancient sword. [OBJECTIVE: Find the ancient sword]", []);
  assert.deepEqual(additions, ["Find the ancient sword"]);
});

test("extractObjectiveUpdates does not re-add an objective that already exists (even reworded)", () => {
  const existing = [{ text: "Find the ancient sword", done: false }];
  const { additions } = extractObjectiveUpdates("[OBJECTIVE: Find the enchanted ancient sword]", existing);
  assert.deepEqual(additions, []);
});

test("extractObjectiveUpdates dedups two near-identical additions within the same response", () => {
  const { additions } = extractObjectiveUpdates("[OBJECTIVE: Find the sword] Later. [OBJECTIVE: Find the ancient sword]", []);
  assert.equal(additions.length, 1);
});

test("extractObjectiveUpdates marks a fuzzy-matching open objective complete", () => {
  const existing = [{ text: "Find the ancient sword", done: false }];
  const { completedTexts } = extractObjectiveUpdates("[OBJECTIVE COMPLETE: Find the sword]", existing);
  assert.deepEqual(completedTexts, ["Find the ancient sword"]);
});

test("extractObjectiveUpdates ignores a completion that doesn't match anything open", () => {
  const existing = [{ text: "Find the ancient sword", done: false }];
  const { completedTexts } = extractObjectiveUpdates("[OBJECTIVE COMPLETE: Rescue the princess]", existing);
  assert.deepEqual(completedTexts, []);
});

test("extractObjectiveUpdates does not re-complete an objective that's already done", () => {
  const existing = [{ text: "Find the ancient sword", done: true }];
  const { completedTexts } = extractObjectiveUpdates("[OBJECTIVE COMPLETE: Find the ancient sword]", existing);
  assert.deepEqual(completedTexts, []);
});

test("extractObjectiveUpdates handles both an addition and a completion in the same response", () => {
  const existing = [{ text: "Find the ancient sword", done: false }];
  const { additions, completedTexts } = extractObjectiveUpdates(
    "[OBJECTIVE COMPLETE: Find the ancient sword]\n[OBJECTIVE: Return the sword to the shrine]",
    existing
  );
  assert.deepEqual(additions, ["Return the sword to the shrine"]);
  assert.deepEqual(completedTexts, ["Find the ancient sword"]);
});

/* ── Clues / Leads (reuses objectivesMatch) ── */
test("extractClueUpdates adds a new clue not already known", () => {
  const { additions } = extractClueUpdates("Something's off. [CLUE: The ledger has been altered]", []);
  assert.deepEqual(additions, ["The ledger has been altered"]);
});

test("extractClueUpdates does not re-add a clue that already exists (even reworded)", () => {
  const existing = [{ text: "The ledger has been altered", done: false }];
  const { additions } = extractClueUpdates("[CLUE: The old ledger has clearly been altered]", existing);
  assert.deepEqual(additions, []);
});

test("extractClueUpdates dedups two near-identical additions within the same response", () => {
  const { additions } = extractClueUpdates("[CLUE: Ledger altered] Later. [CLUE: The ledger has been altered]", []);
  assert.equal(additions.length, 1);
});

test("extractClueUpdates marks a fuzzy-matching open clue resolved", () => {
  const existing = [{ text: "Who altered the ledger", done: false }];
  const { resolvedTexts } = extractClueUpdates("[CLUE RESOLVED: Who altered the ledger]", existing);
  assert.deepEqual(resolvedTexts, ["Who altered the ledger"]);
});

test("extractClueUpdates ignores a resolution that doesn't match anything open", () => {
  const existing = [{ text: "Who altered the ledger", done: false }];
  const { resolvedTexts } = extractClueUpdates("[CLUE RESOLVED: Where is the missing coin]", existing);
  assert.deepEqual(resolvedTexts, []);
});

test("extractClueUpdates does not re-resolve a clue that's already done", () => {
  const existing = [{ text: "Who altered the ledger", done: true }];
  const { resolvedTexts } = extractClueUpdates("[CLUE RESOLVED: Who altered the ledger]", existing);
  assert.deepEqual(resolvedTexts, []);
});

test("extractClueUpdates handles both an addition and a resolution in the same response, and doesn't collide with [CLUE RESOLVED: ...]", () => {
  const existing = [{ text: "Who altered the ledger", done: false }];
  const { additions, resolvedTexts } = extractClueUpdates(
    "[CLUE RESOLVED: Who altered the ledger]\n[CLUE: Where did the coin come from]",
    existing
  );
  assert.deepEqual(additions, ["Where did the coin come from"]);
  assert.deepEqual(resolvedTexts, ["Who altered the ledger"]);
});

/* ── NPC lorebook ── */

test("extractLorebookUpdates adds a new named NPC", () => {
  const additions = extractLorebookUpdates("You meet a stranger. [NPC: Old Marrow: A one-eyed lighthouse keeper who knows every ship in the harbor]", []);
  assert.deepEqual(additions, [{ name: "Old Marrow", description: "A one-eyed lighthouse keeper who knows every ship in the harbor" }]);
});

test("extractLorebookUpdates dedups by name, case-insensitively, against existing NPCs", () => {
  const existing = [{ name: "Old Marrow", description: "A lighthouse keeper" }];
  const additions = extractLorebookUpdates("[NPC: old marrow: He waves at you again]", existing);
  assert.deepEqual(additions, []);
});

test("extractLorebookUpdates dedups two additions of the same name within one response", () => {
  const additions = extractLorebookUpdates("[NPC: Bramble: A nervous scout]\n[NPC: Bramble: A nervous scout again]", []);
  assert.equal(additions.length, 1);
});

/* ── Inventory: shared party loot ── */

test("extractSharedItemAdditions adds a new item", () => {
  const additions = extractSharedItemAdditions("You find a key. [ITEM FOUND: A rusty iron key]", []);
  assert.deepEqual(additions, ["A rusty iron key"]);
});

test("extractSharedItemAdditions dedups against the existing inventory, case-insensitively", () => {
  const additions = extractSharedItemAdditions("[ITEM FOUND: a rusty iron key]", ["A rusty iron key"]);
  assert.deepEqual(additions, []);
});

/* ── Inventory: per-character (adult games) ── */

test("extractCharacterItemAdditions adds an item to the numbered hero's inventory", () => {
  const characters = { player1: { inventory: [] } };
  const updates = extractCharacterItemAdditions("[ITEM 1: A silver locket]", characters);
  assert.deepEqual(updates, [{ key: "player1", item: "A silver locket" }]);
});

test("extractCharacterItemAdditions accepts the hero's name instead of their number, same tolerance as extractCharacterHarmUpdates", () => {
  const characters = { player2: { name: "Globak", inventory: [] } };
  const updates = extractCharacterItemAdditions("[ITEM Globak: A cracked shield]", characters);
  assert.deepEqual(updates, [{ key: "player2", item: "A cracked shield" }]);
});

test("extractCharacterItemAdditions dedups against that character's existing inventory", () => {
  const characters = { player1: { inventory: ["A silver locket"] } };
  const updates = extractCharacterItemAdditions("[ITEM 1: a silver locket]", characters);
  assert.deepEqual(updates, []);
});

test("extractCharacterItemAdditions ignores an unknown player slot", () => {
  const characters = { player1: { inventory: [] } };
  const updates = extractCharacterItemAdditions("[ITEM 3: A map fragment]", characters);
  assert.deepEqual(updates, []);
});

test("extractResonanceItemAdditions adds an item to Fen or Lyra's inventory", () => {
  const characters = { fen: { inventory: [] }, lyra: { inventory: [] } };
  const updates = extractResonanceItemAdditions("[ITEM FEN: A pocketknife]\n[ITEM LYRA: A worn journal]", characters);
  assert.deepEqual(updates, [{ key: "fen", item: "A pocketknife" }, { key: "lyra", item: "A worn journal" }]);
});

test("extractResonanceItemAdditions dedups against the existing inventory", () => {
  const characters = { fen: { inventory: ["A pocketknife"] } };
  const updates = extractResonanceItemAdditions("[ITEM FEN: a pocketknife]", characters);
  assert.deepEqual(updates, []);
});

/* ── Combat ── */

test("extractCombatStart parses a comma-separated enemy list", () => {
  assert.deepEqual(extractCombatStart("A fight breaks out! [COMBAT START: Goblin Scout, Wolf]"), ["Goblin Scout", "Wolf"]);
});

test("extractCombatStart tolerates 'and' in place of a comma", () => {
  assert.deepEqual(extractCombatStart("[COMBAT START: Goblin Scout and Wolf]"), ["Goblin Scout", "Wolf"]);
});

test("extractCombatStart strips leading list-numbering per name", () => {
  assert.deepEqual(extractCombatStart("[COMBAT START: 1. Goblin 2. Wolf]"), ["Goblin", "Wolf"]);
});

test("extractCombatStart fires mid-sentence, not just alone on its own line", () => {
  assert.deepEqual(extractCombatStart("Suddenly! [COMBAT START: Bandit] the fight begins."), ["Bandit"]);
});

test("extractCombatStart returns null when the tag isn't present", () => {
  assert.equal(extractCombatStart("Just narration, no fight yet."), null);
});

test("extractCombatStart returns a single name unmangled by 'and'-splitting", () => {
  assert.deepEqual(extractCombatStart("[COMBAT START: Lone Wolf]"), ["Lone Wolf"]);
});

test("extractEnemyUpdates applies a harm update via the arrow format", () => {
  const enemies = [{ name: "Goblin Scout", harm: "Unhurt", defeated: false }];
  const { harmUpdates, defeats } = extractEnemyUpdates("[ENEMY: Goblin Scout: Unhurt → Hurt]", enemies);
  assert.deepEqual(harmUpdates, [{ name: "Goblin Scout", harm: "Hurt" }]);
  assert.deepEqual(defeats, []);
});

test("extractEnemyUpdates applies the arrow-less fallback", () => {
  const enemies = [{ name: "Wolf", harm: "Unhurt", defeated: false }];
  const { harmUpdates } = extractEnemyUpdates("[ENEMY: Wolf: Hurt]", enemies);
  assert.deepEqual(harmUpdates, [{ name: "Wolf", harm: "Hurt" }]);
});

test("extractEnemyUpdates matches a shortened/fuzzy enemy name against the tracked list", () => {
  const enemies = [{ name: "Grunk the Goblin Scout", harm: "Unhurt", defeated: false }];
  const { harmUpdates } = extractEnemyUpdates("[ENEMY: the goblin: Unhurt → Hurt]", enemies);
  assert.deepEqual(harmUpdates, [{ name: "Grunk the Goblin Scout", harm: "Hurt" }]);
});

test("extractEnemyUpdates treats a defeat synonym folded into the harm arrow as a defeat, not a dropped harm word", () => {
  const enemies = [{ name: "Goblin Scout", harm: "Hurt", defeated: false }];
  const { harmUpdates, defeats } = extractEnemyUpdates("[ENEMY: Goblin Scout: Hurt → Defeated]", enemies);
  assert.deepEqual(harmUpdates, []);
  assert.deepEqual(defeats, ["Goblin Scout"]);
});

test("extractEnemyUpdates ignores an unrecognized enemy name", () => {
  const enemies = [{ name: "Goblin Scout", harm: "Unhurt", defeated: false }];
  const { harmUpdates, defeats } = extractEnemyUpdates("[ENEMY: Dragon: Unhurt → Hurt]", enemies);
  assert.deepEqual(harmUpdates, []);
  assert.deepEqual(defeats, []);
});

test("extractEnemyUpdates ignores an already-defeated enemy", () => {
  const enemies = [{ name: "Goblin Scout", harm: "Hurt", defeated: true }];
  const { harmUpdates, defeats } = extractEnemyUpdates("[ENEMY: Goblin Scout: Hurt → Wounded]", enemies);
  assert.deepEqual(harmUpdates, []);
  assert.deepEqual(defeats, []);
});

test("extractEnemyDefeated marks a tracked enemy defeated via the dedicated tag", () => {
  const enemies = [{ name: "Wolf", harm: "Hurt", defeated: false }];
  assert.deepEqual(extractEnemyDefeated("[ENEMY DEFEATED: Wolf]", enemies), ["Wolf"]);
});

test("extractEnemyDefeated dedups two defeat mentions of the same enemy in one response", () => {
  const enemies = [{ name: "Wolf", harm: "Hurt", defeated: false }];
  assert.deepEqual(extractEnemyDefeated("[ENEMY DEFEATED: Wolf] [ENEMY DEFEATED: the wolf]", enemies), ["Wolf"]);
});

test("extractCombatEnd recognizes the tag anywhere in the text", () => {
  assert.equal(extractCombatEnd("The dust settles. [COMBAT END]"), true);
  assert.equal(extractCombatEnd("The fight rages on."), false);
});
