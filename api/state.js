const { Redis } = require("@upstash/redis");
const { getInitialState } = require("../lib/gamestate");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const STATE_KEY = "resonance:gamestate";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const state = await redis.get(STATE_KEY);
    return res.json(state || getInitialState());
  }

  if (req.method === "POST") {
    const { action, payload } = req.body;

    if (action === "reset") {
      await redis.set(STATE_KEY, getInitialState());
      return res.json({ ok: true });
    }

    if (action === "update") {
      await redis.set(STATE_KEY, payload);
      return res.json({ ok: true });
    }

    if (action === "new_session") {
      const current = (await redis.get(STATE_KEY)) || getInitialState();
      current.session += 1;
      current.worldState.session_summaries.push(payload.summary);
      current.sessionLog = [];
      current.characters.michelle.weight_of_knowing_used = false;
      current.characters.michelle.magic_uses_remaining = 3;
      current.characters.matt.not_on_my_watch_used = false;
      current.characters.matt.lucky_break_used = false;
      await redis.set(STATE_KEY, current);
      return res.json({ ok: true, session: current.session });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.status(405).json({ error: "Method not allowed" });
};
