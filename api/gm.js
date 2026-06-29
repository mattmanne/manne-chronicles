const { getState, setState } = require("../lib/redis");
const { generateContent } = require("../lib/gemini");
const { buildSystemPrompt } = require("../lib/prompt");
const { getInitialState } = require("../lib/gamestate");

const KEY = "resonance:gamestate";
const MAX_HISTORY = 40;

function matchLocationId(name) {
  const s = name.toLowerCase();
  if (s.includes("salt") || s.includes("wick") || s.includes("pub")) return "salt-wick";
  if (s.includes("archive")) return "archive";
  if (s.includes("scholar")) return "scholars-row";
  if (s.includes("market")) return "market-square";
  if (s.includes("concordance") || (s.includes("conclave") && !s.includes("warden"))) return "conclave-hall";
  if (s.includes("warden")) return "warden-post";
  if (s.includes("dock")) return "docks";
  if (s.includes("low quarter") || s.includes("low-quarter")) return "low-quarter";
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const gameSecret = process.env.GAME_SECRET;
  if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { player, message, type } = req.body;
  if (!player || !message) return res.status(400).json({ error: "Missing player or message" });

  const gameState = (await getState(KEY)) || getInitialState();
  const systemPrompt = buildSystemPrompt(gameState);

  const recentLog = gameState.sessionLog.slice(-MAX_HISTORY);
  const history = recentLog.map((entry) => ({
    role: entry.role === "gm" ? "assistant" : "user",
    content: entry.content,
  }));

  const playerLabel = player.charAt(0).toUpperCase() + player.slice(1);
  const userMessage =
    type === "roll_result" ? message : `${playerLabel}: ${message}`;

  let gmResponse;
  try {
    gmResponse = await generateContent(systemPrompt, history, userMessage);
  } catch (err) {
    console.error("Gemini error:", err);
    return res.status(500).json({ error: "The GM encountered an error: " + err.message });
  }

  const rollMatch = gmResponse.match(/^ROLL:(FORCE|ACUITY|AGILITY|WILL|PRESENCE)(:ADVANTAGE)?$/m);
  const needsRoll = !!rollMatch;
  const rollStat = rollMatch ? rollMatch[1].toLowerCase() : null;
  const rollAdvantage = rollMatch ? !!rollMatch[2] : false;
  const cleanResponse = gmResponse.replace(/^ROLL:(FORCE|ACUITY|AGILITY|WILL|PRESENCE)(:ADVANTAGE)?$/m, "").trim();

  gameState.sessionLog.push(
    { role: "user", content: userMessage, player, timestamp: Date.now() },
    { role: "gm", content: cleanResponse, timestamp: Date.now() }
  );
  if (gameState.sessionLog.length > 100) {
    gameState.sessionLog = gameState.sessionLog.slice(-80);
  }

  const awarenessMatch = cleanResponse.match(/\[CONCLAVE AWARENESS: (\d+) → (\d+)\]/);
  if (awarenessMatch) gameState.worldState.conclave_awareness = parseInt(awarenessMatch[2]);

  const dissonanceMatch = cleanResponse.match(/\[DISSONANCE: (\d+) → (\d+)\]/);
  if (dissonanceMatch) gameState.worldState.fen_dissonance_awakening = parseInt(dissonanceMatch[2]);

  const harmRegex = /\[(LYRA|FEN): ([A-Za-z]+) → ([A-Za-z]+)\]/g;
  let harmMatch;
  while ((harmMatch = harmRegex.exec(cleanResponse)) !== null) {
    const who = harmMatch[1].toLowerCase();
    if (gameState.characters[who]) gameState.characters[who].harm = harmMatch[3];
  }

  const locationMatch = cleanResponse.match(/\[LOCATION: ([^\]]+)\]/);
  if (locationMatch) {
    const locName = locationMatch[1].trim();
    gameState.worldState.location = locName;
    const locId = matchLocationId(locName);
    if (locId) {
      if (!gameState.worldState.visited_locations) gameState.worldState.visited_locations = [];
      if (!gameState.worldState.visited_locations.includes(locId)) {
        gameState.worldState.visited_locations.push(locId);
      }
    }
  }

  const scarRegex = /\[SCAR: ([^:]+): ([^\]]+)\]/g;
  let scarMatch;
  while ((scarMatch = scarRegex.exec(cleanResponse)) !== null) {
    const locId = matchLocationId(scarMatch[1].trim());
    const label = scarMatch[2].trim();
    if (locId) {
      if (!gameState.worldState.location_scars) gameState.worldState.location_scars = [];
      const exists = gameState.worldState.location_scars.some(s => s.id === locId && s.label === label);
      if (!exists) gameState.worldState.location_scars.push({ id: locId, label });
    }
  }

  await setState(KEY, gameState);

  return res.json({
    response: cleanResponse,
    needsRoll,
    rollStat,
    rollAdvantage,
    gameState: {
      characters: gameState.characters,
      worldState: {
        session: gameState.session,
        conclave_awareness: gameState.worldState.conclave_awareness,
        fen_dissonance_awakening: gameState.worldState.fen_dissonance_awakening,
        location: gameState.worldState.location,
        visited_locations: gameState.worldState.visited_locations,
        location_scars: gameState.worldState.location_scars,
      },
    },
  });
};
