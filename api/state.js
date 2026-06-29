const { getState, setState } = require("../lib/redis");
const { getInitialState } = require("../lib/gamestate");

const KEY = "resonance:gamestate";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const state = (await getState(KEY)) || getInitialState();
    return res.json(state);
  }

  if (req.method === "POST") {
    const { action, payload } = req.body;

    if (action === "reset") {
      await setState(KEY, getInitialState());
      return res.json({ ok: true });
    }

    if (action === "update") {
      await setState(KEY, payload);
      return res.json({ ok: true });
    }

    if (action === "toggle_ability") {
      const current = (await getState(KEY)) || getInitialState();
      const { character, ability } = payload;
      if (current.characters[character] && ability in current.characters[character]) {
        current.characters[character][ability] = !current.characters[character][ability];
        await setState(KEY, current);
        return res.json({ ok: true, characters: current.characters });
      }
      return res.status(400).json({ error: "Invalid character or ability" });
    }

    if (action === "use_magic") {
      const current = (await getState(KEY)) || getInitialState();
      if (current.characters.lyra.magic_uses_remaining > 0) {
        current.characters.lyra.magic_uses_remaining--;
        await setState(KEY, current);
        return res.json({ ok: true, characters: current.characters });
      }
      return res.json({ ok: false, error: "No magic uses remaining", characters: current.characters });
    }

    if (action === "new_session") {
      const current = (await getState(KEY)) || getInitialState();
      if (!current.worldState.session_archive) current.worldState.session_archive = [];
      current.worldState.session_archive.push({
        session: current.session,
        summary: payload.summary,
        log: [...current.sessionLog]
      });
      current.session += 1;
      current.worldState.session_summaries.push(payload.summary);
      current.sessionLog = [];
      current.characters.lyra.weight_of_knowing_used = false;
      current.characters.lyra.magic_uses_remaining = 3;
      current.characters.fen.not_on_my_watch_used = false;
      current.characters.fen.lucky_break_used = false;
      await setState(KEY, current);
      return res.json({ ok: true, session: current.session });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.status(405).json({ error: "Method not allowed" });
};
