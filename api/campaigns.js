const { getState, setState } = require("../lib/redis");
const { getInitialStateCustom } = require("../lib/gamestate-custom");

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const index = (await getState("campaigns:index")) || [];
    return res.json({ campaigns: index });
  }

  if (req.method === "POST") {
    const gameSecret = process.env.GAME_SECRET;
    if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { action, payload } = req.body || {};

    if (action === "create") {
      const { name, theme, playerCount } = payload || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: "Name required" });
      if (!theme || !String(theme).trim()) return res.status(400).json({ error: "Theme required" });

      const id = `c_${Date.now()}`;
      const wc = {
        id,
        name:        String(name).trim().slice(0, 40),
        theme:       String(theme).trim().slice(0, 600),
        playerCount: Math.min(4, Math.max(1, parseInt(playerCount) || 2)),
        adult:       payload.adult === true,
      };

      await setState(`campaign:${id}:gamestate`, getInitialStateCustom(wc));

      const index = (await getState("campaigns:index")) || [];
      const entry = {
        id,
        name:        wc.name,
        subtitle:    wc.theme.slice(0, 70) + (wc.theme.length > 70 ? "…" : ""),
        playerCount: wc.playerCount,
        adult:       wc.adult,
        createdAt:   Date.now(),
      };
      index.push(entry);
      await setState("campaigns:index", index);

      return res.json({ ok: true, campaign: entry });
    }

    if (action === "delete") {
      const { id } = payload || {};
      if (!id || !String(id).startsWith("c_")) return res.status(400).json({ error: "Invalid campaign ID" });
      const index = (await getState("campaigns:index")) || [];
      await setState("campaigns:index", index.filter(c => c.id !== id));
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.status(405).json({ error: "Method not allowed" });
};
