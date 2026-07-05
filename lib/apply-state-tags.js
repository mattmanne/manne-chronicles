const { STONE_IDS } = require("./gamestate-manlandia");
const { isAdultWorld } = require("./adultgate");
const { GROWTH_CONFIG_KID, GROWTH_CONFIG_ADULT, applyXpGain } = require("./growth");
const {
  extractCounterUpdate,
  extractCharacterHarmUpdates,
  extractResonanceHarmUpdates,
  extractAbilityUsedKeys,
  extractObjectiveUpdates,
  extractXpBonuses,
  extractLorebookUpdates,
  extractSharedItemAdditions,
  extractCharacterItemAdditions,
  extractResonanceItemAdditions,
} = require("./gm-tags");

function matchResonanceLocationId(name) {
  const s = name.toLowerCase();
  if (s.includes("salt") || s.includes("wick") || s.includes("pub")) return "salt-wick";
  if (s.includes("archive")) return "archive";
  if (s.includes("scholar")) return "scholars-row";
  if (s.includes("market")) return "market-square";
  if (s.includes("concordance") || (s.includes("conclave") && !s.includes("warden"))) return "conclave-hall";
  if (s.includes("warden")) return "warden-post";
  if (s.includes("dock")) return "docks";
  if (s.includes("low quarter") || s.includes("low-quarter")) return "low-quarter";
  return null;
}

function matchManlandiaLocationId(name) {
  const s = name.toLowerCase();
  if (s.includes("hidden") || s.includes("village")) return "hidden-village";
  if (s.includes("mountain") || s.includes("peak")) return "mountain-peaks";
  if (s.includes("frost") || s.includes("frost land")) return "frost-lands";
  if (s.includes("swamp")) return "the-swamp";
  if (s.includes("dragon") || s.includes("cave")) return "dragons-cave";
  if (s.includes("pirate") || s.includes("coast")) return "pirate-coast";
  if (s.includes("underground") || s.includes("lair")) return "underground-lair";
  if (s.includes("sky")) return "sky-realm";
  return null;
}

// Manlandia/Resonance match against a fixed list of known place names for a
// curated, pre-drawn map. Custom worlds have no such list — the GM invents
// arbitrary locations per campaign — so the location's own text IS its id.
// This means `visited_locations`/`location_scars` (previously always empty
// for custom worlds, since the old () => null here meant nothing ever
// passed the shared LOCATION/SCAR handling's `if (locId)` check) start
// getting populated for the journey-trail map in public/game.js. Dedup is
// exact-string, so a revisit narrated with different casing/wording won't
// be caught as the same place — a known, deliberately accepted v1
// limitation, same as every other tag in this app that started this way.
function matchCustomLocationId(name) {
  return name.trim();
}

function matchStoneId(name) {
  const s = name.toLowerCase().trim();
  return STONE_IDS.includes(s) ? s : null;
}

// GM bracket-tag notation, applied to gameState — full reference table in
// CLAUDE.md. Deliberately NOT called while a roll is pending (see the
// `rolling` handling in api/gm.js's handler): a turn that asks for a roll
// describes events that haven't been confirmed yet, so applying its tags
// immediately would let world state (location, harm, curse level, etc.)
// silently advance even if the roll is never actually completed — this is
// exactly what happened to a real live Manlandia turn that got interrupted
// mid-roll and stayed invisibly stuck. Deferred tags are applied later, once
// the matching roll_result comes back, by re-running this same function
// against the original stored entry content.
function applyStateTags(cleanResponse, gameState, worldConfig, matchLocationId) {
  const locationMatch = cleanResponse.match(/\[LOCATION: ([^\]]+)\]/);
  if (locationMatch) {
    const locName = locationMatch[1].trim();
    gameState.worldState.location = locName;
    const locId = matchLocationId(locName);
    if (locId) {
      if (!gameState.worldState.visited_locations) gameState.worldState.visited_locations = [];
      if (!gameState.worldState.visited_locations.includes(locId)) {
        gameState.worldState.visited_locations.push(locId);
      }
    }
  }

  const scarRegex = /\[SCAR: ([^:]+): ([^\]]+)\]/g;
  let scarMatch;
  while ((scarMatch = scarRegex.exec(cleanResponse)) !== null) {
    const locId = matchLocationId(scarMatch[1].trim());
    const label = scarMatch[2].trim();
    if (locId) {
      if (!gameState.worldState.location_scars) gameState.worldState.location_scars = [];
      const exists = gameState.worldState.location_scars.some(s => s.id === locId && s.label === label);
      if (!exists) gameState.worldState.location_scars.push({ id: locId, label });
    }
  }

  // Objective/quest tracking — shared across all world types (generalizes
  // Manlandia's stone tracker, the only world with structured quest state before this).
  if (!gameState.worldState.objectives) gameState.worldState.objectives = [];
  const objectiveUpdates = extractObjectiveUpdates(cleanResponse, gameState.worldState.objectives);
  for (const text of objectiveUpdates.additions) {
    gameState.worldState.objectives.push({ text, done: false });
  }
  for (const text of objectiveUpdates.completedTexts) {
    const obj = gameState.worldState.objectives.find(o => o.text === text);
    if (obj) obj.done = true;
  }

  // NPC lorebook — shared across all world types, same as objectives: the
  // whole party learns about a person together.
  if (!gameState.worldState.npcs) gameState.worldState.npcs = [];
  for (const npc of extractLorebookUpdates(cleanResponse, gameState.worldState.npcs)) {
    gameState.worldState.npcs.push(npc);
  }

  if (worldConfig.id === "manlandia" || worldConfig.type === "custom") {
    const villainUpdate = extractCounterUpdate(cleanResponse, "VILLAIN AWARENESS");
    if (villainUpdate !== null) gameState.worldState.villain_awareness = villainUpdate;

    const curseUpdate = extractCounterUpdate(cleanResponse, "CURSE");
    if (curseUpdate !== null) gameState.worldState.curse_level = curseUpdate;

    if (worldConfig.id === "manlandia") {
      const stoneRegex = /\[STONE FOUND: ([^\]]+)\]/g;
      let stoneMatch;
      while ((stoneMatch = stoneRegex.exec(cleanResponse)) !== null) {
        const stoneId = matchStoneId(stoneMatch[1]);
        if (stoneId) {
          if (!gameState.worldState.stones_found) gameState.worldState.stones_found = [];
          if (!gameState.worldState.stones_found.includes(stoneId)) {
            gameState.worldState.stones_found.push(stoneId);
          }
        }
      }
    }

    for (const { key, harm } of extractCharacterHarmUpdates(cleanResponse, gameState.characters)) {
      gameState.characters[key].harm = harm;
    }

    for (const key of extractAbilityUsedKeys(cleanResponse, gameState.characters)) {
      gameState.characters[key].ability_used = true;
    }

    // Inventory — shared party loot for kid-friendly games ([ITEM FOUND: ...]
    // -> worldState.inventory), per-character carried items for adult custom
    // campaigns ([ITEM N: ...] -> that hero's own inventory). Both regexes
    // are checked unconditionally rather than gated on the campaign's adult
    // flag: each prompt file only ever teaches the model the one tag matching
    // its own world, so in practice only one of these ever actually fires —
    // this is just the same tolerant "parse whatever shape shows up" stance
    // as every other tag here, not a real ambiguity.
    if (!gameState.worldState.inventory) gameState.worldState.inventory = [];
    for (const item of extractSharedItemAdditions(cleanResponse, gameState.worldState.inventory)) {
      gameState.worldState.inventory.push(item);
    }
    for (const { key, item } of extractCharacterItemAdditions(cleanResponse, gameState.characters)) {
      if (!gameState.characters[key].inventory) gameState.characters[key].inventory = [];
      gameState.characters[key].inventory.push(item);
    }

    // Bonus XP for a notable moment — on top of the baseline every character
    // already gets on new_session (see api/state.js and lib/growth.js).
    // Resonance is excluded from the whole growth system, so this only runs
    // in this branch.
    const isAdultGame = isAdultWorld(worldConfig, gameState);
    const growthConfig = isAdultGame ? GROWTH_CONFIG_ADULT : GROWTH_CONFIG_KID;
    for (const { key, amount } of extractXpBonuses(cleanResponse)) {
      if (!gameState.characters[key]) continue;
      Object.assign(gameState.characters[key], applyXpGain(gameState.characters[key], amount, growthConfig));
    }
  } else {
    const awarenessUpdate = extractCounterUpdate(cleanResponse, "CONCLAVE AWARENESS");
    if (awarenessUpdate !== null) gameState.worldState.conclave_awareness = awarenessUpdate;

    const dissonanceUpdate = extractCounterUpdate(cleanResponse, "DISSONANCE");
    if (dissonanceUpdate !== null) gameState.worldState.fen_dissonance_awakening = dissonanceUpdate;

    for (const { key, harm } of extractResonanceHarmUpdates(cleanResponse)) {
      if (gameState.characters[key]) gameState.characters[key].harm = harm;
    }

    for (const { key, item } of extractResonanceItemAdditions(cleanResponse, gameState.characters)) {
      if (!gameState.characters[key].inventory) gameState.characters[key].inventory = [];
      gameState.characters[key].inventory.push(item);
    }

    const resAbilityRegex = /\[ABILITY (FEN|LYRA): ([a-z_]+)\]/gi;
    let raMatch;
    while ((raMatch = resAbilityRegex.exec(cleanResponse)) !== null) {
      const who     = raMatch[1].toLowerCase();
      const ability = raMatch[2].toLowerCase();
      if (who === "lyra" && ability === "magic") {
        if (gameState.characters.lyra && gameState.characters.lyra.magic_uses_remaining > 0) {
          gameState.characters.lyra.magic_uses_remaining--;
        }
      } else if (gameState.characters[who] && ability in gameState.characters[who]) {
        gameState.characters[who][ability] = true;
      }
    }
  }
}

module.exports = {
  matchResonanceLocationId,
  matchManlandiaLocationId,
  matchCustomLocationId,
  applyStateTags,
};
