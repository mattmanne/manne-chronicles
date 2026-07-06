const { getState } = require("../lib/redis");
const { getWorldConfig, buildWorldStatePayload } = require("../lib/worldconfig");
const { checkAdultAccess } = require("../lib/adultgate");

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Adult-Pin");
  if (req.method === "OPTIONS") return res.status(200).end();

  const worldConfig = getWorldConfig(req.query.world);
  const { key, getInitialState } = worldConfig;

  const state = (await getState(key)) || getInitialState();
  if (!(await checkAdultAccess(req, res, worldConfig, state))) return;

  const since = parseInt(req.query.since || "0");
  // `player` identifies who's currently viewing — used only to filter out
  // another character's private_to entries (see "Solo/private scenes" in
  // CLAUDE.md). No `player` param at all hides every private entry (the
  // safe default when nobody's identified as the viewer) — harmless for
  // every world/entry that never sets private_to in the first place, which
  // is everything except an active Resonance private scene.
  const viewer = req.query.player;
  const newEntries = state.sessionLog.filter((e) =>
    e.timestamp > since && !e.rolling && (!e.private_to || e.private_to === viewer)
  );

  // A roll that never resolved (client closed/dropped mid-flight before it
  // could submit the roll_result) leaves its entries hidden here forever
  // with no other path back to them — the dice UI only ever shows as a
  // direct reaction to the original POST /api/gm response. Surface it so a
  // later poll (e.g. reopening the app) can resume it. Only ever the very
  // last entry: if a newer turn has since been added, the game has already
  // moved past that stuck roll and it shouldn't resurface. Also gated on
  // `rollStat` being present so pre-existing stuck entries from before this
  // field was added (e.g. a real one sitting in Manlandia's live log as of
  // 2026-07) are never retroactively resurrected by this check.
  let pendingRoll = null;
  const lastEntry = state.sessionLog[state.sessionLog.length - 1];
  if (lastEntry && lastEntry.role === "gm" && lastEntry.rolling && lastEntry.rollStat) {
    // rollPlayer is the authoritative "who's actually rolling" — set
    // directly on the GM entry since api/gm.js knows it either way (from an
    // explicit in-text attribution, or the single submitter). The preceding
    // user entry's own .player is only a fallback for entries saved before
    // this field existed, and only reliable there because a merged turn
    // (more than one user entry ahead of the GM entry) didn't exist yet either.
    const userEntry = state.sessionLog[state.sessionLog.length - 2];
    pendingRoll = { stat: lastEntry.rollStat, advantage: !!lastEntry.rollAdvantage, player: lastEntry.rollPlayer || userEntry?.player || null };
  }

  const worldStatePayload = buildWorldStatePayload(worldConfig, state);

  return res.json({
    entries: newEntries,
    characters: state.characters,
    worldState: worldStatePayload,
    pendingRoll,
  });
};
