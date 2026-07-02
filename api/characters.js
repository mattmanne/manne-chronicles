const { getState, setState } = require("../lib/redis");
const { getWorldConfig } = require("../lib/worldconfig");

const ARCHETYPE_STATS = {
  fighter: { force: 3, acuity: 1, agility: 2, will: 1, presence: 0 },
  mage:    { force: 0, acuity: 3, agility: 1, will: 2, presence: 1 },
  scout:   { force: 1, acuity: 2, agility: 3, will: 1, presence: 0 },
  leader:  { force: 2, acuity: 1, agility: 0, will: 3, presence: 1 },
  charmer: { force: 0, acuity: 2, agility: 1, will: 1, presence: 3 },
};

const VALID_ARCHETYPES = Object.keys(ARCHETYPE_STATS);
const VALID_ABILITIES  = ["animal_friend", "lucky_break", "protect_friend", "ancient_magic"];
const VALID_PLAYERS    = ["player1", "player2", "player3", "player4"];

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
  if (worldConfig.id !== "manlandia" && worldConfig.type !== "custom") {
    return res.status(400).json({ error: "Characters API requires Manlandia or a custom campaign" });
  }

  const { key } = worldConfig;
  const { player, name, archetype, ability_id, backstory } = req.body;

  if (!VALID_PLAYERS.includes(player))                        return res.status(400).json({ error: "Invalid player" });
  if (!name || typeof name !== "string" || !name.trim())      return res.status(400).json({ error: "Name required" });
  if (!VALID_ARCHETYPES.includes(archetype))                  return res.status(400).json({ error: "Invalid archetype" });
  if (!VALID_ABILITIES.includes(ability_id))                  return res.status(400).json({ error: "Invalid ability" });

  const gameState = (await getState(key)) || worldConfig.getInitialState();
  const existing  = gameState.characters[player] || {};

  gameState.characters[player] = {
    ...existing,
    name:         name.trim().slice(0, 20),
    archetype,
    stats:        { ...ARCHETYPE_STATS[archetype] },
    ability_id,
    ability_used: existing.ability_used ?? false,
    harm:         existing.harm ?? "Unhurt",
    backstory:    typeof backstory === "string" ? backstory.trim() : (existing.backstory ?? ""),
  };

  await setState(key, gameState);
  return res.json({ ok: true, characters: gameState.characters });
};
