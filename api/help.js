const { generateContent } = require("../lib/gemini");
const { getState } = require("../lib/redis");
const { getWorldConfig } = require("../lib/worldconfig");
const { buildSystemPrompt } = require("../lib/prompt");
const { buildSystemPromptManlandia } = require("../lib/prompt-manlandia");

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question } = req.body || {};
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question required" });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: "question too long" });
  }

  const worldConfig = getWorldConfig(req.query.world);
  const gameState = (await getState(worldConfig.key)) || worldConfig.getInitialState();

  let gameContext;
  if (worldConfig.id === "manlandia") {
    gameContext = buildSystemPromptManlandia(gameState);
  } else if (worldConfig.type === "custom") {
    const { buildSystemPromptCustom } = require("../lib/prompt-custom");
    gameContext = buildSystemPromptCustom(gameState);
  } else {
    gameContext = buildSystemPrompt(gameState);
  }

  const isKidWorld = worldConfig.id === "manlandia" || worldConfig.type === "custom";

  const systemPrompt = `You are a friendly helper for a family tabletop RPG game. Your job is to answer questions from players${isKidWorld ? " — including children as young as 8 —" : ""} about the game rules, world, characters, and what is currently happening in their adventure.

Be warm, clear, and encouraging. Use plain words${isKidWorld ? " that a child aged 8 can understand" : ""}. Keep answers short — 2–4 sentences unless a longer explanation is truly needed. If a player seems confused or worried they are doing something wrong, reassure them — there is no wrong way to play.

Do NOT narrate story events or make decisions for the players. You explain rules and answer questions. The Game Master tells the story.

Here is everything about the current game — the full rules, world, characters, and current campaign state:

${gameContext}`;

  try {
    const answer = await generateContent(systemPrompt, [], question.trim());
    return res.json({ answer });
  } catch (err) {
    console.error("Help error:", err);
    return res.status(500).json({ error: "Could not get an answer right now. Please try again!" });
  }
};
