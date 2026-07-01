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
function checkAdultAccess(req, res, worldConfig, gameState) {
  if (!isAdultWorld(worldConfig, gameState)) return true;
  const pin = process.env.ADULT_PIN;
  if (!pin || req.headers["x-adult-pin"] !== pin) {
    res.status(403).json({ error: "This world is locked. Unlock adult worlds first." });
    return false;
  }
  return true;
}

module.exports = { isAdultWorld, checkAdultAccess };
