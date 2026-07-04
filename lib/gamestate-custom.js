// Inventory scope is decided once, at creation time, from the campaign's own
// adult flag: adult campaigns track who's carrying what per-hero (fits the
// "everyone's aware of each other" table dynamic), kid campaigns track one
// shared party inventory (fits how loot usually works in those games) — same
// per-campaign adult/kid split as lib/growth.js's XP pacing. Shaped this way
// at init specifically so neither world ever carries the other's unused
// field (unlike known_allies/known_enemies/dead_npcs elsewhere in this app,
// which are vestigial fields nothing ever reads or writes).
function getInitialStateCustom(worldConfig) {
  const isAdult = worldConfig?.adult === true;
  const chars = {};
  for (let i = 1; i <= 4; i++) {
    chars[`player${i}`] = {
      name: `Hero ${i}`, harm: "Unhurt",
      archetype: null,
      stats: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
      ability_id: null, ability_used: false, backstory: "",
      xp: 0, milestones: [], bonus_abilities: [], pending_choice: null,
      // Bonds (relationship statements between heroes) are adult-only too,
      // same reasoning as inventory above.
      ...(isAdult && { inventory: [], bonds: [] }),
    };
  }
  return {
    session: 1,
    worldConfig: worldConfig || {},
    sessionLog: [],
    characters: chars,
    worldState: {
      location: "The Beginning",
      villain_awareness: 0,
      curse_level: 0,
      visited_locations: [],
      location_scars: [],
      session_summaries: [],
      author_note: "",
      objectives: [],
      npcs: [],
      ...(!isAdult && { inventory: [] }),
    },
  };
}

module.exports = { getInitialStateCustom };
