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
  return (content || "")
    .replace(/\[CONCLAVE AWARENESS: \d+ → \d+\]/g, "")
    .replace(/\[DISSONANCE: \d+ → \d+\]/g, "")
    .replace(/\[VILLAIN AWARENESS: \d+ → \d+\]/g, "")
    .replace(/\[CURSE: \d+ → \d+\]/g, "")
    .replace(/\[STONE FOUND: [^\]]+\]/g, "")
    .replace(/\[CHARACTER \d: [A-Za-z]+ → [A-Za-z]+\]/g, "")
    .replace(/\[LOCATION: [^\]]+\]/g, "")
    .replace(/\[SCAR: [^\]]+\]/g, "")
    .replace(/\[(LYRA|FEN): [A-Za-z]+ → [A-Za-z]+\]/g, "")
    .replace(/\[ABILITY \d: used\]/gi, "")
    .replace(/\[ABILITY (FEN|LYRA): [a-z_]+\]/gi, "")
    .replace(/\[SUGGESTIONS: [^\]]+\]/gi, "").trim();
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
    formatCampaignExport,
  };
}
