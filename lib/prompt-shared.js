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

// Combat status — universal shape across all world types (see CLAUDE.md's
// "Combat" section). Added 2026-07-06 after a live playtest found combat
// tags frequently drifting out of sync with narration (an enemy narrated as
// defeated stayed "Unhurt, not defeated" in state) or never firing at all
// despite an unambiguous physical fight. Character harm was always echoed
// back to the model every turn via charLine() — enemy harm/defeat never
// was, so the model had no persistent reminder of what it still owed the
// tracker. This closes that gap the same way charLine() already does for
// heroes: show the current tracked state back every turn so drift has
// something to be checked against, not eliminating the risk (still a
// prompt-adherence problem at its core) but giving the model a fighting
// chance to self-correct.
function buildCombatStatusBlock(ws) {
  const combat = ws.combat;
  if (!combat || !combat.active) {
    return `
Combat: No active fight right now. If a real physical clash breaks out — weapons drawn, blows landing, not just tension or danger — add [COMBAT START: ...] before narrating any hits.`;
  }
  const enemyLines = combat.enemies.length
    ? combat.enemies.map((e) => `  - ${e.name}: ${e.defeated ? "Defeated" : e.harm}`).join("\n")
    : "  (no enemies tracked yet — this shouldn't happen if COMBAT START included them)";
  return `
Combat: ACTIVE (round ${combat.round}) — this is what the tracker currently shows. Keep it in sync with your narration every single exchange: if you narrate an enemy taking a hit or going down, you MUST also update it below via [ENEMY: Name: OldHarm → NewHarm] or [ENEMY DEFEATED: Name] in that same response, or the tracker silently falls behind what the players just read.
${enemyLines}`;
}

module.exports = { buildAuthorNoteBlock, buildPinnedNotesBlock, buildCombatStatusBlock };
