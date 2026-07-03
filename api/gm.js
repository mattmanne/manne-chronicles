const { getState, setState, redisCommand } = require("../lib/redis");
const { generateContent } = require("../lib/gemini");
const { getWorldConfig } = require("../lib/worldconfig");
const { STONE_IDS } = require("../lib/gamestate-manlandia");
const { extractSuggestions } = require("../lib/suggestions");
const { checkAdultAccess } = require("../lib/adultgate");
const {
  extractRoll,
  extractCounterUpdate,
  extractCharacterHarmUpdates,
  extractResonanceHarmUpdates,
  extractAbilityUsedKeys,
} = require("../lib/gm-tags");
const { selectNotifyTargets, buildNotificationPayload } = require("../lib/push");
const webpush = require("web-push");

const MAX_HISTORY = 40; // entries of context sent to the LLM per turn — bounds prompt cost; full log is still stored

// Generous upper bound on how long a single Groq round trip (including our
// own one retry) should ever take — if a lock is somehow never released
// (a crashed invocation), it self-clears instead of wedging a world forever.
const GM_LOCK_TTL_MS = 20000;

// True concurrency guard, not a fixed cooldown: two players in the same
// world submitting within the same instant can both hit Groq at once and
// trip its shared per-account rate limit. This only blocks a second call
// while a FIRST call to Groq for this exact world is still in flight, so a
// single fast player (Groq often responds in ~1s) is never blocked from
// immediately taking their next turn — the lock is already released by
// the time their next submission arrives. A roll_result is the second half
// of one player's own turn (the dice can't even be rolled until the first
// call returns), so it's exempt — never a new/competing submission.
async function acquireGmLock(worldId) {
  const result = await redisCommand("SET", `gmlock:${worldId}`, "1", "NX", "PX", GM_LOCK_TTL_MS);
  return result === "OK";
}
async function releaseGmLock(worldId) {
  await redisCommand("DEL", `gmlock:${worldId}`).catch(() => {});
}

// Groq tells us how long it actually wants us to wait (via a Retry-After
// header or "try again in X.Xs" in its own error text — see lib/gemini.js).
// Below 5 seconds that precision doesn't help a human, so just say "a few
// seconds". Above that, a daily/hourly quota (not just a per-minute burst)
// can report a wait in the thousands of seconds — live example: 3750s —
// so scale the unit instead of ever printing a raw seconds count that big.
function formatWaitMessage(retryAfterSeconds) {
  const seconds = typeof retryAfterSeconds === "number" && !Number.isNaN(retryAfterSeconds)
    ? Math.ceil(retryAfterSeconds)
    : null;
  if (seconds === null || seconds < 5) return "wait a few seconds";
  if (seconds < 60) return `wait about ${seconds} seconds`;
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `wait about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.round(seconds / 3600);
  return `wait about ${hours} hour${hours === 1 ? "" : "s"}`;
}

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

// GM bracket-tag notation, applied to gameState — full reference table in
// CLAUDE.md. Deliberately NOT called while a roll is pending (see the
// `rolling` handling in the handler below): a turn that asks for a roll
// describes events that haven't been confirmed yet, so applying its tags
// immediately would let world state (location, harm, curse level, etc.)
// silently advance even if the roll is never actually completed — this is
// exactly what happened to a real live Manlandia turn that got interrupted
// mid-roll and stayed invisibly stuck. Deferred tags are applied later, once
// the matching roll_result comes back, by re-running this same function
// against the original stored entry content.
function applyStateTags(cleanResponse, gameState, worldConfig, matchLocationId) {
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

  if (worldConfig.id === "manlandia" || worldConfig.type === "custom") {
    const villainUpdate = extractCounterUpdate(cleanResponse, "VILLAIN AWARENESS");
    if (villainUpdate !== null) gameState.worldState.villain_awareness = villainUpdate;

    const curseUpdate = extractCounterUpdate(cleanResponse, "CURSE");
    if (curseUpdate !== null) gameState.worldState.curse_level = curseUpdate;

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

    for (const { key, harm } of extractCharacterHarmUpdates(cleanResponse, gameState.characters)) {
      gameState.characters[key].harm = harm;
    }

    for (const key of extractAbilityUsedKeys(cleanResponse, gameState.characters)) {
      gameState.characters[key].ability_used = true;
    }
  } else {
    const awarenessUpdate = extractCounterUpdate(cleanResponse, "CONCLAVE AWARENESS");
    if (awarenessUpdate !== null) gameState.worldState.conclave_awareness = awarenessUpdate;

    const dissonanceUpdate = extractCounterUpdate(cleanResponse, "DISSONANCE");
    if (dissonanceUpdate !== null) gameState.worldState.fen_dissonance_awakening = dissonanceUpdate;

    for (const { key, harm } of extractResonanceHarmUpdates(cleanResponse)) {
      if (gameState.characters[key]) gameState.characters[key].harm = harm;
    }

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
  }
}

// Never lets a push failure break the actual GM response — this is
// best-effort. Skips entirely (not an error) if VAPID isn't configured yet,
// or if nobody else is subscribed to this world.
async function sendTurnNotifications(worldConfig, gameState, senderPlayer, senderDisplayName) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const pushKey = `push:${worldConfig.id}:subscriptions`;
    const subscriptions = (await getState(pushKey)) || [];
    const targets = selectNotifyTargets(subscriptions, senderPlayer);
    if (!targets.length) return;

    webpush.setVapidDetails("mailto:mmanne@hbs.edu", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const worldDisplayName = worldConfig.id === "resonance" ? "Resonance"
      : worldConfig.id === "manlandia" ? "Manlandia"
      : (gameState.worldConfig?.name || "Your Adventure");
    const payload = JSON.stringify(buildNotificationPayload(worldDisplayName, senderDisplayName));

    const results = await Promise.allSettled(
      targets.map((t) => webpush.sendNotification({ endpoint: t.endpoint, keys: t.keys }, payload))
    );

    // A 404/410 means the push service considers that subscription gone for
    // good (uninstalled, permission revoked, etc.) — clean it up.
    const deadEndpoints = results
      .map((r, i) => (r.status === "rejected" && (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) ? targets[i].endpoint : null))
      .filter(Boolean);
    if (deadEndpoints.length) {
      const remaining = subscriptions.filter((s) => !deadEndpoints.includes(s.endpoint));
      await setState(pushKey, remaining);
    }
  } catch (err) {
    console.error("Push notification error:", err);
  }
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

  const needsLock = type !== "roll_result";
  if (needsLock && !(await acquireGmLock(worldConfig.id))) {
    return res.status(429).json({ error: `Another turn just came in for this world — ${formatWaitMessage(null)} and try again.` });
  }

  let gmResponse;
  try {
    gmResponse = await generateContent(systemPrompt, history, userMessage);
  } catch (err) {
    console.error("GM error:", err);
    if (needsLock) await releaseGmLock(worldConfig.id);
    if (err.status === 429) {
      return res.status(429).json({ error: `The GM is handling a lot of requests right now — ${formatWaitMessage(err.retryAfterSeconds)} and try again.` });
    }
    return res.status(500).json({ error: "The GM encountered an error: " + err.message });
  }
  if (needsLock) await releaseGmLock(worldConfig.id);

  const { clean: rollStripped, needsRoll, rollStat, rollAdvantage } = extractRoll(gmResponse);
  const extracted = extractSuggestions(rollStripped);
  const cleanResponse = extracted.clean;
  const suggestions = (type === "roll_result" || needsRoll) ? [] : extracted.suggestions;

  const matchLocationId = worldConfig.id === "manlandia"
    ? matchManlandiaLocationId
    : worldConfig.type === "custom"
      ? () => null
      : matchResonanceLocationId;

  // When completing a roll, un-flag the deferred entries saved on the prior
  // call, and only now apply the state tags their narration carried (see
  // applyStateTags' comment for why this was deferred rather than applied
  // when the roll was first requested). Their timestamps are pushed back 2ms
  // so they still sort before the new entries pushed later in this same call.
  if (type === "roll_result") {
    const deferredEntries = gameState.sessionLog.filter(e => e.role === "gm" && e.rolling);
    const unmasked = Date.now();
    gameState.sessionLog.forEach(e => {
      if (e.rolling) { delete e.rolling; e.timestamp = unmasked - 2; }
    });
    for (const entry of deferredEntries) {
      applyStateTags(entry.content, gameState, worldConfig, matchLocationId);
    }
  }

  const ts = Date.now();
  const rolling = needsRoll && type !== "roll_result";
  const userEntry = { role: "user", content: userMessage, player, timestamp: ts };
  const gmEntry   = { role: "gm",   content: cleanResponse,           timestamp: ts };
  if (rolling) {
    userEntry.rolling = true;
    gmEntry.rolling = true;
    // Persisted so a dropped/interrupted roll can be recovered from a later
    // poll instead of vanishing — see api/poll.js's pendingRoll.
    gmEntry.rollStat = rollStat;
    gmEntry.rollAdvantage = rollAdvantage;
  }
  gameState.sessionLog.push(userEntry, gmEntry);

  if (gameState.sessionLog.length > 100) {
    gameState.sessionLog = gameState.sessionLog.slice(-80); // keep the stored log (and Redis payload) bounded
  }

  // Apply this turn's own state tags now, unless it's itself asking for a
  // roll — those are deferred until the matching roll_result comes back.
  if (!rolling) applyStateTags(cleanResponse, gameState, worldConfig, matchLocationId);

  let responseWorldState;
  if (worldConfig.id === "manlandia" || worldConfig.type === "custom") {
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

  // Only notify once the turn is fully resolved — while `rolling` is true the
  // entries are hidden from /api/poll, so a notification now would send the
  // other player to content they can't see yet.
  if (!rolling) {
    const senderDisplayName = gameState.characters[player]?.name || playerLabel;
    await sendTurnNotifications(worldConfig, gameState, player, senderDisplayName);
  }

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
