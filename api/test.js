module.exports = async function handler(req, res) {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasRedisUrl = !!process.env.UPSTASH_REDIS_REST_URL;
  const hasRedisToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
  return res.json({
    ok: true,
    env: { hasGemini, hasRedisUrl, hasRedisToken }
  });
};
