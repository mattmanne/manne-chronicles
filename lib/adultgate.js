const { checkRateLimit } = require("./ratelimit");

// Resonance is always the "adult" built-in world; a custom campaign is adult
// only when its own worldConfig says so. Manlandia is never adult.
function isAdultWorld(worldConfig, gameState) {
  if (worldConfig.id === "resonance") return true;
  if (worldConfig.type === "custom") return gameState?.worldConfig?.adult === true;
  return false;
}

// Fails closed: if ADULT_PIN isn't configured, adult worlds stay locked rather
// than silently opening up (unlike the X-Game-Secret checks elsewhere, which
// fail open when GAME_SECRET is unset — this is deliberately stricter since
// the whole point is keeping kids out of adult content).
//
// Rate-limited on WRONG-pin attempts only, not on every call — a 4-digit PIN
// is only 10,000 combinations, and this check runs on every adult-gated
// endpoint (poll, gm, recap, state, help), not just /api/unlock, so any of
// them could otherwise be used as a cheap guessing oracle (GET /api/poll
// especially, since it's hit every ~8s by every connected client with no
// secret required at all). Counting only failures means a device that
// already has the correct pin is never throttled no matter how often it
// polls — only an actual wrong guess counts against the limit, so real usage
// is completely unaffected. Same 5-attempts-per-60s bar as /api/unlock's own
// limit, for one consistent "how hard is the pin to guess" answer everywhere
// it's checked.
async function checkAdultAccess(req, res, worldConfig, gameState) {
  if (!isAdultWorld(worldConfig, gameState)) return true;
  const pin = process.env.ADULT_PIN;
  if (pin && req.headers["x-adult-pin"] === pin) return true;

  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const withinLimit = await checkRateLimit(`ratelimit:adultpin:${ip}`, 5, 60);
  if (!withinLimit) {
    res.status(429).json({ error: "Too many attempts — please wait a moment and try again." });
    return false;
  }

  res.status(403).json({ error: "This world is locked. Unlock adult worlds first." });
  return false;
}

module.exports = { isAdultWorld, checkAdultAccess };
