const { getState } = require("../lib/redis");
const { getInitialState } = require("../lib/gamestate");

const KEY = "resonance:gamestate";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const state = (await getState(KEY)) || getInitialState();
  const since = parseInt(req.query.since || "0");
  const newEntries = state.sessionLog.filter((e) => e.timestamp > since);

  return res.json({
    entries: newEntries,
    characters: state.characters,
    worldState: {
      conclave_awareness: state.worldState.conclave_awareness,
      fen_dissonance_awakening: state.worldState.fen_dissonance_awakening,
      location: state.worldState.location,
      session: state.session,
    },
  });
};
