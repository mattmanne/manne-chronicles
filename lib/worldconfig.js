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

module.exports = { getWorldConfig };
