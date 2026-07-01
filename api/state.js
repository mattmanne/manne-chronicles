const { getState, setState } = require("../lib/redis");
const { HARM_LEVELS } = require("../lib/gamestate");
const { getWorldConfig } = require("../lib/worldconfig");
const { checkAdultAccess } = require("../lib/adultgate");

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Game-Secret, X-Adult-Pin");
  if (req.method === "OPTIONS") return res.status(200).end();

  const worldConfig = getWorldConfig(req.query.world);
  const { key, getInitialState } = worldConfig;

  if (req.method === "GET") {
    const state = (await getState(key)) || getInitialState();
    if (!checkAdultAccess(req, res, worldConfig, state)) return;
    return res.json(state);
  }

  if (req.method === "POST") {
    const gameSecret = process.env.GAME_SECRET;
    if (gameSecret && req.headers["x-game-secret"] !== gameSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const stateForAdultCheck = (await getState(key)) || getInitialState();
    if (!checkAdultAccess(req, res, worldConfig, stateForAdultCheck)) return;

    const { action, payload } = req.body;

    if (action === "reset") {
      let fresh;
      if (worldConfig.type === "custom") {
        const cur = await getState(key);
        const { getInitialStateCustom } = require('../lib/gamestate-custom');
        fresh = getInitialStateCustom(cur?.worldConfig || {});
      } else {
        fresh = getInitialState();
      }
      await setState(key, fresh);
      return res.json({ ok: true });
    }

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

    if (action === "new_session") {
      const current = (await getState(key)) || getInitialState();
      if (!current.worldState.session_archive) current.worldState.session_archive = [];
      current.worldState.session_archive.push({
        session: current.session,
        summary: payload.summary,
        log: [...current.sessionLog],
      });
      current.session += 1;
      if (!current.worldState.session_summaries) current.worldState.session_summaries = [];
      current.worldState.session_summaries.push(payload.summary);
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

      await setState(key, current);
      return res.json({ ok: true, session: current.session });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.status(405).json({ error: "Method not allowed" });
};
