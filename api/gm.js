const { getState, setState } = require("../lib/redis");
const { generateContent } = require("../lib/gemini");
const { buildSystemPrompt } = require("../lib/prompt");
const { getInitialState } = require("../lib/gamestate");

const KEY = "resonance:gamestate";
const MAX_HISTORY = 40;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
  if (locationMatch) gameState.worldState.location = locationMatch[1].trim();

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
      },
    },
  });
};
