const { getState, setState } = require("../lib/redis");
const { getWorldConfig } = require("../lib/worldconfig");

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const gameSecret = process.env.GAME_SECRET;
  if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const worldConfig = getWorldConfig(req.query.world);
  const key = `push:${worldConfig.id}:subscriptions`;

  const { action, payload } = req.body || {};

  if (action === "subscribe") {
    const { player, subscription } = payload || {};
    if (!player || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription" });
    }
    const subs = (await getState(key)) || [];
    const deduped = subs.filter((s) => s.endpoint !== subscription.endpoint);
    deduped.push({ player, endpoint: subscription.endpoint, keys: subscription.keys });
    await setState(key, deduped);
    return res.json({ ok: true });
  }

  if (action === "unsubscribe") {
    const { endpoint } = payload || {};
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    const subs = (await getState(key)) || [];
    await setState(key, subs.filter((s) => s.endpoint !== endpoint));
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "Unknown action" });
};
