const { Redis } = require("@upstash/redis");
const { getInitialState } = require("../lib/gamestate");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const STATE_KEY = "resonance:gamestate";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const state = (await redis.get(STATE_KEY)) || getInitialState();
  const since = parseInt(req.query.since || "0");

  const newEntries = state.sessionLog.filter((e) => e.timestamp > since);

  return res.json({
    entries: newEntries,
    characters: state.characters,
    worldState: {
      conclave_awareness: state.worldState.conclave_awareness,
      matt_dissonance_awakening: state.worldState.matt_dissonance_awakening,
      location: state.worldState.location,
      session: state.session,
    },
  });
};
