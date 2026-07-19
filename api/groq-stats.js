const { getRateLimitStats } = require("../lib/groq-tracking");

// Read-only diagnostic endpoint: how often a turn has actually failed
// because Groq's quota was exhausted (see lib/groq-tracking.js). Global
// across every world, not campaign-specific — same X-Game-Secret gate as
// every other endpoint that reads more than a public campaign listing.
module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const gameSecret = process.env.GAME_SECRET;
  if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stats = await getRateLimitStats();
  return res.json(stats);
};
