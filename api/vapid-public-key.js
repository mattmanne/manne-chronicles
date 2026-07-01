module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return res.status(500).json({ error: "Push notifications aren't configured yet." });

  return res.json({ publicKey });
};
