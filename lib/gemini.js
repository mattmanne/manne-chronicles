const MODEL = "gemini-2.0-flash-lite";

async function generateContent(systemPrompt, history, userMessage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const contents = [
    ...history,
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 1024,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.error) throw new Error("Gemini error: " + data.error.message);

  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

module.exports = { generateContent };
