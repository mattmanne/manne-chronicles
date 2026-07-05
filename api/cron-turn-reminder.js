const { getState, setState } = require("../lib/redis");
const { selectNotifyTargets, buildStallReminderPayload, buildAmbientPayload } = require("../lib/push");
const { getWaitingOn } = require("../public/pure.js");
const { getWorldConfig } = require("../lib/worldconfig");
const { buildAmbientPrompt, AMBIENT_TRIGGER } = require("../lib/livingworld");
const { generateContent } = require("../lib/gemini");
const webpush = require("web-push");

// Vercel Cron (see vercel.json's "crons" entry) hits this once a day. 48h is
// generous enough that it only ever fires on a genuine multi-day stall, not
// normal turn-taking pace in a family game.
const STALL_MS = 48 * 60 * 60 * 1000;

// The Living World's ambient "meanwhile..." beat fires at a longer stall
// than the plain turn-stall reminder — it's the richer next tier of
// staleness, not a duplicate ping at the same moment. See checkAmbient()'s
// "don't also send the plain reminder" handling below.
const AMBIENT_MS = 72 * 60 * 60 * 1000;

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

// The Living World: an ambient "meanwhile..." beat for a world stalled even
// longer than the plain reminder threshold. Deliberately flavor-only — the
// system prompt (lib/livingworld.js) never teaches the model any bracket-tag
// notation at all, and this function never calls applyStateTags() on the
// result, so state-mutation is structurally impossible here, not just
// discouraged. Returns `sent: true` only when a beat was actually generated
// and stored, so the caller knows not to also fire the plain reminder below.
async function checkAmbient(worldId, key, worldDisplayName) {
  const state = await getState(key);
  if (!state?.worldState?.last_action_at) return { worldId, sent: false, skipped: "no activity yet" };

  const idleMs = Date.now() - state.worldState.last_action_at;
  if (idleMs < AMBIENT_MS) return { worldId, sent: false, skipped: "not stalled long enough for an ambient beat" };

  // Fires once per stall, same checkpoint pattern as the plain reminder.
  if ((state.worldState.last_ambient_sent_at || 0) >= state.worldState.last_action_at) {
    return { worldId, sent: false, skipped: "already sent an ambient beat for this stall" };
  }

  let text;
  try {
    const worldConfig = getWorldConfig(worldId);
    const prompt = buildAmbientPrompt(worldConfig, state);
    const recentLog = (state.sessionLog || []).slice(-10).map((entry) => ({
      role: entry.role === "gm" ? "assistant" : "user",
      content: entry.content,
    }));
    text = await generateContent(prompt, recentLog, AMBIENT_TRIGGER);
    if (!text || !text.trim()) return { worldId, sent: false, skipped: "empty ambient response" };
  } catch (err) {
    return { worldId, sent: false, skipped: "ambient generation failed: " + err.message };
  }

  if (!state.sessionLog) state.sessionLog = [];
  state.sessionLog.push({ role: "gm", content: text.trim(), ambient: true, timestamp: Date.now() });
  state.worldState.last_ambient_sent_at = Date.now();
  await setState(key, state);

  // Push is best-effort from here — a failure must never undo the ambient
  // beat that's already been generated and stored above.
  let sentTo = 0;
  try {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      const pushKey = `push:${worldId}:subscriptions`;
      const subscriptions = (await getState(pushKey)) || [];
      // No single "sender" for an ambient beat — everyone subscribed gets it.
      const targets = selectNotifyTargets(subscriptions, null);
      if (targets.length) {
        webpush.setVapidDetails("mailto:mmanne@hbs.edu", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
        const payload = JSON.stringify(buildAmbientPayload(worldDisplayName));
        const results = await Promise.allSettled(
          targets.map((t) => webpush.sendNotification({ endpoint: t.endpoint, keys: t.keys }, payload))
        );
        sentTo = results.filter((r) => r.status === "fulfilled").length;
        const deadEndpoints = results
          .map((r, i) => (r.status === "rejected" && (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) ? targets[i].endpoint : null))
          .filter(Boolean);
        if (deadEndpoints.length) {
          const remaining = subscriptions.filter((s) => !deadEndpoints.includes(s.endpoint));
          await setState(pushKey, remaining);
        }
      }
    }
  } catch (_) { /* best-effort — the ambient beat itself already stuck */ }

  return { worldId, sent: true, sentTo };
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
      const ambientResult = await checkAmbient(w.worldId, w.key, w.name);
      if (ambientResult.sent) {
        // An ambient beat already covers "the world moved" for this stall —
        // don't also send the plain "your turn is waiting" nudge this run.
        results.push(ambientResult);
        continue;
      }
      results.push(await checkWorld(w.worldId, w.key, w.name));
    } catch (err) {
      results.push({ worldId: w.worldId, error: err.message });
    }
  }

  return res.json({ checked: results.length, results });
};
