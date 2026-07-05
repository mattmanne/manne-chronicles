// Genuinely identical across all three prompt files (unlike per-world flavor
// text, which stays deliberately separate — see each prompt file's own
// comments) — extracted here once these started drifting as byte-for-byte
// copies during independent feature sessions.

// A short, parent-set list of facts the GM must never contradict — set once
// via the UI, not derived from play. Kept separate from session summaries
// (which are auto-generated) since this is deliberately curated continuity
// the model has otherwise been shown to forget or contradict once it's
// outside the last ~40 log entries of context.
function buildAuthorNoteBlock(ws) {
  return ws.author_note ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUTHOR'S NOTE — always true, never contradict
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ws.author_note}
` : "";
}

// Player-flagged "don't lose this" details (a name, a lie, a promise) —
// pinned mid-scene rather than hoping they survive the ~40-entry history
// window or waiting for a parent to go edit the Author's Note. Same
// never-contradict framing as the note above, just player- instead of
// parent-curated.
function buildPinnedNotesBlock(ws) {
  return (ws.pinned_notes && ws.pinned_notes.length) ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMEMBERED MOMENTS — flagged by a player as important, don't lose these
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ws.pinned_notes.map(n => `- ${n.text}`).join("\n")}
` : "";
}

module.exports = { buildAuthorNoteBlock, buildPinnedNotesBlock };
