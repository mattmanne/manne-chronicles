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
    session_summaries: []
  },
  characters: {
    lyra: {
      name: "Lyra",
      harm: "Unhurt",
      magic_uses_remaining: 3,
      weight_of_knowing_used: false
    },
    fen: {
      name: "Fen",
      harm: "Unhurt",
      not_on_my_watch_used: false,
      lucky_break_used: false,
      dissonance_revealed: false
    }
  }
};

const STATS = {
  lyra: { force: 1, acuity: 3, agility: 2, will: 2, presence: 1 },
  fen:  { force: 0, acuity: 1, agility: 1, will: 3, presence: 0 }
};

const HARM_LEVELS = ["Unhurt", "Scratched", "Hurt", "Wounded", "Broken", "Dying"];

function getInitialState() {
  return JSON.parse(JSON.stringify(INITIAL_STATE));
}

function rollDice(player, stat) {
  const modifier = STATS[player.toLowerCase()]?.[stat.toLowerCase()] ?? 0;
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2 + modifier;
  return { die1, die2, modifier, total, stat, player };
}

function interpretRoll(total) {
  if (total >= 10) return { level: "success", label: "Full Success" };
  if (total >= 7)  return { level: "partial", label: "Partial Success" };
  if (total >= 4)  return { level: "failure", label: "Failure" };
  return { level: "disaster", label: "Disaster" };
}

function applyHarm(currentHarm, steps = 1) {
  const idx = HARM_LEVELS.indexOf(currentHarm);
  const newIdx = Math.min(idx + steps, HARM_LEVELS.length - 1);
  return HARM_LEVELS[newIdx];
}

module.exports = { getInitialState, rollDice, interpretRoll, applyHarm, STATS, HARM_LEVELS };
