const { getState } = require("../lib/redis");
const { getWorldConfig } = require("../lib/worldconfig");

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const worldConfig = getWorldConfig(req.query.world);
  const { key, getInitialState } = worldConfig;

  const state = (await getState(key)) || getInitialState();
  const since = parseInt(req.query.since || "0");
  const newEntries = state.sessionLog.filter((e) => e.timestamp > since && !e.rolling);

  let worldStatePayload;
  if (worldConfig.id === "manlandia") {
    worldStatePayload = {
      villain_awareness: state.worldState.villain_awareness,
      curse_level: state.worldState.curse_level,
      stones_found: state.worldState.stones_found || [],
      location: state.worldState.location,
      session: state.session,
      visited_locations: state.worldState.visited_locations || [],
      location_scars: state.worldState.location_scars || [],
    };
  } else if (worldConfig.type === "custom") {
    worldStatePayload = {
      villain_awareness: state.worldState.villain_awareness,
      curse_level: state.worldState.curse_level,
      location: state.worldState.location,
      session: state.session,
      visited_locations: state.worldState.visited_locations || [],
      location_scars: state.worldState.location_scars || [],
    };
  } else {
    worldStatePayload = {
      conclave_awareness: state.worldState.conclave_awareness,
      fen_dissonance_awakening: state.worldState.fen_dissonance_awakening,
      location: state.worldState.location,
      session: state.session,
      visited_locations: state.worldState.visited_locations || [],
      location_scars: state.worldState.location_scars || [],
    };
  }

  return res.json({
    entries: newEntries,
    characters: state.characters,
    worldState: worldStatePayload,
  });
};
