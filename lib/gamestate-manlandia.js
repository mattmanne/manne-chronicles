// Same loop-built shape as lib/gamestate-custom.js's four hero objects —
// these were previously hand-duplicated verbatim, which had drifted out of
// sync with the pattern the custom-world version already uses.
const characters = {};
for (let i = 1; i <= 4; i++) {
  characters[`player${i}`] = {
    name: `Hero ${i}`, harm: "Unhurt", archetype: null,
    stats: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
    ability_id: null, ability_used: false, backstory: "",
    xp: 0, milestones: [], bonus_abilities: [], bonus_abilities_used: [], pending_choice: null,
  };
}

const INITIAL_STATE = {
  session: 1,
  sessionLog: [],
  worldState: {
    villain_awareness: 0,
    curse_level: 0,
    location: "Hidden Village",
    current_scene: "Session 1 — The Greying Begins",
    stones_found: [],
    known_allies: [],
    known_enemies: [],
    dead_npcs: [],
    revelations: [],
    session_summaries: [],
    session_archive: [],
    visited_locations: ["hidden-village"],
    location_scars: [],
    author_note: "",
    pinned_notes: [],
    objectives: [],
    clues: [],
    npcs: [],
    inventory: [],
    last_actor: null,
    last_action_at: null,
    last_reminder_sent_at: null,
    last_ambient_sent_at: null,
    combat: { active: false, round: 0, enemies: [] },
  },
  characters,
};

// IDs match [STONE FOUND: X] tag values and stone tracker slots
const STONE_IDS = ["earthstone", "froststone", "lifestone", "firestone", "skystone"];

function getInitialStateManlandia() {
  return JSON.parse(JSON.stringify(INITIAL_STATE));
}

module.exports = { getInitialStateManlandia, STONE_IDS };
