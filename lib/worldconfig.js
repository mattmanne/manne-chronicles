const { getInitialState }            = require('./gamestate');
const { buildSystemPrompt }          = require('./prompt');
const { getInitialStateManlandia }   = require('./gamestate-manlandia');
const { buildSystemPromptManlandia } = require('./prompt-manlandia');

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
  return WORLDS[worldId] || WORLDS.resonance;
}

module.exports = { getWorldConfig };
