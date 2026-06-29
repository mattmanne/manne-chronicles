async function generateContent(systemPrompt, history, userMessage) {
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
  if (data.error) throw new Error("Groq error: " + data.error.message);
  return data.choices?.[0]?.message?.content ?? "";
}

module.exports = { generateContent };
