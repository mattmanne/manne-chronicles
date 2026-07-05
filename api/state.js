const { getState, setState } = require("../lib/redis");
const { HARM_LEVELS } = require("../lib/gamestate");
const { getWorldConfig, buildWorldStatePayload } = require("../lib/worldconfig");
const { checkAdultAccess, isAdultWorld } = require("../lib/adultgate");
const { GROWTH_CONFIG_KID, GROWTH_CONFIG_ADULT, applyXpGain, chooseAbility } = require("../lib/growth");

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Secret, X-Adult-Pin");
  if (req.method === "OPTIONS") return res.status(200).end();

  const worldConfig = getWorldConfig(req.query.world);
  const { key, getInitialState } = worldConfig;

  if (req.method === "GET") {
    // This returns the full raw gamestate — unlike /api/poll's filtered
    // payload, that includes photos, the complete sessionLog, and (for
    // adult worlds) private-scene content and scene_pin values. Previously
    // only checkAdultAccess() gated this, which is a no-op for Manlandia
    // and non-adult custom worlds — meaning it was readable by anyone who
    // knew a campaign id, with no secret of any kind. Same X-Game-Secret
    // check as every other state-mutating/state-reading endpoint now.
    const gameSecret = process.env.GAME_SECRET;
    if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const state = (await getState(key)) || getInitialState();
    if (!(await checkAdultAccess(req, res, worldConfig, state))) return;
    return res.json(state);
  }

  if (req.method === "POST") {
    const gameSecret = process.env.GAME_SECRET;
    if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const stateForAdultCheck = (await getState(key)) || getInitialState();
    if (!(await checkAdultAccess(req, res, worldConfig, stateForAdultCheck))) return;

    const { action, payload } = req.body;

    if (action === "toggle_ability") {
      const current = (await getState(key)) || getInitialState();
      const { character, ability } = payload;
      if (current.characters[character] && ability in current.characters[character]) {
        current.characters[character][ability] = !current.characters[character][ability];
        await setState(key, current);
        return res.json({ ok: true, characters: current.characters });
      }
      return res.status(400).json({ error: "Invalid character or ability" });
    }

    if (action === "use_magic") {
      const current = (await getState(key)) || getInitialState();
      if (current.characters.lyra && current.characters.lyra.magic_uses_remaining > 0) {
        current.characters.lyra.magic_uses_remaining--;
        await setState(key, current);
        return res.json({ ok: true, characters: current.characters });
      }
      return res.json({ ok: false, error: "No magic uses remaining", characters: current.characters });
    }

    if (action === "recover_harm") {
      const current = (await getState(key)) || getInitialState();
      const { character } = payload;
      if (!current.characters[character]) return res.status(400).json({ error: "Invalid character" });
      const idx = HARM_LEVELS.indexOf(current.characters[character].harm);
      if (idx > 0) {
        current.characters[character].harm = HARM_LEVELS[idx - 1];
        await setState(key, current);
        return res.json({ ok: true, characters: current.characters });
      }
      return res.json({ ok: false, error: "Already unhurt", characters: current.characters });
    }

    // Manual escape hatch for combat — no LLM round-trip, same pattern as
    // recover_harm. [COMBAT END]/all-enemies-defeated auto-detection covers
    // most fights, but a fight that ends by retreat or negotiation rather
    // than defeating everyone has no other way to close, so this exists as
    // the safety net rather than trying to solve that detection perfectly.
    if (action === "end_combat") {
      const current = (await getState(key)) || getInitialState();
      if (current.worldState.combat) current.worldState.combat.active = false;
      await setState(key, current);
      return res.json({ ok: true, worldState: buildWorldStatePayload(worldConfig, current) });
    }

    if (action === "choose_ability") {
      const current = (await getState(key)) || getInitialState();
      const { character, ability_id } = payload || {};
      if (!current.characters[character]) return res.status(400).json({ error: "Invalid character" });
      const result = chooseAbility(current.characters[character], ability_id);
      if (!result) return res.status(400).json({ error: "That power isn't available to choose right now" });
      Object.assign(current.characters[character], result);
      await setState(key, current);
      return res.json({ ok: true, characters: current.characters });
    }

    // Bonds — adult games only (Resonance, adult-flagged custom campaigns).
    // Player-authored relationship statements about another party member,
    // not a GM-narration tag like NPC/OBJECTIVE — the player decides when to
    // write and resolve one, so this goes through /api/state like the other
    // player-driven actions (recover_harm, choose_ability), not /api/gm.
    if (action === "add_bond") {
      const current = (await getState(key)) || getInitialState();
      if (!isAdultWorld(worldConfig, current)) return res.status(400).json({ error: "Bonds are only available in adult games" });
      const { character, target, text } = payload || {};
      const trimmed = typeof text === "string" ? text.trim().slice(0, 200) : "";
      if (!current.characters[character] || !current.characters[target] || character === target || !trimmed) {
        return res.status(400).json({ error: "Invalid character, target, or bond text" });
      }
      if (!current.characters[character].bonds) current.characters[character].bonds = [];
      current.characters[character].bonds.push({ target, text: trimmed, resolved: false });
      await setState(key, current);
      return res.json({ ok: true, characters: current.characters });
    }

    if (action === "resolve_bond") {
      const current = (await getState(key)) || getInitialState();
      if (!isAdultWorld(worldConfig, current)) return res.status(400).json({ error: "Bonds are only available in adult games" });
      const { character, index } = payload || {};
      const bond = current.characters[character]?.bonds?.[index];
      if (!bond) return res.status(400).json({ error: "Invalid character or bond" });
      if (bond.resolved) return res.json({ ok: true, characters: current.characters });
      bond.resolved = true;
      // Resonance has no XP/growth system at all (see lib/growth.js) — only
      // adult custom campaigns actually have somewhere to put the reward.
      if (worldConfig.type === "custom") {
        Object.assign(current.characters[character], applyXpGain(current.characters[character], GROWTH_CONFIG_ADULT.bondXp, GROWTH_CONFIG_ADULT));
      }
      await setState(key, current);
      return res.json({ ok: true, characters: current.characters });
    }

    // Solo/private scenes — Resonance-specific (its fixed two-character
    // shape is what makes "my partner isn't in the room" a meaningful
    // mechanic). Not real security — see CLAUDE.md — just enough friction
    // that switching to the other character on a shared device isn't a
    // single accidental tap.
    if (action === "set_scene_pin") {
      const current = (await getState(key)) || getInitialState();
      if (worldConfig.id !== "resonance") return res.status(400).json({ error: "Scene PINs are Resonance-only" });
      const { character, pin } = payload || {};
      if (!current.characters[character]) return res.status(400).json({ error: "Invalid character" });
      const trimmed = typeof pin === "string" ? pin.trim() : "";
      if (trimmed !== "" && !/^\d{4}$/.test(trimmed)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits, or blank to clear it" });
      }
      current.characters[character].scene_pin = trimmed;
      await setState(key, current);
      return res.json({ ok: true, characters: current.characters });
    }

    if (action === "reveal_scene") {
      const current = (await getState(key)) || getInitialState();
      if (worldConfig.id !== "resonance") return res.status(400).json({ error: "Private scenes are Resonance-only" });
      const { character } = payload || {};
      if (!current.characters[character]) return res.status(400).json({ error: "Invalid character" });
      let revealed = 0;
      current.sessionLog.forEach((entry) => {
        if (entry.private_to === character) { delete entry.private_to; revealed++; }
      });
      await setState(key, current);
      return res.json({ ok: true, revealed });
    }

    if (action === "set_author_note") {
      const current = (await getState(key)) || getInitialState();
      const note = typeof payload?.note === "string" ? payload.note.trim().slice(0, 1000) : "";
      current.worldState.author_note = note;
      await setState(key, current);
      return res.json({ ok: true, author_note: note });
    }

    if (action === "add_pinned_note") {
      const current = (await getState(key)) || getInitialState();
      const text = typeof payload?.text === "string" ? payload.text.trim().slice(0, 300) : "";
      if (!text) return res.status(400).json({ error: "Note text is required" });
      if (!current.worldState.pinned_notes) current.worldState.pinned_notes = [];
      current.worldState.pinned_notes.push({ text, timestamp: Date.now() });
      // Small, fixed cap — this is a handful of "don't lose this" flags, not
      // a second session log; oldest pins roll off once the list is full.
      if (current.worldState.pinned_notes.length > 10) {
        current.worldState.pinned_notes = current.worldState.pinned_notes.slice(-10);
      }
      await setState(key, current);
      return res.json({ ok: true, pinned_notes: current.worldState.pinned_notes });
    }

    if (action === "new_session") {
      // Every sibling free-text action (set_author_note, add_pinned_note,
      // add_bond) caps its input — this one didn't, despite being stored
      // twice (session_archive and session_summaries) and fed back into
      // every future prompt via session_summaries.
      const summary = typeof payload?.summary === "string" ? payload.summary.trim().slice(0, 2000) : "";
      const current = (await getState(key)) || getInitialState();
      if (!current.worldState.session_archive) current.worldState.session_archive = [];
      current.worldState.session_archive.push({
        session: current.session,
        summary,
        log: [...current.sessionLog],
      });
      current.session += 1;
      if (!current.worldState.session_summaries) current.worldState.session_summaries = [];
      current.worldState.session_summaries.push(summary);
      current.sessionLog = [];

      if (worldConfig.id === "resonance") {
        current.characters.lyra.weight_of_knowing_used = false;
        current.characters.lyra.magic_uses_remaining = 3;
        current.characters.fen.not_on_my_watch_used = false;
        current.characters.fen.lucky_break_used = false;
      }

      if (worldConfig.id === "manlandia" || worldConfig.type === "custom") {
        ["player1","player2","player3","player4"].forEach(p => {
          if (current.characters[p]) current.characters[p].ability_used = false;
        });
      }

      // Harm reset on a new session — a fresh start for kid games, but adult
      // games keep some narrative weight between sessions rather than
      // wiping the slate clean. `new_session` previously never touched harm
      // at all, which meant a character who ended a session "Broken" started
      // the next one still "Broken."
      const isAdultGame = isAdultWorld(worldConfig, current);

      // Baseline XP growth (see lib/growth.js) — Resonance is excluded
      // entirely (Lyra/Fen already have 3 fixed, bespoke abilities apiece
      // with no unlockable pool). Only grows heroes that actually exist
      // (have picked an archetype) rather than the 4 empty character slots.
      if (worldConfig.id === "manlandia" || worldConfig.type === "custom") {
        const growthConfig = isAdultGame ? GROWTH_CONFIG_ADULT : GROWTH_CONFIG_KID;
        ["player1", "player2", "player3", "player4"].forEach((p) => {
          const c = current.characters[p];
          if (!c || !c.archetype) return;
          Object.assign(c, applyXpGain(c, growthConfig.baselineXp, growthConfig));
        });
      }
      const characterKeys = worldConfig.id === "resonance"
        ? ["lyra", "fen"]
        : ["player1", "player2", "player3", "player4"];
      characterKeys.forEach((k) => {
        const c = current.characters[k];
        if (!c) return;
        if (isAdultGame) {
          const idx = HARM_LEVELS.indexOf(c.harm);
          if (idx > 0) c.harm = HARM_LEVELS[Math.max(0, idx - 2)];
        } else {
          c.harm = "Unhurt";
        }
      });

      await setState(key, current);
      return res.json({ ok: true, session: current.session });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.status(405).json({ error: "Method not allowed" });
};
