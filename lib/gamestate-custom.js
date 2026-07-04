function getInitialStateCustom(worldConfig) {
  const chars = {};
  for (let i = 1; i <= 4; i++) {
    chars[`player${i}`] = {
      name: `Hero ${i}`, harm: "Unhurt",
      archetype: null,
      stats: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
      ability_id: null, ability_used: false, backstory: "",
      xp: 0, milestones: [], bonus_abilities: [], pending_choice: null,
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
    },
  };
}

module.exports = { getInitialStateCustom };
