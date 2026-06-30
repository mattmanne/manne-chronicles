module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { pin } = req.body || {};
  const correctPin = process.env.ADULT_PIN;

  if (!correctPin) return res.status(500).json({ error: "Not configured" });
  if (!pin || String(pin).trim() !== String(correctPin).trim()) {
    return res.status(401).json({ ok: false, error: "Wrong PIN" });
  }

  return res.json({ ok: true });
};
