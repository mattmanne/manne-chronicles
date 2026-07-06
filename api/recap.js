const { getState } = require("../lib/redis");
const { generateContent } = require("../lib/gemini");
const { getWorldConfig } = require("../lib/worldconfig");
const { formatTranscript, buildRecapSystemPrompt } = require("../lib/recap");
const { checkAdultAccess, isAdultWorld } = require("../lib/adultgate");
const { checkRateLimit } = require("../lib/ratelimit");
const { getPlayerDisplayName } = require("../public/pure.js");

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Adult-Pin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!(await checkRateLimit(`ratelimit:recap:${ip}`, 10, 60))) {
    return res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
  }

  const worldConfig = getWorldConfig(req.query.world);
  const gameState = (await getState(worldConfig.key)) || worldConfig.getInitialState();
  if (!(await checkAdultAccess(req, res, worldConfig, gameState))) return;

  const transcript = formatTranscript(gameState);
  if (!transcript) {
    return res.json({ recap: "The adventure hasn't begun yet — there's nothing to recap!" });
  }

  const isKidWorld = !isAdultWorld(worldConfig, gameState);
  const viewerName = req.query.player ? getPlayerDisplayName(req.query.player, gameState) : null;

  const systemPrompt = buildRecapSystemPrompt(isKidWorld, viewerName);

  try {
    const recap = await generateContent(systemPrompt, [], transcript);
    return res.json({ recap: recap.trim() });
  } catch (err) {
    console.error("Recap error:", err);
    return res.status(500).json({ error: "Could not put together a recap right now. Please try again!" });
  }
};
