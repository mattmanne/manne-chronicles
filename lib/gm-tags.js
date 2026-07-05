const { HARM_LEVELS } = require("./gamestate");

// The prompts always show the Unicode arrow, but the model sometimes types an
// ASCII "->" instead — accept either, with flexible spacing around it.
const ARROW = "(?:→|->)\\s*";

// Looks up the canonical HARM_LEVELS spelling for a captured harm word,
// case-insensitively — protects recover_harm's HARM_LEVELS.indexOf() lookup
// from silently breaking on a harm value the model capitalized differently,
// and rejects anything that isn't a real harm level at all.
function normalizeHarm(raw) {
  if (!raw) return null;
  const found = HARM_LEVELS.find((h) => h.toLowerCase() === raw.trim().toLowerCase());
  return found || null;
}

function buildNameToKeyMap(characters) {
  const map = {};
  for (const [key, char] of Object.entries(characters || {})) {
    if (char?.name) map[char.name.trim().toLowerCase()] = key;
  }
  return map;
}

// The prompts are explicit that only these five words are valid stats, but
// the model still reaches for genre-standard D&D/DW terms sometimes (seen
// live, twice: "ROLL:[PERCEPTION]" in a custom campaign, despite the prompt
// naming PERCEPTION by name as a forbidden example) — rather than let the
// roll silently drop, map common synonyms onto the real stat that would
// have been picked for the same kind of action per each prompt's own
// "READING INTENT" guidance.
const STAT_SYNONYMS = {
  force: "force", strength: "force", might: "force", power: "force", brawn: "force",
  agility: "agility", dexterity: "agility", speed: "agility", reflex: "agility", reflexes: "agility", nimbleness: "agility", stealth: "agility",
  acuity: "acuity", perception: "acuity", wisdom: "acuity", intelligence: "acuity", insight: "acuity", intellect: "acuity", awareness: "acuity",
  will: "will", constitution: "will", endurance: "will", resolve: "will", courage: "will", discipline: "will", fortitude: "will",
  presence: "presence", charisma: "presence", persuasion: "presence", charm: "presence",
};

// The prompts say "no brackets" and "on its own line", but the model
// reliably ignores both (see CLAUDE.md) — tolerate an optional bracket,
// whitespace after the colon (observed live as "ROLL: [AGILITY]"), and any
// case. Matches any single word here (not just the five canonical stats) so
// STAT_SYNONYMS above can catch genre-standard synonyms the model reaches
// for instead — an unrecognized word still safely falls through and keeps
// scanning for another occurrence (see extractRoll below), rather than
// stopping at the first "ROLL:" found.
const ROLL_TAG_RE = /ROLL:\s*\[?([A-Za-z]+)\]?\s*(:\s*ADVANTAGE)?/gi;

function extractRoll(rawText) {
  // Not anchored to "alone on its own line" — live example: the model wrote
  // an entire explanatory sentence ending in the trigger on the same line:
  // "Note: ... The roll is: ROLL: WISDOM". A line-anchored regex (the
  // original design) never matches that at all, so the roll silently never
  // fires and the raw tag leaks straight into the narration. Scans every
  // "ROLL:" occurrence in the text and uses the first one that resolves to
  // a real stat via STAT_SYNONYMS — this also correctly skips past the
  // model prefixing its own explanation with a bogus "ROLL: This looks
  // tricky!..." before the real trigger later in the same response.
  let found = null;
  let m;
  ROLL_TAG_RE.lastIndex = 0;
  while ((m = ROLL_TAG_RE.exec(rawText)) !== null) {
    const stat = STAT_SYNONYMS[m[1].toLowerCase()];
    if (stat) { found = { stat, advantage: !!m[2] }; break; }
  }

  const clean = rawText
    // Strip every LINE that mentions "ROLL:" anywhere in it, not just lines
    // that start with it — covers both the model's own bogus explanation
    // line and the live "Note: ... ROLL: WISDOM" mid-sentence case above, so
    // nothing we can't act on leaks into the narration either way.
    .replace(/^.*ROLL:.*$/gim, "")
    .trim();

  return {
    clean,
    needsRoll: !!found,
    rollStat: found ? found.stat : null,
    rollAdvantage: found ? found.advantage : false,
  };
}

// Generic "[TAG: X -> Y]" counter tag (VILLAIN AWARENESS, CURSE, CONCLAVE
// AWARENESS, DISSONANCE) — returns the new value, or null if not present.
function extractCounterUpdate(text, tagName) {
  const re = new RegExp(`\\[${tagName}:\\s*(\\d+)\\s*${ARROW}(\\d+)\\s*\\]`, "i");
  const match = text.match(re);
  return match ? parseInt(match[2], 10) : null;
}

// [CHARACTER N: OldHarm -> NewHarm] is the documented format, but the model
// frequently names the hero instead of using their number (seen live:
// "[Globak: Unhurt → Scratched]" for a hero who should have been "CHARACTER 2")
// — narrating a named character reads more naturally to it than an anonymous
// slot number. Accept both, keyed off the character names already in state.
function extractCharacterHarmUpdates(text, characters) {
  const updates = [];
  const nameToKey = buildNameToKeyMap(characters);

  // The trailing `[^\]]*` before the closing bracket tolerates the model
  // appending extra commentary after the new harm word — live example:
  // "[CHARACTER 1: Scratched → Scratched, no change]" — which the stricter
  // `\s*\]` used to reject outright, silently dropping the update even when
  // harm genuinely changed (this particular live instance happened to be a
  // no-op, but the format defect would bite for real on an actual change).
  const numberedRe = new RegExp(`\\[CHARACTER (\\d):\\s*([A-Za-z]+)\\s*${ARROW}([A-Za-z]+)[^\\]]*\\]`, "gi");
  let m;
  while ((m = numberedRe.exec(text)) !== null) {
    const key = `player${m[1]}`;
    const harm = normalizeHarm(m[3]);
    if (characters?.[key] && harm) updates.push({ key, harm });
  }

  // The model sometimes drops the "Old → New" transition and just states the
  // current harm directly — live example: "[CHARACTER 1: Hurt]", with no
  // arrow at all. The arrow regex above can't match that (no closing bracket
  // right after the single word), so it silently dropped the update entirely
  // until this was added.
  const numberedSingleRe = /\[CHARACTER (\d):\s*([A-Za-z]+)\s*\]/gi;
  while ((m = numberedSingleRe.exec(text)) !== null) {
    const key = `player${m[1]}`;
    const harm = normalizeHarm(m[2]);
    if (characters?.[key] && harm) updates.push({ key, harm });
  }

  const namedRe = new RegExp(`\\[([A-Za-z]+):\\s*([A-Za-z]+)\\s*${ARROW}([A-Za-z]+)[^\\]]*\\]`, "g");
  while ((m = namedRe.exec(text)) !== null) {
    const key = nameToKey[m[1].trim().toLowerCase()];
    const harm = normalizeHarm(m[3]);
    if (key && harm) updates.push({ key, harm });
  }

  return updates;
}

// [LYRA|FEN: OldHarm -> NewHarm] — Resonance's two characters are always
// addressed by name already, so no number-vs-name ambiguity here; just needs
// the same arrow/case tolerance and harm normalization as the Manlandia side,
// plus the same trailing-commentary tolerance as extractCharacterHarmUpdates
// (no live evidence here yet specifically, but it's the identical tag shape).
function extractResonanceHarmUpdates(text) {
  const re = new RegExp(`\\[(LYRA|FEN):\\s*([A-Za-z]+)\\s*${ARROW}([A-Za-z]+)[^\\]]*\\]`, "gi");
  const updates = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const harm = normalizeHarm(m[3]);
    if (harm) updates.push({ key: m[1].toLowerCase(), harm });
  }
  return updates;
}

// [ABILITY N: used] is the documented format, but the model has been seen
// padding it with the ability's name and even negating it (live:
// "[ABILITY 1: Lucky Break - not used]", correctly meaning NOT used) — accept
// any extra text as long as the standalone word "used" appears and "not used"
// doesn't, so a real "[ABILITY N: Lucky Break used]" isn't missed while a
// negated one still correctly triggers nothing.
function extractAbilityUsedKeys(text, characters) {
  const keys = new Set();
  const re = /\[ABILITY (\d): (?!.*\bnot\s+used\b)[^\]]*\bused\b[^\]]*\]/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = `player${m[1]}`;
    if (characters?.[key]) keys.add(key);
  }
  return [...keys];
}

function normalizeObjectiveText(s) {
  return (s || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

// Never expect the model to phrase an [OBJECTIVE COMPLETE: ...] tag with the
// exact same words it used in the original [OBJECTIVE: ...] tag — match on
// significant word overlap instead of exact text, since a stricter match
// risks a paraphrase (e.g. "find the sword" vs "find the enchanted sword")
// making an objective silently impossible to ever mark complete. Deliberately
// permissive; expected to need tuning once real transcripts show how the
// model actually phrases these, same as every other tag here.
function objectivesMatch(a, b) {
  const wordsA = new Set(normalizeObjectiveText(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalizeObjectiveText(b).split(" ").filter(Boolean));
  if (!wordsA.size || !wordsB.size) return false;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.min(wordsA.size, wordsB.size) >= 0.6;
}

// [OBJECTIVE: description] adds a new quest/goal; [OBJECTIVE COMPLETE:
// description] marks the closest fuzzy-matching open one done. Generalizes
// Manlandia's stone tracker (a fixed-ID checklist) to arbitrary free-text
// objectives for every world type, since only Manlandia had any structured
// quest tracking before this.
function extractObjectiveUpdates(text, existingObjectives) {
  const objectives = existingObjectives || [];
  const additions = [];

  const addRe = /\[OBJECTIVE:\s*([^\]]+)\]/gi;
  let m;
  while ((m = addRe.exec(text)) !== null) {
    const desc = m[1].trim();
    if (!desc) continue;
    const alreadyKnown = objectives.some((o) => objectivesMatch(o.text, desc))
      || additions.some((d) => objectivesMatch(d, desc));
    if (!alreadyKnown) additions.push(desc);
  }

  const completedTexts = [];
  const completeRe = /\[OBJECTIVE COMPLETE:\s*([^\]]+)\]/gi;
  while ((m = completeRe.exec(text)) !== null) {
    const desc = m[1].trim();
    if (!desc) continue;
    const match = objectives.find((o) => !o.done && objectivesMatch(o.text, desc));
    if (match && !completedTexts.includes(match.text)) completedTexts.push(match.text);
  }

  return { additions, completedTexts };
}

// [NPC: Name: Description] — a named NPC worth remembering. Shared across
// all world types, same as OBJECTIVE — the whole party learns about a person
// together. Dedup is by name only (case-insensitive), not fuzzy word-overlap
// like objectivesMatch — NPC names are proper nouns, so an exact-ish match is
// the right bar, and re-describing the same name just gets skipped rather
// than updated (no live evidence yet of the model wanting to amend an NPC's
// description later — first-pass scope, same as every other tag here).
function extractLorebookUpdates(text, existingNpcs) {
  const npcs = existingNpcs || [];
  const additions = [];
  const re = /\[NPC:\s*([^:\]]+):\s*([^\]]+)\]/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    const description = m[2].trim();
    if (!name || !description) continue;
    const key = name.toLowerCase();
    const alreadyKnown = npcs.some((n) => n.name.toLowerCase() === key)
      || additions.some((a) => a.name.toLowerCase() === key);
    if (!alreadyKnown) additions.push({ name, description });
  }
  return additions;
}

// [ITEM FOUND: description] — shared party loot. Used by kid-friendly worlds
// (Manlandia, non-adult custom campaigns) where the whole party carries
// things together rather than tracking who's holding what — see
// extractCharacterItemAdditions/extractResonanceItemAdditions below for the
// per-character variant used by adult games.
function extractSharedItemAdditions(text, existingInventory) {
  const inventory = existingInventory || [];
  const additions = [];
  const re = /\[ITEM FOUND:\s*([^\]]+)\]/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const item = m[1].trim();
    if (!item) continue;
    const key = item.toLowerCase();
    const alreadyKnown = inventory.some((i) => i.toLowerCase() === key)
      || additions.some((a) => a.toLowerCase() === key);
    if (!alreadyKnown) additions.push(item);
  }
  return additions;
}

// [ITEM N: description] — per-character carried item, used by adult custom
// campaigns (Resonance has its own [ITEM FEN|LYRA: ...] variant below, since
// its two characters are always addressed by name). Tolerates the model
// naming the hero instead of their slot number, same ambiguity and fix as
// extractCharacterHarmUpdates. Dedup is per-character, exact text match.
function extractCharacterItemAdditions(text, characters) {
  const updates = [];
  const nameToKey = buildNameToKeyMap(characters);
  const seen = new Set();

  function tryAdd(key, item) {
    if (!key || !characters?.[key] || !item) return;
    const existing = characters[key].inventory || [];
    const dupKey = `${key}::${item.toLowerCase()}`;
    if (existing.some((i) => i.toLowerCase() === item.toLowerCase()) || seen.has(dupKey)) return;
    seen.add(dupKey);
    updates.push({ key, item });
  }

  const numberedRe = /\[ITEM (\d):\s*([^\]]+)\]/gi;
  let m;
  while ((m = numberedRe.exec(text)) !== null) tryAdd(`player${m[1]}`, m[2].trim());

  const namedRe = /\[ITEM ([A-Za-z]+):\s*([^\]]+)\]/gi;
  while ((m = namedRe.exec(text)) !== null) tryAdd(nameToKey[m[1].trim().toLowerCase()], m[2].trim());

  return updates;
}

// [ITEM FEN|LYRA: description] — Resonance's two characters are always
// addressed by name, so no number-vs-name ambiguity, same as
// extractResonanceHarmUpdates.
function extractResonanceItemAdditions(text, characters) {
  const re = /\[ITEM (FEN|LYRA):\s*([^\]]+)\]/gi;
  const updates = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    const item = m[2].trim();
    if (!item) continue;
    const existing = characters?.[key]?.inventory || [];
    const dupKey = `${key}::${item.toLowerCase()}`;
    if (existing.some((i) => i.toLowerCase() === item.toLowerCase()) || seen.has(dupKey)) continue;
    seen.add(dupKey);
    updates.push({ key, item });
  }
  return updates;
}

// This app's combat has always been Dungeon-World-style — one roll resolves
// a whole exchange, success bands already encode retaliation — and that
// doesn't change here. What these four tags add is just persistent enemy
// harm state that survives across several exchanges within one fight,
// instead of every fight (including bosses) resolving in a single roll.
// No initiative, no positioning, no per-round rolls — see CLAUDE.md.

// Recognizes the model folding "defeated" into the harm arrow instead of
// using the dedicated [ENEMY DEFEATED: ...] tag — e.g. "[ENEMY: Goblin:
// Hurt → Defeated]". Checked before strict HARM_LEVELS normalization since,
// per the same "model reaches for the most natural phrase" pattern already
// seen with CHARACTER-name-instead-of-slot-number, this is the single most
// natural way for the model to end a fight in prose.
const ENEMY_DEFEAT_SYNONYMS = new Set([
  "defeated", "destroyed", "down", "unconscious", "dead", "vanquished",
  "fled", "retreated", "dispelled", "gone", "banished",
]);

// [COMBAT START: Enemy A, Enemy B] — not line-anchored (same lesson as
// extractRoll's mid-sentence fix), tolerates "and" in place of a comma, and
// strips leading list-numbering/bullet characters per name in case the
// model renders the enemy list as a numbered or bulleted list inside the
// brackets instead of a plain comma-separated one.
function extractCombatStart(text) {
  const m = text.match(/\[COMBAT START:\s*([^\]]+)\]/i);
  if (!m) return null;
  return m[1]
    .split(/,|\band\b|(?=\d+[.)]\s)/i)
    .map((s) => s.replace(/^\s*[\d.\-•)]+\s*/, "").trim())
    .filter(Boolean);
}

// Enemy names drift the same way hero names do (the model introduces
// "Grunk the Goblin Scout" in COMBAT START, then just says "the goblin"
// later) — case-insensitive containment in either direction against the
// currently-tracked, not-yet-defeated enemies. Ambiguous if two active
// enemies share a substring (e.g. "Goblin" matching both "Goblin Scout" and
// "Goblin Chief") — first match wins; a known, deliberately accepted v1
// limitation, same as every other tag here that started this way.
function findActiveEnemyByName(enemies, name) {
  const target = (name || "").trim().toLowerCase();
  if (!target) return null;
  return (enemies || []).find((e) => {
    if (e.defeated) return false;
    const known = e.name.toLowerCase();
    return known === target || known.includes(target) || target.includes(known);
  });
}

// [ENEMY: Name: OldHarm → NewHarm] (or the arrow-less "[ENEMY: Name: Harm]"
// fallback, same drift already fixed for CHARACTER harm) updates that
// enemy's harm — unless the new value is a defeat synonym (see above), in
// which case it's treated as a defeat instead of an unrecognized harm word
// silently getting dropped.
function extractEnemyUpdates(text, existingEnemies) {
  const enemies = existingEnemies || [];
  const harmUpdates = [];
  const defeats = [];

  function handle(name, rawValue) {
    const enemy = findActiveEnemyByName(enemies, name);
    if (!enemy) return;
    const value = rawValue.trim().toLowerCase();
    if (ENEMY_DEFEAT_SYNONYMS.has(value)) {
      if (!defeats.includes(enemy.name)) defeats.push(enemy.name);
      return;
    }
    const harm = normalizeHarm(rawValue);
    if (harm) harmUpdates.push({ name: enemy.name, harm });
  }

  const arrowRe = new RegExp(`\\[ENEMY:\\s*([^:\\]]+):\\s*[A-Za-z]+\\s*${ARROW}([A-Za-z]+)[^\\]]*\\]`, "gi");
  let m;
  while ((m = arrowRe.exec(text)) !== null) handle(m[1], m[2]);

  const singleRe = /\[ENEMY:\s*([^:\]]+):\s*([A-Za-z]+)\s*\]/gi;
  while ((m = singleRe.exec(text)) !== null) handle(m[1], m[2]);

  return { harmUpdates, defeats };
}

// [ENEMY DEFEATED: Name] — the documented, explicit way to end an enemy's
// part in the fight (see extractEnemyUpdates above for the arrow-folded
// variant the model reaches for just as often).
function extractEnemyDefeated(text, existingEnemies) {
  const enemies = existingEnemies || [];
  const defeats = [];
  const re = /\[ENEMY DEFEATED:\s*([^\]]+)\]/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const enemy = findActiveEnemyByName(enemies, m[1]);
    if (enemy && !defeats.includes(enemy.name)) defeats.push(enemy.name);
  }
  return defeats;
}

// [COMBAT END] — explicit end-of-fight signal. Not the only way combat
// ends: applyStateTags also auto-derives the end once every tracked enemy
// is defeated, and the client has a manual "End Combat" button as a safety
// net for the case (retreat, negotiation) neither of those covers — this
// tag alone isn't expected to be 100% reliable, same as every other
// GM-emitted signal in this app.
function extractCombatEnd(text) {
  return /\[COMBAT END\]/i.test(text);
}

// [XP N: +amount] — bonus XP for a notable moment (Manlandia/custom only;
// see lib/growth.js for why Resonance is excluded from the growth system
// entirely). A baseline amount is also awarded automatically every session
// regardless of this tag — this is only the GM-awarded top-up, so it's
// expected to be less consistent than the baseline, same as any other
// GM-emitted tag depending on the model remembering to write it.
function extractXpBonuses(text) {
  const re = /\[XP (\d):\s*\+(\d+)\]/gi;
  const updates = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const amount = parseInt(m[2], 10);
    if (amount > 0) updates.push({ key: `player${m[1]}`, amount });
  }
  return updates;
}

module.exports = {
  normalizeHarm,
  buildNameToKeyMap,
  extractRoll,
  extractCounterUpdate,
  extractCharacterHarmUpdates,
  extractResonanceHarmUpdates,
  extractAbilityUsedKeys,
  objectivesMatch,
  extractObjectiveUpdates,
  extractXpBonuses,
  extractLorebookUpdates,
  extractSharedItemAdditions,
  extractCharacterItemAdditions,
  extractResonanceItemAdditions,
  extractCombatStart,
  extractEnemyUpdates,
  extractEnemyDefeated,
  extractCombatEnd,
};
