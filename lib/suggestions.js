const SUGGESTIONS_TAG = /\[SUGGESTIONS:\s*([^\]]+)\]/i;

function extractSuggestions(rawText) {
  const match = rawText.match(SUGGESTIONS_TAG);
  if (!match) return { clean: rawText, suggestions: [] };

  const suggestions = match[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  const clean = rawText.replace(SUGGESTIONS_TAG, "").trim();
  return { clean, suggestions };
}

module.exports = { extractSuggestions };
