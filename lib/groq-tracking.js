const { redisCommand } = require("./redis");

// Observability only — how often a turn actually fails because Groq's quota
// is exhausted (primary model 429s, the one retry also 429s, and the
// fallback model fails too — see lib/gemini.js), not every transient blip
// that self-resolves via retry/fallback. Recorded once per player-visible
// failure, from api/gm.js's catch block.
const EVENTS_KEY = "groq:ratelimit:events";
const TOTAL_KEY = "groq:ratelimit:total_count";
const MAX_EVENTS = 500; // bounded history for frequency stats — see getRateLimitStats()

// Best-effort, same as push notifications elsewhere in this app — a
// tracking write failing must never affect the real error response already
// on its way back to the player.
async function recordRateLimitHit(worldId) {
  try {
    await redisCommand("LPUSH", EVENTS_KEY, JSON.stringify({ ts: Date.now(), world: worldId }));
    await redisCommand("LTRIM", EVENTS_KEY, 0, MAX_EVENTS - 1);
    await redisCommand("INCR", TOTAL_KEY);
  } catch (_) { /* diagnostic only */ }
}

async function getRateLimitStats() {
  const [rawEvents, totalRaw] = await Promise.all([
    redisCommand("LRANGE", EVENTS_KEY, 0, MAX_EVENTS - 1),
    redisCommand("GET", TOTAL_KEY),
  ]);
  const events = (rawEvents || [])
    .map((raw) => { try { return JSON.parse(raw); } catch (_) { return null; } })
    .filter(Boolean);

  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const last24h = events.filter((e) => now - e.ts <= 24 * HOUR).length;
  const last7d = events.filter((e) => now - e.ts <= 7 * 24 * HOUR).length;

  const byWorld = {};
  for (const e of events) byWorld[e.world] = (byWorld[e.world] || 0) + 1;

  return {
    totalAllTime: Number(totalRaw) || 0,
    // LPUSH puts the newest event at index 0, so events[] is newest-first —
    // recentEventsTracked can be less than totalAllTime once the list has
    // been trimmed past MAX_EVENTS.
    recentEventsTracked: events.length,
    last24h,
    last7d,
    lastHitAt: events[0]?.ts || null,
    byWorld,
  };
}

module.exports = { recordRateLimitHit, getRateLimitStats };
