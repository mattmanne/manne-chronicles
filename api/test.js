module.exports = async function handler(req, res) {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasRedisUrl = !!process.env.UPSTASH_REDIS_REST_URL;
  const hasRedisToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;

  let redisTest = null;
  try {
    const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["PING"]),
    });
    redisTest = await response.json();
  } catch (err) {
    redisTest = { error: err.message };
  }

  let stateTest = null;
  try {
    const { getState } = require("../lib/redis");
    stateTest = await getState("resonance:gamestate");
    stateTest = stateTest ? "found" : "empty (ok)";
  } catch (err) {
    stateTest = { error: err.message };
  }

  return res.json({
    ok: true,
    env: { hasGemini, hasRedisUrl, hasRedisToken },
    redisTest,
    stateTest,
  });
};
