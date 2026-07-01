const { getState, setState } = require("../lib/redis");
const { generateContent } = require("../lib/gemini");
const { getWorldConfig } = require("../lib/worldconfig");
const { STONE_IDS } = require("../lib/gamestate-manlandia");
const { extractSuggestions } = require("../lib/suggestions");
const { checkAdultAccess } = require("../lib/adultgate");

const MAX_HISTORY = 40; // entries of context sent to the LLM per turn — bounds prompt cost; full log is still stored

function matchResonanceLocationId(name) {
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

function matchManlandiaLocationId(name) {
  const s = name.toLowerCase();
  if (s.includes("hidden") || s.includes("village")) return "hidden-village";
  if (s.includes("mountain") || s.includes("peak")) return "mountain-peaks";
  if (s.includes("frost") || s.includes("frost land")) return "frost-lands";
  if (s.includes("swamp")) return "the-swamp";
  if (s.includes("dragon") || s.includes("cave")) return "dragons-cave";
  if (s.includes("pirate") || s.includes("coast")) return "pirate-coast";
  if (s.includes("underground") || s.includes("lair")) return "underground-lair";
  if (s.includes("sky")) return "sky-realm";
  return null;
}

function matchStoneId(name) {
  const s = name.toLowerCase().trim();
  return STONE_IDS.includes(s) ? s : null;
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Secret, X-Adult-Pin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const gameSecret = process.env.GAME_SECRET;
  if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const worldConfig = getWorldConfig(req.query.world);
  const { key, getInitialState, buildSystemPrompt } = worldConfig;

  const { player, message, type, tone } = req.body;
  if (!player || !message) return res.status(400).json({ error: "Missing player or message" });
  if (message.length > 1000) return res.status(400).json({ error: "Message too long" });

  const gameState = (await getState(key)) || getInitialState();
  if (!checkAdultAccess(req, res, worldConfig, gameState)) return;

  let systemPrompt = buildSystemPrompt(gameState);

  if ((worldConfig.id === "manlandia" || worldConfig.type === "custom") && tone && tone !== "adventure") {
    if (tone === "silly") {
      systemPrompt += "\n\nTONE ADJUSTMENT: Make this session playful and silly. Creatures are goofy. Situations turn absurd. Use wordplay and light humor. Think funny children's movie energy. Keep the adventure real but wrap it in warmth and comedy.";
    } else if (tone === "epic") {
      systemPrompt += "\n\nTONE ADJUSTMENT: Make this session feel grand and epic. Powerful, vivid descriptions. Dramatic moments. Heroes feel legendary. High stakes. Think big fantasy movie energy.";
    }
  }

  const recentLog = gameState.sessionLog.slice(-MAX_HISTORY);
  const history = recentLog.map((entry) => ({
    role: entry.role === "gm" ? "assistant" : "user",
    content: entry.content,
  }));

  const playerLabel = player.charAt(0).toUpperCase() + player.slice(1);
  const userMessage = type === "roll_result" ? message : `${playerLabel}: ${message}`;

  let gmResponse;
  try {
    gmResponse = await generateContent(systemPrompt, history, userMessage);
  } catch (err) {
    console.error("GM error:", err);
    return res.status(500).json({ error: "The GM encountered an error: " + err.message });
  }

  const rollMatch = gmResponse.match(/^ROLL:(FORCE|ACUITY|AGILITY|WILL|PRESENCE)(:ADVANTAGE)?$/m);
  const needsRoll = !!rollMatch;
  const rollStat = rollMatch ? rollMatch[1].toLowerCase() : null;
  const rollAdvantage = rollMatch ? !!rollMatch[2] : false;
  const rollStripped = gmResponse.replace(/^ROLL:(FORCE|ACUITY|AGILITY|WILL|PRESENCE)(:ADVANTAGE)?$/m, "").trim();
  const extracted = extractSuggestions(rollStripped);
  const cleanResponse = extracted.clean;
  const suggestions = (type === "roll_result" || needsRoll) ? [] : extracted.suggestions;

  // When completing a roll, un-flag the deferred entries saved on the prior call.
  // Their timestamps are pushed back 2ms so they still sort before the new
  // entries pushed later in this same request.
  if (type === "roll_result") {
    const unmasked = Date.now();
    gameState.sessionLog.forEach(e => {
      if (e.rolling) { delete e.rolling; e.timestamp = unmasked - 2; }
    });
  }

  const ts = Date.now();
  const rolling = needsRoll && type !== "roll_result";
  const userEntry = { role: "user", content: userMessage, player, timestamp: ts };
  const gmEntry   = { role: "gm",   content: cleanResponse,           timestamp: ts };
  if (rolling) { userEntry.rolling = true; gmEntry.rolling = true; }
  gameState.sessionLog.push(userEntry, gmEntry);

  if (gameState.sessionLog.length > 100) {
    gameState.sessionLog = gameState.sessionLog.slice(-80); // keep the stored log (and Redis payload) bounded
  }

  // GM bracket-tag notation parsed below — full reference table in CLAUDE.md.
  // Shared: LOCATION and SCAR tags
  const matchLocationId = worldConfig.id === "manlandia"
    ? matchManlandiaLocationId
    : worldConfig.type === "custom"
      ? () => null
      : matchResonanceLocationId;

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

  let responseWorldState;

  if (worldConfig.id === "manlandia" || worldConfig.type === "custom") {
    // Villain awareness
    const villainMatch = cleanResponse.match(/\[VILLAIN AWARENESS: (\d+) → (\d+)\]/);
    if (villainMatch) gameState.worldState.villain_awareness = parseInt(villainMatch[2]);

    // Curse level
    const curseMatch = cleanResponse.match(/\[CURSE: (\d+) → (\d+)\]/);
    if (curseMatch) gameState.worldState.curse_level = parseInt(curseMatch[2]);

    // Stone found (Manlandia only)
    if (worldConfig.id === "manlandia") {
      const stoneRegex = /\[STONE FOUND: ([^\]]+)\]/g;
      let stoneMatch;
      while ((stoneMatch = stoneRegex.exec(cleanResponse)) !== null) {
        const stoneId = matchStoneId(stoneMatch[1]);
        if (stoneId) {
          if (!gameState.worldState.stones_found) gameState.worldState.stones_found = [];
          if (!gameState.worldState.stones_found.includes(stoneId)) {
            gameState.worldState.stones_found.push(stoneId);
          }
        }
      }
    }

    // Character harm: [CHARACTER N: OldHarm → NewHarm]
    const charHarmRegex = /\[CHARACTER (\d): ([A-Za-z]+) → ([A-Za-z]+)\]/g;
    let charHarmMatch;
    while ((charHarmMatch = charHarmRegex.exec(cleanResponse)) !== null) {
      const charKey = `player${charHarmMatch[1]}`;
      if (gameState.characters[charKey]) gameState.characters[charKey].harm = charHarmMatch[3];
    }

    // Ability used: [ABILITY N: used]
    const abilityUsedRegex = /\[ABILITY (\d): used\]/gi;
    let abilityUsedMatch;
    while ((abilityUsedMatch = abilityUsedRegex.exec(cleanResponse)) !== null) {
      const charKey = `player${abilityUsedMatch[1]}`;
      if (gameState.characters[charKey]) gameState.characters[charKey].ability_used = true;
    }

    responseWorldState = {
      session: gameState.session,
      villain_awareness: gameState.worldState.villain_awareness,
      curse_level: gameState.worldState.curse_level,
      ...(worldConfig.id === "manlandia" && { stones_found: gameState.worldState.stones_found || [] }),
      location: gameState.worldState.location,
      visited_locations: gameState.worldState.visited_locations || [],
      location_scars: gameState.worldState.location_scars || [],
    };
  } else {
    // Resonance-specific parsing
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

    // Ability used: [ABILITY FEN: ability_name] or [ABILITY LYRA: ability_name]
    const resAbilityRegex = /\[ABILITY (FEN|LYRA): ([a-z_]+)\]/gi;
    let raMatch;
    while ((raMatch = resAbilityRegex.exec(cleanResponse)) !== null) {
      const who     = raMatch[1].toLowerCase();
      const ability = raMatch[2].toLowerCase();
      if (who === "lyra" && ability === "magic") {
        if (gameState.characters.lyra && gameState.characters.lyra.magic_uses_remaining > 0) {
          gameState.characters.lyra.magic_uses_remaining--;
        }
      } else if (gameState.characters[who] && ability in gameState.characters[who]) {
        gameState.characters[who][ability] = true;
      }
    }

    responseWorldState = {
      session: gameState.session,
      conclave_awareness: gameState.worldState.conclave_awareness,
      fen_dissonance_awakening: gameState.worldState.fen_dissonance_awakening,
      location: gameState.worldState.location,
      visited_locations: gameState.worldState.visited_locations || [],
      location_scars: gameState.worldState.location_scars || [],
    };
  }

  await setState(key, gameState);

  return res.json({
    response: cleanResponse,
    needsRoll,
    rollStat,
    rollAdvantage,
    suggestions,
    serverTimestamp: Date.now(),
    gameState: {
      characters: gameState.characters,
      worldState: responseWorldState,
    },
  });
};
