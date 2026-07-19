const { getState, setState, redisCommand } = require("../lib/redis");
const { generateContent } = require("../lib/gemini");
const { getWorldConfig, buildWorldStatePayload } = require("../lib/worldconfig");
const { extractRoll } = require("../lib/gm-tags");
const { extractSuggestions } = require("../lib/suggestions");
const { checkAdultAccess } = require("../lib/adultgate");
const { getRealCharacterKeys, getPlayerDisplayName } = require("../public/pure.js");
const {
  matchResonanceLocationId,
  matchManlandiaLocationId,
  matchCustomLocationId,
  applyStateTags,
} = require("../lib/apply-state-tags");
const { selectNotifyTargets, buildNotificationPayload } = require("../lib/push");
const { recordRateLimitHit } = require("../lib/groq-tracking");
const webpush = require("web-push");

const MAX_HISTORY = 40; // entries of context sent to the LLM per turn — bounds prompt cost; full log is still stored

// Generous upper bound on how long a single Groq round trip (including our
// own one retry) should ever take — if a lock is somehow never released
// (a crashed invocation), it self-clears instead of wedging a world forever.
const GM_LOCK_TTL_MS = 20000;

// True concurrency guard, not a fixed cooldown: two players in the same
// world submitting within the same instant can both hit Groq at once and
// trip its shared per-account rate limit. This only blocks a second call
// while a FIRST call to Groq for this exact world is still in flight, so a
// single fast player (Groq often responds in ~1s) is never blocked from
// immediately taking their next turn — the lock is already released by
// the time their next submission arrives. Every submission type takes this
// lock, including roll_result — it was exempt once, on the assumption a
// roll_result could never be a competing submission, but that broke when
// the same player had the game open on two devices at once (confirmed
// live: duplicate "double roll" story entries from two near-simultaneous
// roll_result calls for the same pending roll). See the stillPending check
// in the handler for the complementary case of a delayed (not concurrent)
// duplicate arriving after the lock's already been released.
async function acquireGmLock(worldId) {
  const result = await redisCommand("SET", `gmlock:${worldId}`, "1", "NX", "PX", GM_LOCK_TTL_MS);
  return result === "OK";
}
async function releaseGmLock(worldId) {
  await redisCommand("DEL", `gmlock:${worldId}`).catch(() => {});
}

// Groq tells us how long it actually wants us to wait (via a Retry-After
// header or "try again in X.Xs" in its own error text — see lib/gemini.js).
// Below 5 seconds that precision doesn't help a human, so just say "a few
// seconds". Above that, a daily/hourly quota (not just a per-minute burst)
// can report a wait in the thousands of seconds — live example: 3750s —
// so scale the unit instead of ever printing a raw seconds count that big.
function formatWaitMessage(retryAfterSeconds) {
  const seconds = typeof retryAfterSeconds === "number" && !Number.isNaN(retryAfterSeconds)
    ? Math.ceil(retryAfterSeconds)
    : null;
  if (seconds === null || seconds < 5) return "wait a few seconds";
  if (seconds < 60) return `wait about ${seconds} seconds`;
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `wait about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.round(seconds / 3600);
  return `wait about ${hours} hour${hours === 1 ? "" : "s"}`;
}

// Never lets a push failure break the actual GM response — this is
// best-effort. Skips entirely (not an error) if VAPID isn't configured yet,
// or if nobody else is subscribed to this world. senderPlayers is an array —
// a merged multi-character turn has more than one contributor, all of whom
// already know what just happened and shouldn't be notified about it.
async function sendTurnNotifications(worldConfig, gameState, senderPlayers, senderDisplayName) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const pushKey = `push:${worldConfig.id}:subscriptions`;
    const subscriptions = (await getState(pushKey)) || [];
    const targets = selectNotifyTargets(subscriptions, senderPlayers);
    if (!targets.length) return;

    webpush.setVapidDetails("mailto:mmanne@hbs.edu", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const worldDisplayName = worldConfig.id === "resonance" ? "Resonance"
      : worldConfig.id === "manlandia" ? "Manlandia"
      : (gameState.worldConfig?.name || "Your Adventure");
    const payload = JSON.stringify(buildNotificationPayload(worldDisplayName, senderDisplayName));

    const results = await Promise.allSettled(
      targets.map((t) => webpush.sendNotification({ endpoint: t.endpoint, keys: t.keys }, payload))
    );

    // A 404/410 means the push service considers that subscription gone for
    // good (uninstalled, permission revoked, etc.) — clean it up.
    const deadEndpoints = results
      .map((r, i) => (r.status === "rejected" && (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) ? targets[i].endpoint : null))
      .filter(Boolean);
    if (deadEndpoints.length) {
      const remaining = subscriptions.filter((s) => !deadEndpoints.includes(s.endpoint));
      await setState(pushKey, remaining);
    }
  } catch (err) {
    console.error("Push notification error:", err);
  }
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Secret, X-Adult-Pin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const gameSecret = process.env.GAME_SECRET;
  if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const worldConfig = getWorldConfig(req.query.world);
  const { key, getInitialState, buildSystemPrompt } = worldConfig;

  const { player, message, type, tone, private: isPrivate } = req.body;
  if (!player || !message) return res.status(400).json({ error: "Missing player or message" });
  if (message.length > 1000) return res.status(400).json({ error: "Message too long" });
  // Solo/private scenes are Resonance-specific (its fixed two-character
  // shape is what makes "my partner isn't in the room" meaningful) — a
  // stray `private: true` from any other world type is just ignored rather
  // than erroring, same tolerance every other world-specific field gets.
  const privateScene = isPrivate === true && worldConfig.id === "resonance";

  const gameState = (await getState(key)) || getInitialState();
  if (!(await checkAdultAccess(req, res, worldConfig, gameState))) return;

  // A roll_result only makes sense as the second half of a still-pending
  // roll. If the same player has the game open on two devices (a phone and
  // a laptop, or a shared login), both independently poll pendingRoll and
  // can both fire resumePendingRollIfAny for the very same roll — without
  // this check, the second one would silently call the GM again and push a
  // full duplicate turn (confirmed live: "double rolls" creating duplicate
  // story entries). Checked before any Groq call, not just before the
  // final save, so a stale/duplicate submission never even reaches the LLM.
  if (type === "roll_result") {
    const stillPending = gameState.sessionLog.some((e) => e.role === "user" && e.rolling && e.player === player);
    if (!stillPending) {
      return res.status(409).json({ error: "This roll was already resolved — no need to resend it." });
    }
  }

  // "begin" is meant to be a one-time opening narration, but nothing ever
  // enforced that — a race between devices loading the same fresh campaign
  // at once (confirmed live: three separate [SESSION BEGINS] narrations
  // landing in the same sessionLog, one of them for characters that never
  // actually existed) or a client retry after a dropped response could both
  // resubmit it once the log already has real content. A true no-op rather
  // than an error: unlike a stale roll_result (a client bug worth surfacing),
  // a duplicate begin is an expected race in a system with no server-side
  // "has this campaign started" flag of its own — sessionLog.length is that
  // flag. Checked before any Groq call, same as the roll_result guard above.
  if (type === "begin" && gameState.sessionLog.length > 0) {
    return res.json({
      alreadyBegun: true,
      needsRoll: false,
      gameState: {
        characters: gameState.characters,
        worldState: buildWorldStatePayload(worldConfig, gameState),
      },
    });
  }

  // Wait-for-all-players turn gating: in any world with more than one real
  // character, a single player's action used to advance the story
  // immediately — the other character's player would come back to find the
  // scene had already moved on without them. Now that action is held in
  // worldState.pending_turn until every real character (getRealCharacterKeys)
  // has also submitted one for this round, then all of them are merged into
  // a single joint message and the GM is called once. Only applies to a
  // real "action" turn — never "begin" (the one-time opening narration) or
  // "roll_result" (the second half of a turn already in flight). Private
  // scenes are exempt too: a private scene is inherently one character
  // acting alone, the opposite of "wait for everyone" — and so is an
  // explicit soloOverride (the "solo tonight" toggle, for when a partner
  // genuinely isn't around).
  const soloOverride = req.body.soloOverride === true;
  let mergedContributors = [{ player, message }];
  if (type === "action" && !privateScene && !soloOverride) {
    const realKeys = getRealCharacterKeys(worldConfig.id, gameState.characters);
    if (realKeys.length > 1) {
      if (!gameState.worldState.pending_turn) gameState.worldState.pending_turn = {};
      gameState.worldState.pending_turn[player] = { message, timestamp: Date.now() };
      const pending = gameState.worldState.pending_turn;
      const waitingOn = realKeys.filter((k) => !pending[k]);
      if (waitingOn.length > 0) {
        await setState(key, gameState);
        return res.json({
          waiting: true,
          waitingOn,
          gameState: {
            characters: gameState.characters,
            worldState: buildWorldStatePayload(worldConfig, gameState),
          },
        });
      }
      mergedContributors = realKeys.map((k) => ({ player: k, message: pending[k].message }));
      gameState.worldState.pending_turn = {};
    }
  }

  let systemPrompt = buildSystemPrompt(gameState);

  if ((worldConfig.id === "manlandia" || worldConfig.type === "custom") && tone && tone !== "adventure") {
    if (tone === "silly") {
      systemPrompt += "\n\nTONE ADJUSTMENT: Make this session playful and silly. Creatures are goofy. Situations turn absurd. Use wordplay and light humor. Think funny children's movie energy. Keep the adventure real but wrap it in warmth and comedy.";
    } else if (tone === "epic") {
      systemPrompt += "\n\nTONE ADJUSTMENT: Make this session feel grand and epic. Powerful, vivid descriptions. Dramatic moments. Heroes feel legendary. High stakes. Think big fantasy movie energy.";
    }
  }

  const recentLog = gameState.sessionLog.slice(-MAX_HISTORY);
  const history = recentLog.map((entry) => ({
    role: entry.role === "gm" ? "assistant" : "user",
    content: entry.content,
  }));

  const playerLabel = player.charAt(0).toUpperCase() + player.slice(1);
  // A merged turn (more than one contributor) joins every held action into
  // one message, each on its own line under that character's display name,
  // so the GM narrates a single joint response reacting to all of them —
  // otherwise this is exactly the old single-submitter behavior.
  const userMessage = type === "roll_result"
    ? message
    : mergedContributors.length > 1
      ? mergedContributors.map((c) => `${getPlayerDisplayName(c.player, gameState)}: ${c.message}`).join("\n")
      : `${playerLabel}: ${message}`;

  // Every submission — including roll_result — takes the lock now. A
  // roll_result used to be exempt on the assumption it could never be a
  // competing submission (it's "the second half of one player's own turn"),
  // but that assumption breaks when the same player is open on two devices
  // at once: both can race to submit the same roll_result concurrently. The
  // stillPending check above catches a delayed duplicate (arriving after
  // the first has already released the lock and saved); this lock catches
  // one arriving at the same instant, before either has saved anything yet.
  if (!(await acquireGmLock(worldConfig.id))) {
    return res.status(429).json({ error: `Another turn just came in for this world — ${formatWaitMessage(null)} and try again.` });
  }

  let gmResponse;
  try {
    gmResponse = await generateContent(systemPrompt, history, userMessage);
  } catch (err) {
    console.error("GM error:", err);
    await releaseGmLock(worldConfig.id);
    if (err.status === 429) {
      await recordRateLimitHit(worldConfig.id);
      return res.status(429).json({ error: `The GM is handling a lot of requests right now — ${formatWaitMessage(err.retryAfterSeconds)} and try again.` });
    }
    return res.status(500).json({ error: "The GM encountered an error: " + err.message });
  }
  await releaseGmLock(worldConfig.id);

  const { clean: rollStripped, needsRoll, rollStat, rollAdvantage, rollPlayer } = extractRoll(gmResponse, gameState.characters);
  // Whoever the roll is actually for — the model's explicit attribution if
  // it named one (needed once more than one character can act in the same
  // merged turn), otherwise the single submitter, exactly as before.
  const roller = rollPlayer || player;
  const extracted = extractSuggestions(rollStripped);
  const cleanResponse = extracted.clean;
  const suggestions = (type === "roll_result" || needsRoll) ? [] : extracted.suggestions;

  const matchLocationId = worldConfig.id === "manlandia"
    ? matchManlandiaLocationId
    : worldConfig.type === "custom"
      ? matchCustomLocationId
      : matchResonanceLocationId;

  // When completing a roll, un-flag the deferred entries saved on the prior
  // call, and only now apply the state tags their narration carried (see
  // applyStateTags' comment for why this was deferred rather than applied
  // when the roll was first requested). Their timestamps are pushed back 2ms
  // so they still sort before the new entries pushed later in this same call.
  if (type === "roll_result") {
    const deferredEntries = gameState.sessionLog.filter(e => e.role === "gm" && e.rolling);
    const unmasked = Date.now();
    gameState.sessionLog.forEach(e => {
      if (e.rolling) { delete e.rolling; e.timestamp = unmasked - 2; }
    });
    for (const entry of deferredEntries) {
      applyStateTags(entry.content, gameState, worldConfig, matchLocationId);
    }
  }

  const ts = Date.now();

  // Powers the "waiting on ___" banner and the turn-stall push reminder cron
  // (api/cron-turn-reminder.js) — recorded on every real submission
  // regardless of roll state, since the point is "did someone engage," not
  // "did their turn fully resolve." Deliberately just one field, not a real
  // turn order: turn order isn't enforced in this app at all (anyone can act
  // anytime), so "waiting on" is only ever computed as "everyone else"
  // (see getWaitingOn in public/pure.js), not a specific next-up player.
  gameState.worldState.last_actor = player;
  gameState.worldState.last_action_at = ts;

  const rolling = needsRoll && type !== "roll_result";
  // A merged turn produces one sessionLog entry per contributor (so each
  // still renders as its own line, exactly like today), plus the one shared
  // GM entry. privateScene/soloOverride mean mergedContributors always has
  // exactly one entry in every case that isn't a real multi-character merge,
  // so this collapses to the original single-userEntry behavior otherwise.
  const userEntries = (type === "roll_result" ? [{ player, message: userMessage }] : mergedContributors).map((c) => ({
    role: "user",
    content: type === "roll_result" ? userMessage : `${c.player.charAt(0).toUpperCase() + c.player.slice(1)}: ${c.message}`,
    player: c.player,
    timestamp: ts,
  }));
  const gmEntry = { role: "gm", content: cleanResponse, timestamp: ts };
  if (privateScene) {
    // Hidden from the other player until a manual reveal_scene action (see
    // api/state.js) — /api/poll filters on this. Not real security, just a
    // UX device (see CLAUDE.md's "Solo/private scenes" section): the point
    // is dramatic irony between two people who trust each other, not access
    // control against a determined bypass.
    userEntries.forEach((e) => { e.private_to = player; });
    gmEntry.private_to = player;
  }
  if (rolling) {
    userEntries.forEach((e) => { e.rolling = true; });
    gmEntry.rolling = true;
    // Persisted so a dropped/interrupted roll can be recovered from a later
    // poll instead of vanishing — see api/poll.js's pendingRoll. rollPlayer
    // is who the roll is actually for, not necessarily who submitted this
    // request — see the "roller" comment above extractRoll's call.
    gmEntry.rollStat = rollStat;
    gmEntry.rollAdvantage = rollAdvantage;
    gmEntry.rollPlayer = roller;
  }
  gameState.sessionLog.push(...userEntries, gmEntry);

  if (gameState.sessionLog.length > 100) {
    gameState.sessionLog = gameState.sessionLog.slice(-80); // keep the stored log (and Redis payload) bounded
  }

  // Apply this turn's own state tags now, unless it's itself asking for a
  // roll — those are deferred until the matching roll_result comes back.
  if (!rolling) applyStateTags(cleanResponse, gameState, worldConfig, matchLocationId);

  // Combat's round counter only advances on an actual resolved roll, never
  // on narration alone, and is never something the model is asked to
  // report itself — a server-derived value sidesteps a whole category of
  // drift risk that every model-supplied tag in this app has to tolerate.
  if (type === "roll_result" && gameState.worldState.combat?.active) {
    gameState.worldState.combat.round += 1;
  }

  const responseWorldState = buildWorldStatePayload(worldConfig, gameState);

  await setState(key, gameState);

  // Only notify once the turn is fully resolved — while `rolling` is true the
  // entries are hidden from /api/poll, so a notification now would send the
  // other player to content they can't see yet. Same reasoning suppresses it
  // during a private scene: the whole point is the other player doesn't know
  // yet, and a "took a turn" push would tip them off to go look for nothing.
  if (!rolling && !privateScene) {
    const senderKeys = mergedContributors.map((c) => c.player);
    const senderDisplayName = senderKeys
      .map((k) => getPlayerDisplayName(k, gameState))
      .join(" & ");
    await sendTurnNotifications(worldConfig, gameState, senderKeys, senderDisplayName);
  }

  return res.json({
    response: cleanResponse,
    needsRoll,
    rollStat,
    rollAdvantage,
    rollPlayer: needsRoll ? roller : null,
    suggestions,
    serverTimestamp: Date.now(),
    gameState: {
      characters: gameState.characters,
      worldState: responseWorldState,
    },
  });
};
