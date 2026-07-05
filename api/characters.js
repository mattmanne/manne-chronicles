const { getState, setState } = require("../lib/redis");
const { getWorldConfig } = require("../lib/worldconfig");
const { ARCHETYPE_STATS, ARCHETYPE_IDS: VALID_ARCHETYPES, ABILITY_IDS: VALID_ABILITIES, HERO_COLOR_IDS: VALID_COLORS, HERO_SYMBOLS: VALID_SYMBOLS } = require("../lib/character-options");

const VALID_PLAYERS = ["player1", "player2", "player3", "player4"];

// A base64 data URL runs ~4/3 the size of the underlying bytes, so ~280,000
// characters caps the stored image around 200KB — generous headroom over
// what the client's own resizeForStorage() actually produces (200x200 JPEG
// at quality 0.72, typically well under 50KB), while still bounding the
// Redis payload if that resize step is ever bypassed or changed.
const MAX_PHOTO_LENGTH = 280000;

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
  const { player, name, archetype, ability_id, backstory, photo, color, symbol } = req.body;

  if (!VALID_PLAYERS.includes(player))                        return res.status(400).json({ error: "Invalid player" });
  if (!name || typeof name !== "string" || !name.trim())      return res.status(400).json({ error: "Name required" });
  if (!VALID_ARCHETYPES.includes(archetype))                  return res.status(400).json({ error: "Invalid archetype" });
  if (!VALID_ABILITIES.includes(ability_id))                  return res.status(400).json({ error: "Invalid ability" });
  if (typeof photo === "string" && photo) {
    if (photo.length > MAX_PHOTO_LENGTH) return res.status(400).json({ error: "Photo is too large" });
    // Only length was checked before this — a crafted non-image string sent
    // directly to this API (bypassing the client's own canvas/resize flow,
    // which always produces a real image data URL) would otherwise be stored
    // and later rendered as an <img src="..."> unescaped-by-necessity, since
    // a real data URL legitimately contains characters escapeHtml would
    // otherwise mangle. Requiring the real data:image/ prefix closes that
    // off at the one point it can be checked cheaply.
    if (!/^data:image\/(png|jpe?g|gif|webp);base64,/.test(photo)) {
      return res.status(400).json({ error: "Photo must be a valid image" });
    }
  }
  if (color !== undefined && color !== "" && !VALID_COLORS.includes(color)) {
    return res.status(400).json({ error: "Invalid color" });
  }
  if (symbol !== undefined && symbol !== "" && !VALID_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ error: "Invalid symbol" });
  }

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
    // A hero's photo is stored server-side (not localStorage) so it syncs
    // across every family member's device instead of only the phone it was
    // uploaded from — omitting the field on later edits (e.g. just fixing a
    // typo'd name) preserves whatever photo was already saved.
    photo:        typeof photo === "string" && photo ? photo : (existing.photo ?? ""),
    // Same "omit to keep whatever was already saved" pattern as photo above.
    color:        color  || (existing.color  ?? ""),
    symbol:       symbol || (existing.symbol ?? ""),
    // Growth fields (see lib/growth.js) — untouched by name/archetype edits,
    // just defaulted here so a brand-new character starts from zero instead
    // of undefined.
    xp:               existing.xp ?? 0,
    milestones:       existing.milestones ?? [],
    bonus_abilities:  existing.bonus_abilities ?? [],
    pending_choice:   existing.pending_choice ?? null,
  };

  await setState(key, gameState);
  return res.json({ ok: true, characters: gameState.characters });
};
