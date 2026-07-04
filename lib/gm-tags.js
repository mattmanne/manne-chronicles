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

// The prompts say "no brackets" but the model reliably ignores that (see
// CLAUDE.md) — tolerate an optional bracket, whitespace after the colon
// (observed live as "ROLL: [AGILITY]"), a trailing space, and any case.
// Matches any single word here (not just the five canonical stats) so
// STAT_SYNONYMS above can catch genre-standard synonyms the model reaches
// for instead — an unrecognized word still safely falls through to null.
const ROLL_RE = /^ROLL:\s*\[?([A-Za-z]+)\]?\s*(:\s*ADVANTAGE)?\s*$/im;

function extractRoll(rawText) {
  const match = rawText.match(ROLL_RE);
  const rollStat = match ? (STAT_SYNONYMS[match[1].toLowerCase()] || null) : null;
  const clean = rawText
    .replace(ROLL_RE, "")
    // Defensive: strip every remaining "ROLL:..." line (there can be more than
    // one — the model has been seen prefixing its own explanation sentence
    // with "ROLL:" too) so nothing we can't act on leaks into the narration.
    .replace(/^ROLL:.*$/gim, "")
    .trim();
  return {
    clean,
    needsRoll: !!rollStat,
    rollStat,
    rollAdvantage: match ? !!match[2] : false,
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
};
