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
    npcs: [],
    inventory: [],
    last_actor: null,
    last_action_at: null,
    last_reminder_sent_at: null,
    combat: { active: false, round: 0, enemies: [] },
  },
  characters: {
    player1: { name: "Hero 1", harm: "Unhurt", archetype: null, stats: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 }, ability_id: null, ability_used: false, backstory: "", xp: 0, milestones: [], bonus_abilities: [], pending_choice: null },
    player2: { name: "Hero 2", harm: "Unhurt", archetype: null, stats: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 }, ability_id: null, ability_used: false, backstory: "", xp: 0, milestones: [], bonus_abilities: [], pending_choice: null },
    player3: { name: "Hero 3", harm: "Unhurt", archetype: null, stats: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 }, ability_id: null, ability_used: false, backstory: "", xp: 0, milestones: [], bonus_abilities: [], pending_choice: null },
    player4: { name: "Hero 4", harm: "Unhurt", archetype: null, stats: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 }, ability_id: null, ability_used: false, backstory: "", xp: 0, milestones: [], bonus_abilities: [], pending_choice: null },
  }
};

// IDs match [STONE FOUND: X] tag values and stone tracker slots
const STONE_IDS = ["earthstone", "froststone", "lifestone", "firestone", "skystone"];

const STONE_LABELS = {
  earthstone: "Earth",
  froststone: "Frost",
  lifestone:  "Life",
  firestone:  "Fire",
  skystone:   "Sky",
};

function getInitialStateManlandia() {
  return JSON.parse(JSON.stringify(INITIAL_STATE));
}

module.exports = { getInitialStateManlandia, STONE_IDS, STONE_LABELS };
