const { checkRateLimit } = require("../lib/ratelimit");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { pin } = req.body || {};
  const correctPin = process.env.ADULT_PIN;

  if (!correctPin) return res.status(500).json({ error: "Not configured" });
  if (pin && String(pin).trim() === String(correctPin).trim()) {
    return res.json({ ok: true });
  }

  // A 4-digit PIN is only 10,000 combinations — with no secret required to
  // call this endpoint at all, it needs its own throttle the same way
  // api/help.js/api/recap.js already rate-limit their own no-secret-required
  // endpoints. Counted only on a WRONG guess, not every call — Matt's whole
  // family shares one home IP, so counting every attempt (even correct ones)
  // could let several people unlocking around the same time lock out the
  // rest of the household. 5 wrong guesses/60s per IP is tight enough to
  // make brute-forcing impractical while staying generous for an actual typo.
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!(await checkRateLimit(`ratelimit:unlock:${ip}`, 5, 60))) {
    return res.status(429).json({ error: "Too many attempts — please wait a moment and try again." });
  }

  return res.status(401).json({ ok: false, error: "Wrong PIN" });
};
