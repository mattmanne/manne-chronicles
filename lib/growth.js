// Character growth for Manlandia/custom heroes — Resonance's Lyra and Fen
// already have 3 fixed, bespoke abilities apiece from session 1 with no
// concept of an "unlockable pool," so this deliberately doesn't apply there.
//
// Stats are set once at creation and never grow (see api/characters.js) —
// intentionally left alone here too, since this system has no monster/
// difficulty scaling for a stat bump to stay balanced against. Growth
// instead comes from cosmetic milestone badges (frequent, no mechanical
// weight) and unlocking additional special abilities at bigger checkpoints
// (a real capability, but bounded by the fixed ability pool below).

// Must stay in sync with api/characters.js's VALID_ABILITIES — duplicated
// rather than shared for now (see CLAUDE.md's roadmap notes on the
// existing archetype/ability list duplication; not fixing that here).
const ABILITY_POOL = ["animal_friend", "lucky_break", "protect_friend", "ancient_magic"];

const FLAVOR_BADGES = ["Rising Hero", "Trusted Ally", "Battle-Tested", "Local Legend", "Veteran Adventurer", "Legendary Companion"];

const GROWTH_CONFIG_KID   = { baselineXp: 10, badgeXp: 15, abilityXp: 50 };
const GROWTH_CONFIG_ADULT = { baselineXp: 10, badgeXp: 25, abilityXp: 80 };

// Applies an XP gain (baseline per-session, or a GM-awarded bonus) to a
// character and returns the updated growth fields to merge in. Pure — does
// not mutate `character`. Milestone/ability thresholds are cumulative
// multiples (badge N fires at N * badgeXp total XP, so badges keep coming
// at a steady pace rather than requiring ever-more XP each time).
function applyXpGain(character, amount, { badgeXp, abilityXp, abilityPool = ABILITY_POOL }) {
  const xp = (character.xp || 0) + Math.max(0, amount || 0);
  const milestones = [...(character.milestones || [])];
  while ((milestones.length + 1) * badgeXp <= xp) {
    milestones.push(FLAVOR_BADGES[milestones.length % FLAVOR_BADGES.length]);
  }

  let pendingChoice = character.pending_choice || null;
  const bonusAbilities = character.bonus_abilities || [];
  const owned = new Set([character.ability_id, ...bonusAbilities].filter(Boolean));
  const remainingPool = abilityPool.filter((a) => !owned.has(a));
  const unlocksSoFar = bonusAbilities.length;
  if (!pendingChoice && remainingPool.length && xp >= (unlocksSoFar + 1) * abilityXp) {
    pendingChoice = { options: remainingPool.slice(0, 3) };
  }

  return { xp, milestones, pending_choice: pendingChoice };
}

// Resolves a pending ability-choice moment. Returns null if there's no
// pending choice or the chosen id isn't one of the offered options — the
// caller treats that as a no-op rather than a hard error, same tolerance
// pattern as every other player-facing action in this app.
function chooseAbility(character, abilityId) {
  if (!character.pending_choice || !character.pending_choice.options.includes(abilityId)) return null;
  return {
    bonus_abilities: [...(character.bonus_abilities || []), abilityId],
    pending_choice: null,
  };
}

module.exports = { ABILITY_POOL, FLAVOR_BADGES, GROWTH_CONFIG_KID, GROWTH_CONFIG_ADULT, applyXpGain, chooseAbility };
