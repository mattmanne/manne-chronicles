// Groq sends a `Retry-After` header on 429s, and/or a "Please try again in
// 3.6s" clause in the error message itself — prefer the header (it's the
// more standard, reliably-numeric source) and fall back to parsing the text.
function parseRetryAfterSeconds(res, message) {
  const header = res.headers?.get?.("retry-after");
  if (header !== undefined && header !== null && !Number.isNaN(Number(header))) return Number(header);
  const match = /try again in ([\d.]+)\s*s/i.exec(message || "");
  return match ? Number(match[1]) : null;
}

async function callGroq(systemPrompt, history, userMessage) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
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
    return await callGroq(systemPrompt, history, userMessage);
  } catch (err) {
    if (err.status !== 429) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await callGroq(systemPrompt, history, userMessage);
  }
}

module.exports = { generateContent };
