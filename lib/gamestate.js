const INITIAL_STATE = {
  session: 1,
  sessionLog: [],
  worldState: {
    conclave_awareness: 0,
    location: "The Salt & Wick Pub, Varek",
    current_scene: "Session 1 — Evening Shift",
    known_allies: [],
    known_enemies: [],
    dead_npcs: [],
    scars: { lyra: [], fen: [] },
    revelations: [],
    fen_dissonance_awakening: 0,
    session_summaries: [],
    session_archive: [],
    visited_locations: ["salt-wick"],
    location_scars: [],
    author_note: "",
    pinned_notes: [],
    objectives: [],
    clues: [],
    npcs: [],
    last_actor: null,
    last_action_at: null,
    last_reminder_sent_at: null,
    last_ambient_sent_at: null,
    combat: { active: false, round: 0, enemies: [] }
  },
  characters: {
    lyra: {
      name: "Lyra",
      harm: "Unhurt",
      magic_uses_remaining: 3,
      weight_of_knowing_used: false,
      inventory: [],
      bonds: [],
      scene_pin: ""
    },
    fen: {
      name: "Fen",
      harm: "Unhurt",
      not_on_my_watch_used: false,
      lucky_break_used: false,
      dissonance_revealed: false,
      inventory: [],
      bonds: [],
      scene_pin: ""
    }
  }
};

const HARM_LEVELS = ["Unhurt", "Scratched", "Hurt", "Wounded", "Broken", "Dying"];

function getInitialState() {
  return JSON.parse(JSON.stringify(INITIAL_STATE));
}

module.exports = { getInitialState, HARM_LEVELS };
