// Single source of truth for which archetype/ability ids exist — previously
// hand-duplicated as bare id lists in api/characters.js, lib/growth.js, and
// both prompt files' label maps. Per-world flavor text (the label maps in
// lib/prompt-manlandia.js/lib/prompt-custom.js) stays separate on purpose —
// those are deliberately worded differently per audience, so merging them
// would cost more than it saves. This only centralizes the *set of valid
// ids*, so a 6th archetype or 5th ability only needs adding here plus each
// prompt file's own label text, instead of also touching the validation
// lists in api/characters.js and lib/growth.js.
const ARCHETYPE_STATS = {
  fighter: { force: 3, acuity: 1, agility: 2, will: 1, presence: 0 },
  mage:    { force: 0, acuity: 3, agility: 1, will: 2, presence: 1 },
  scout:   { force: 1, acuity: 2, agility: 3, will: 1, presence: 0 },
  leader:  { force: 2, acuity: 1, agility: 0, will: 3, presence: 1 },
  charmer: { force: 0, acuity: 2, agility: 1, will: 1, presence: 3 },
};

const ARCHETYPE_IDS = Object.keys(ARCHETYPE_STATS);
const ABILITY_IDS   = ["animal_friend", "lucky_break", "protect_friend", "ancient_magic"];

module.exports = { ARCHETYPE_STATS, ARCHETYPE_IDS, ABILITY_IDS };
