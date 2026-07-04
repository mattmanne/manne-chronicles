const { getState, setState } = require("../lib/redis");
const { selectNotifyTargets, buildStallReminderPayload } = require("../lib/push");
const { getWaitingOn } = require("../public/pure.js");
const webpush = require("web-push");

// Vercel Cron (see vercel.json's "crons" entry) hits this once a day. 48h is
// generous enough that it only ever fires on a genuine multi-day stall, not
// normal turn-taking pace in a family game.
const STALL_MS = 48 * 60 * 60 * 1000;

// One world's worth of the check — pulled out so a single world's failure
// (a malformed record, a transient Redis error) can't take the whole cron
// run down with it; see the try/catch around each call below.
async function checkWorld(worldId, key, worldDisplayName) {
  const state = await getState(key);
  if (!state?.worldState?.last_action_at) return { worldId, skipped: "no activity yet" };

  const idleMs = Date.now() - state.worldState.last_action_at;
  if (idleMs < STALL_MS) return { worldId, skipped: "not stalled" };

  // Fires once per stall, not once per day forever — a fresh action moves
  // last_action_at past this checkpoint and re-arms the reminder naturally.
  if ((state.worldState.last_reminder_sent_at || 0) >= state.worldState.last_action_at) {
    return { worldId, skipped: "already reminded for this stall" };
  }

  const waitingOn = getWaitingOn(state.worldState.last_actor, worldId, state.characters);
  if (!waitingOn.length) return { worldId, skipped: "nobody to remind" };

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return { worldId, skipped: "push not configured" };

  const pushKey = `push:${worldId}:subscriptions`;
  const subscriptions = (await getState(pushKey)) || [];
  const targets = selectNotifyTargets(subscriptions, state.worldState.last_actor);
  if (!targets.length) return { worldId, skipped: "nobody subscribed to notify" };

  webpush.setVapidDetails("mailto:mmanne@hbs.edu", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify(buildStallReminderPayload(worldDisplayName));
  const results = await Promise.allSettled(
    targets.map((t) => webpush.sendNotification({ endpoint: t.endpoint, keys: t.keys }, payload))
  );

  const deadEndpoints = results
    .map((r, i) => (r.status === "rejected" && (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) ? targets[i].endpoint : null))
    .filter(Boolean);
  if (deadEndpoints.length) {
    const remaining = subscriptions.filter((s) => !deadEndpoints.includes(s.endpoint));
    await setState(pushKey, remaining);
  }

  state.worldState.last_reminder_sent_at = Date.now();
  await setState(key, state);

  return { worldId, remindedCount: waitingOn.length, sentTo: targets.length };
}

module.exports = async function handler(req, res) {
  // Fails open if CRON_SECRET isn't set, same convention as GAME_SECRET —
  // worst case here is an extra push notification, not a data-safety risk.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["authorization"] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const worlds = [
    { worldId: "resonance", key: "resonance:gamestate", name: "Resonance" },
    { worldId: "manlandia", key: "manlandia:gamestate", name: "Manlandia" },
  ];

  const index = (await getState("campaigns:index")) || [];
  for (const c of index) {
    if (c.status === "archived") continue;
    worlds.push({ worldId: c.id, key: `campaign:${c.id}:gamestate`, name: c.name || "Your Adventure" });
  }

  const results = [];
  for (const w of worlds) {
    try {
      results.push(await checkWorld(w.worldId, w.key, w.name));
    } catch (err) {
      results.push({ worldId: w.worldId, error: err.message });
    }
  }

  return res.json({ checked: results.length, results });
};
