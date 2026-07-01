const URL  = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(...args) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (data.error) throw new Error("Redis error: " + data.error);
  return data.result;
}

async function getState(key) {
  const result = await redisCommand("GET", key);
  return result ? JSON.parse(result) : null;
}

async function setState(key, value) {
  await redisCommand("SET", key, JSON.stringify(value));
}

module.exports = { getState, setState, redisCommand };
