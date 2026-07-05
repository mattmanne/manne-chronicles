const { isAdultWorld } = require("./adultgate");

// One fixed trigger message for every ambient call — the actual tone/flavor
// difference lives entirely in the system prompt below, same "one function,
// branch on world type" shape as buildWorldStatePayload in lib/worldconfig.js.
const AMBIENT_TRIGGER = "Write the ambient beat now.";

// Deliberately teaches the model NOTHING about bracket tags — no STATE
// NOTATION block, no examples, nothing. This makes state-mutation
// structurally impossible during an ambient beat rather than merely
// discouraged: api/cron-turn-reminder.js never calls applyStateTags() on
// this output at all, so even a stray bracket the model ignored this prompt
// and emitted anyway would just get silently stripped for display like any
// other unrecognized text (public/pure.js's stripGMTags()) — never parsed,
// never applied to real state.
function buildAmbientPrompt(worldConfig, gameState) {
  const isAdult = isAdultWorld(worldConfig, gameState);
  const common = `You are narrating a brief, atmospheric "meanwhile..." beat for a tabletop-style story world, shown to players who haven't played in a few days. This is flavor only — a taste of the world continuing without them, not a real story event.

Write 2-4 sentences of prose. Do not advance the plot in a way that requires a player response. Do not introduce a new named character, item, or objective. Never use brackets, tags, or any kind of game notation of any kind — prose only. Do not ask a question or end with a prompt for the player to act.`;

  if (worldConfig.id === "resonance") {
    return `${common}

Setting: Varek, a city where Lyra investigates strange happenings for the Conclave, and Fen — unknowingly touched by Dissonance — works at the Salt & Wick Pub. Write one ominous or intriguing beat: a rumor spreading, something shifting in the Low Quarter, the Conclave's attention drifting somewhere new. Tone: quietly unsettling, adult, atmospheric — never graphic.`;
  }

  if (worldConfig.id === "manlandia") {
    return `${common}

Setting: Manlandia, a magical land slowly touched by the Greying Curse, home to heroic kids and their animal and magical friends. Write one warm, exciting beat: the mist creeping a little further, a creature stirring, Bramble noticing something odd. Tone: gentle adventure for kids — exciting, never scary or violent, no real danger implied.`;
  }

  // Custom worlds — no fixed lore, so lean on whatever the player wrote at
  // creation time, same source lib/prompt-custom.js already reads from.
  const name  = gameState?.worldConfig?.name  || "this world";
  const theme = gameState?.worldConfig?.theme || "an adventure world";
  return `${common}

Setting: "${name}" — ${theme}. Write one beat true to this world's own tone and theme, showing it continuing on without the players for now. ${isAdult ? "Tone: can be mature, tense, or dramatic, matching this world's own theme." : "Tone: kid-safe — exciting adventure, never scary, violent, or graphic."}`;
}

module.exports = { buildAmbientPrompt, AMBIENT_TRIGGER };
