const { getInitialState }            = require('./gamestate');
const { buildSystemPrompt }          = require('./prompt');
const { getInitialStateManlandia }   = require('./gamestate-manlandia');
const { buildSystemPromptManlandia } = require('./prompt-manlandia');
const { getInitialStateCustom }      = require('./gamestate-custom');
const { buildSystemPromptCustom }    = require('./prompt-custom');

const WORLDS = {
  resonance: {
    id: 'resonance',
    key: 'resonance:gamestate',
    getInitialState,
    buildSystemPrompt,
  },
  manlandia: {
    id: 'manlandia',
    key: 'manlandia:gamestate',
    getInitialState: getInitialStateManlandia,
    buildSystemPrompt: buildSystemPromptManlandia,
  },
};

function getWorldConfig(worldId) {
  if (WORLDS[worldId]) return WORLDS[worldId];
  // Custom campaigns are identified purely by a "c_" id prefix (assigned at
  // creation time in api/campaigns.js as `c_${Date.now()}`) — there's no
  // separate registry entry per custom world, unlike resonance/manlandia above.
  if (worldId && String(worldId).startsWith('c_')) {
    return {
      id:   worldId,
      type: 'custom',
      key:  `campaign:${worldId}:gamestate`,
      getInitialState: () => getInitialStateCustom({}),
      buildSystemPrompt: buildSystemPromptCustom,
    };
  }
  return WORLDS.resonance;
}

// Shared by api/gm.js (the response after a turn) and api/poll.js (every
// poll tick) — both need the exact same "which worldState fields does this
// world type expose to the client" answer, and used to compute it by hand
// independently. Every new worldState field (npcs, inventory, last_actor,
// ...) had to be added to both call sites separately before this existed.
function buildWorldStatePayload(worldConfig, gameState) {
  const ws = gameState.worldState;
  if (worldConfig.id === "manlandia" || worldConfig.type === "custom") {
    return {
      session: gameState.session,
      villain_awareness: ws.villain_awareness,
      curse_level: ws.curse_level,
      ...(worldConfig.id === "manlandia" && { stones_found: ws.stones_found || [] }),
      location: ws.location,
      visited_locations: ws.visited_locations || [],
      location_scars: ws.location_scars || [],
      objectives: ws.objectives || [],
      clues: ws.clues || [],
      npcs: ws.npcs || [],
      inventory: ws.inventory || [],
      last_actor: ws.last_actor || null,
      combat: ws.combat || { active: false, round: 0, enemies: [] },
    };
  }
  return {
    session: gameState.session,
    conclave_awareness: ws.conclave_awareness,
    fen_dissonance_awakening: ws.fen_dissonance_awakening,
    location: ws.location,
    visited_locations: ws.visited_locations || [],
    location_scars: ws.location_scars || [],
    objectives: ws.objectives || [],
    clues: ws.clues || [],
    npcs: ws.npcs || [],
    last_actor: ws.last_actor || null,
    combat: ws.combat || { active: false, round: 0, enemies: [] },
  };
}

module.exports = { getWorldConfig, buildWorldStatePayload };
