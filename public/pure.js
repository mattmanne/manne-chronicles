/* ── Pure helpers, shared between the browser client (game.js) and Node tests ──
   Loaded as a plain global-scope <script> before game.js, so every function
   here stays callable exactly as before (e.g. isManlandiaLike()). Functions
   that need app-wide state accept it as an optional last argument defaulting
   to the current global — omit it in the browser, pass it explicitly in tests.
   Defaults are read through a function (not a plain default expression) so
   `typeof` can guard the ReferenceError in Node, and so the current value is
   re-read on every call instead of being captured once at script load. */

const HARM_LEVELS = ["Unhurt", "Scratched", "Hurt", "Wounded", "Broken", "Dying"];

function defaultWorld()     { return typeof currentWorld    !== "undefined" ? currentWorld    : undefined; }
function defaultPlayer()    { return typeof currentPlayer   !== "undefined" ? currentPlayer   : undefined; }
function defaultGameState() { return typeof cachedGameState !== "undefined" ? cachedGameState : undefined; }
function defaultGameTitle() { return typeof document !== "undefined" ? document.getElementById("game-title")?.textContent : undefined; }

function isManlandiaLike(world = defaultWorld()) {
  return world === "manlandia" || world.startsWith("c_");
}

function withWorld(url, world = defaultWorld()) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}world=${world}`;
}

function getPlayerDisplayName(player, gameState = defaultGameState()) {
  if (player === "fen")  return "Fen";
  if (player === "lyra") return "Lyra";
  if (player && player.startsWith("player")) {
    const n = player.slice(6);
    const name = gameState?.characters?.[player]?.name;
    return (name && name !== `Hero ${n}`) ? name : `Hero ${n}`;
  }
  return player;
}

function stripPlayerPrefix(content) {
  return (content || "").replace(/^[A-Za-z][A-Za-z0-9]*: /, "");
}

function formatRollMessage(player, stat, result, gameState = defaultGameState()) {
  const name = getPlayerDisplayName(player, gameState);
  return `${name} rolls ${stat.toUpperCase()}: ${result.die1} + ${result.die2} + (${result.modifier}) = ${result.total}`;
}

function stripGMTags(content) {
  // The model doesn't always use the exact documented tag shape (see
  // lib/gm-tags.js for the server-side parsing story) — these are display-only
  // strips, so it's safe to be broader here than the parsers that actually act
  // on a tag: an ASCII "->" alongside the Unicode arrow, and a generic
  // "[Name: Harm -> Harm]" catch-all for when the model names a hero directly
  // instead of using "CHARACTER N" (live example: "[Globak: Unhurt → Scratched]").
  const ARROW = "(?:→|->)";
  return (content || "")
    .replace(new RegExp(`\\[CONCLAVE AWARENESS: \\d+\\s*${ARROW}\\s*\\d+\\]`, "g"), "")
    .replace(new RegExp(`\\[DISSONANCE: \\d+\\s*${ARROW}\\s*\\d+\\]`, "g"), "")
    .replace(new RegExp(`\\[VILLAIN AWARENESS: \\d+\\s*${ARROW}\\s*\\d+\\]`, "g"), "")
    .replace(new RegExp(`\\[CURSE: \\d+\\s*${ARROW}\\s*\\d+\\]`, "g"), "")
    .replace(/\[STONE FOUND: [^\]]+\]/g, "")
    // Trailing [^\]]* tolerates the model appending commentary after the new
    // harm word — live: "[CHARACTER 1: Scratched → Scratched, no change]".
    // Also tolerates a "(Name)" parenthetical after the number and a literal
    // "Harm:" label before the harm word — live: "[CHARACTER 1 (Kestra):
    // Harm: Unhurt]" — matching the same padding lib/gm-tags.js now parses.
    .replace(new RegExp(`\\[CHARACTER \\d(?:\\s*\\([^)]*\\))?:\\s*(?:Harm:\\s*)?[A-Za-z]+\\s*${ARROW}\\s*[A-Za-z]+[^\\]]*\\]`, "gi"), "")
    // Also strip the arrow-less variant — live example: "[CHARACTER 1: Hurt]".
    .replace(/\[CHARACTER \d(?:\s*\([^)]*\))?:\s*(?:Harm:\s*)?[A-Za-z]+\s*\]/gi, "")
    .replace(/\[LOCATION: [^\]]+\]/g, "")
    // The prompt files' own instruction section is literally labeled
    // "LOCATION CHANGE:" (plain prose, not notation) — live (found via
    // npm run check-drift, 2026-07-19, Underseas): the model echoed that
    // label back as a bracket tag of its own, "[LOCATION CHANGE]", right
    // before the real "[LOCATION: Name]" tag. Not real notation, so
    // lib/gm-tags.js's parsers never touch it — but nothing was stripping
    // it from display either, so it leaked into the player-facing story
    // verbatim. Bare marker, no colon/content, so it needs its own strip.
    .replace(/\[LOCATION CHANGE\]/gi, "")
    .replace(/\[SCAR: [^\]]+\]/g, "")
    .replace(new RegExp(`\\[(LYRA|FEN):\\s*[A-Za-z]+\\s*${ARROW}\\s*[A-Za-z]+[^\\]]*\\]`, "gi"), "")
    // Tolerates the same "(Name)" parenthetical lib/gm-tags.js now parses —
    // live: "[ABILITY 1 (Kestra): Protect Friend used]".
    .replace(/\[ABILITY \d(?:\s*\([^)]*\))?: [^\]]*used[^\]]*\]/gi, "")
    .replace(/\[ABILITY (FEN|LYRA): [a-z_]+\]/gi, "")
    // Tolerates the model wrapping the tag in parentheses instead of
    // brackets — live (2026-07-06): "(SUGGESTIONS: a | b | c)" — matching
    // the same tolerance lib/suggestions.js's extractSuggestions() now has.
    .replace(/[[(]SUGGESTIONS:\s*[^\])]+[\])]/gi, "")
    .replace(/\[OBJECTIVE(?: COMPLETE)?: [^\]]+\]/gi, "")
    .replace(/\[CLUE(?: RESOLVED)?: [^\]]+\]/gi, "")
    .replace(/\[XP \d: \+\d+\]/gi, "")
    .replace(/\[NPC:\s*[^:\]]+:\s*[^\]]+\]/gi, "")
    // Broader than the parser on purpose (display-only, see comment above) —
    // one pattern catches [ITEM FOUND: ...], [ITEM N: ...], [ITEM FEN|LYRA:
    // ...], and the model naming a hero directly instead of a slot number,
    // same "name instead of number" tolerance CHARACTER harm needed.
    .replace(/\[ITEM [^:\]]+:\s*[^\]]+\]/gi, "")
    .replace(new RegExp(`\\[[A-Za-z]+:\\s*[A-Za-z]+\\s*${ARROW}\\s*[A-Za-z]+[^\\]]*\\]`, "g"), "").trim();
}

function getCleanText(text) {
  return stripGMTags(text).replace(/\n{3,}/g, "\n\n");
}

function extractStateChanges(text, opts = {}) {
  const { world = defaultWorld(), gameState = defaultGameState() } = opts;
  const changes = [];

  if (isManlandiaLike(world)) {
    const villain = text.match(/\[VILLAIN AWARENESS: (\d+) → (\d+)\]/);
    if (villain) changes.push({ text: `👁 Villain Awareness: ${villain[1]} → ${villain[2]}`, positive: false });
    const curse = text.match(/\[CURSE: (\d+) → (\d+)\]/);
    if (curse) changes.push({ text: `🌫 World Peril: ${curse[1]} → ${curse[2]}`, positive: false });
    if (world === "manlandia") {
      for (const m of [...text.matchAll(/\[STONE FOUND: ([^\]]+)\]/g)]) {
        changes.push({ text: `✦ Stone Found: ${m[1].trim()}`, positive: true });
      }
    }
    for (const m of [...text.matchAll(/\[CHARACTER (\d): ([A-Za-z]+) → ([A-Za-z]+)\]/g)]) {
      const worsened = HARM_LEVELS.indexOf(m[3]) > HARM_LEVELS.indexOf(m[2]);
      const name = getPlayerDisplayName(`player${m[1]}`, gameState);
      changes.push({ text: `${name}: ${m[2]} → ${m[3]}`, positive: !worsened });
    }
  } else {
    const awareness = text.match(/\[CONCLAVE AWARENESS: (\d+) → (\d+)\]/);
    if (awareness) changes.push({ text: `⚡ Conclave Awareness: ${awareness[1]} → ${awareness[2]}`, positive: false });
    const dissonance = text.match(/\[DISSONANCE: (\d+) → (\d+)\]/);
    if (dissonance) changes.push({ text: `◈ Dissonance Awakening: ${dissonance[1]} → ${dissonance[2]}`, positive: true });
    for (const m of [...text.matchAll(/\[(LYRA|FEN): ([A-Za-z]+) → ([A-Za-z]+)\]/g)]) {
      const worsened = HARM_LEVELS.indexOf(m[3]) > HARM_LEVELS.indexOf(m[2]);
      changes.push({ text: `${m[1]}: ${m[2]} → ${m[3]}`, positive: !worsened });
    }
  }

  const loc = text.match(/\[LOCATION: ([^\]]+)\]/);
  if (loc) changes.push({ text: `📍 ${loc[1].trim()}`, positive: true });
  return changes;
}

// "Real" meaning a hero that actually exists — Resonance's Lyra/Fen always
// count, but a Manlandia/custom player slot only counts once someone has
// actually created a hero there (picked an archetype), not an empty "Hero N"
// placeholder. Shared by the client's waiting-on banner and the server-side
// stall-reminder cron job (api/cron-turn-reminder.js requires this file
// directly, same dual-use pattern as every other function here) so both
// agree on exactly who counts as a real party member.
function getRealCharacterKeys(world = defaultWorld(), characters = defaultGameState()?.characters) {
  if (!world) return [];
  if (isManlandiaLike(world)) {
    return ["player1", "player2", "player3", "player4"].filter((k) => characters?.[k]?.archetype);
  }
  return ["fen", "lyra"].filter((k) => characters?.[k]);
}

// Turn order isn't enforced in this app (anyone can act anytime) — this is
// informational, not a hard gate. "Waiting on" just means "every real party
// member other than whoever went last," recomputed fresh every time from a
// single `last_actor` field rather than tracking a real turn order.
function getWaitingOn(lastActor, world = defaultWorld(), characters = defaultGameState()?.characters) {
  return getRealCharacterKeys(world, characters).filter((k) => k !== lastActor);
}

function resolveSuggestionSelection(text, suggestions) {
  if (!suggestions || !suggestions.length) return null;
  const m = (text || "").trim().match(/^#?(\d+)\.?$/);
  if (!m) return null;
  return suggestions[parseInt(m[1], 10) - 1] || null;
}

function formatCampaignExport(state, opts = {}) {
  const {
    world = defaultWorld(),
    fallbackPlayer = defaultPlayer(),
    gameTitle = defaultGameTitle(),
    gameState = defaultGameState(),
  } = opts;

  const archive   = state.worldState?.session_archive  || [];
  const summaries = state.worldState?.session_summaries || [];
  const archivedSessions = new Set(archive.map(a => a.session));
  const legacyItems = summaries
    .map((s, i) => ({ session: i + 1, summary: s, log: null }))
    .filter(s => !archivedSessions.has(s.session));
  const all = [...archive, ...legacyItems].sort((a, b) => a.session - b.session);

  const sep  = "═".repeat(44);
  const dash = "─".repeat(44);
  const title = world === "resonance" ? "RESONANCE — A LEGACY CAMPAIGN" : (gameTitle || world).toUpperCase();
  const lines = [title, sep, ""];

  for (const item of all) {
    lines.push(`SESSION ${item.session}`);
    if (item.summary) lines.push(`Summary: ${item.summary}`);
    lines.push(dash);
    if (item.log) {
      for (const e of item.log) {
        const isGM  = e.role === "gm";
        const label = isGM ? "Story" : getPlayerDisplayName(e.player || fallbackPlayer, gameState);
        const content = isGM ? stripGMTags(e.content) : stripPlayerPrefix(e.content);
        lines.push(`${label}: ${content}`, "");
      }
    } else {
      lines.push("(Full log not available for this session.)", "");
    }
    lines.push(sep, "");
  }

  if (!all.length) lines.push("No sessions archived yet.");
  return lines.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    HARM_LEVELS,
    isManlandiaLike,
    withWorld,
    getPlayerDisplayName,
    stripPlayerPrefix,
    formatRollMessage,
    stripGMTags,
    getCleanText,
    extractStateChanges,
    resolveSuggestionSelection,
    formatCampaignExport,
    getRealCharacterKeys,
    getWaitingOn,
  };
}
