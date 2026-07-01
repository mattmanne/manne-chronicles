const { redisCommand } = require("./redis");

// Fixed-window counter: the first request in a window creates the key and
// sets its TTL; later requests in the same window just increment. Once the
// TTL expires, the next request starts a fresh window. Good enough to stop
// an abuse loop against a paid LLM endpoint — not meant to be precise.
async function checkRateLimit(key, limit, windowSeconds) {
  const count = await redisCommand("INCR", key);
  if (count === 1) {
    await redisCommand("EXPIRE", key, windowSeconds);
  }
  return count <= limit;
}

module.exports = { checkRateLimit };
