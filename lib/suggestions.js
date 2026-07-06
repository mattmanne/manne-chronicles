// The documented format is square brackets, but the model has been seen
// live (twice, in this app's own 2026-07-06 deployment-verification calls)
// wrapping the tag in parentheses instead — "(SUGGESTIONS: a | b | c)" — the
// original bracket-only regex silently dropped it entirely, leaving
// `suggestions: []` even though the model clearly intended a discrete-choice
// list. Tolerates either bracket type on either side (not required to
// match), same "ship simple, harden from real transcripts" posture as every
// other tag in this app.
const SUGGESTIONS_TAG = /[[(]SUGGESTIONS:\s*([^\])]+)[\])]/i;

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
