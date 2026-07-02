// Groq sends a `Retry-After` header on 429s, and/or a "Please try again in
// 3.6s" clause in the error message itself — prefer the header (it's the
// more standard, reliably-numeric source) and fall back to parsing the text.
function parseRetryAfterSeconds(res, message) {
  const header = res.headers?.get?.("retry-after");
  if (header !== undefined && header !== null && !Number.isNaN(Number(header))) return Number(header);
  const match = /try again in ([\d.]+)\s*s/i.exec(message || "");
  return match ? Number(match[1]) : null;
}

const PRIMARY_MODEL  = "llama-3.3-70b-versatile";
// Smaller model, separate rate-limit bucket on the same Groq account — used
// only when the primary model's own quota is genuinely exhausted (not a
// transient spike), so play can continue at slightly lower narrative quality
// instead of hard-stopping for the primary's full cooldown window.
const FALLBACK_MODEL = "llama-3.1-8b-instant";

async function callGroq(model, systemPrompt, history, userMessage) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage },
      ],
      max_tokens: 1024,
      temperature: 0.9,
    }),
  });

  const data = await res.json();
  if (data.error) {
    const err = new Error("Groq error: " + data.error.message);
    err.status = res.status;
    err.code = data.error.code;
    if (res.status === 429) err.retryAfterSeconds = parseRetryAfterSeconds(res, data.error.message);
    throw err;
  }
  return data.choices?.[0]?.message?.content ?? "";
}

// Groq's per-model rate limits are shared across every campaign hitting this
// one API key, so a burst of turns (including from other worlds) can trip a
// transient 429. Most clear within a second or two, so one short retry turns
// a real outage into a barely-noticeable delay instead of a failed turn.
async function generateContent(systemPrompt, history, userMessage) {
  try {
    return await callGroq(PRIMARY_MODEL, systemPrompt, history, userMessage);
  } catch (err) {
    if (err.status !== 429) throw err;
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return await callGroq(PRIMARY_MODEL, systemPrompt, history, userMessage);
    } catch (retryErr) {
      if (retryErr.status !== 429) throw retryErr;
      // Still 429 after the retry — this is the primary model's real quota,
      // not a blip. Fall back to a model with its own separate bucket.
      try {
        return await callGroq(FALLBACK_MODEL, systemPrompt, history, userMessage);
      } catch (_fallbackErr) {
        // Whatever went wrong with the fallback (also rate-limited, model
        // renamed, etc.), the primary's 429 — with its known retry-after —
        // is the clearer error to surface than a confusing fallback failure.
        retryErr.fallbackDebug = _fallbackErr.message + " | status=" + _fallbackErr.status; // TEMP DEBUG
        throw retryErr;
      }
    }
  }
}

module.exports = { generateContent };
