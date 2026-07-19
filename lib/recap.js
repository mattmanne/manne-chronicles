const MAX_HISTORY = 40;

function formatEntry(entry) {
  if (entry.role === "gm") return `GM: ${entry.content}`;
  return `${entry.player || "Player"}: ${entry.content}`;
}

function formatTranscript(gameState) {
  const log = gameState.sessionLog || [];
  if (log.length > 0) {
    return log.slice(-MAX_HISTORY).map(formatEntry).join("\n");
  }

  const archive = gameState.worldState?.session_archive || [];
  if (archive.length > 0) {
    const last = archive[archive.length - 1];
    if (last.log && last.log.length) {
      return last.log.slice(-MAX_HISTORY).map(formatEntry).join("\n");
    }
    return last.summary || "";
  }

  return "";
}

function buildRecapSystemPrompt(isKidWorld) {
  return `You are summarizing a tabletop RPG session for a player who is picking the story back up after a break.

Write this recap in third person, using each character's actual name (e.g. "Fen crept through the tunnel while Lyra kept watch from the rooftop") — never address the reader as "you" or write from inside one character's head. It needs to make sense to any player at the table regardless of which character they play, so don't privilege one character's perspective over another's.

Read the transcript below and write a warm, exciting recap of what happened — 4 to 6 sentences, past tense, plain prose. ${isKidWorld ? "Use simple words a child aged 8 can understand. " : ""}Do not use game mechanics jargon, dice talk, or bracketed notation. Do not invent events that aren't in the transcript. If the transcript is empty, say the adventure hasn't begun yet.`;
}

module.exports = { formatTranscript, buildRecapSystemPrompt };
