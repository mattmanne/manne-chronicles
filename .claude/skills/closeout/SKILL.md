---
name: closeout
description: End-of-session close-out for the Resonance/Manlandia DnD app. Runs live API tests, syntax-checks all JS, verifies git is clean, updates memory docs, and produces a session summary with next steps. Use after any coding session on this project.
disable-model-invocation: false
---

You are closing out a coding session on the Resonance/Manlandia family RPG app at https://resonance-dnd.vercel.app.

Work through all steps below in order. Do not skip steps. Report a clear pass/fail for every check.

---

## STEP 1 — Syntax Check All JS Files

Run `node --check` on every JS file:

```
api/campaigns.js  api/characters.js  api/gm.js  api/help.js
api/poll.js  api/recap.js  api/state.js  api/unlock.js
lib/adultgate.js  lib/gamestate-custom.js  lib/gamestate-manlandia.js
lib/gamestate.js  lib/gemini.js  lib/gm-tags.js  lib/prompt-custom.js
lib/prompt-manlandia.js  lib/prompt.js  lib/ratelimit.js
lib/recap.js  lib/redis.js  lib/suggestions.js  lib/worldconfig.js
public/game.js  public/pure.js
```

Report any failures immediately. If any fail, fix them before continuing.

Also run `npm test` (plain Node unit tests under `tests/`, no framework) — all must pass.

---

## STEP 2 — Git Status

Run `git status` and `git log --oneline -6`.

- Everything must be committed and pushed (`nothing to commit, working tree clean`, `Your branch is up to date with 'origin/main'`).
- If anything is uncommitted, commit and push it now with an appropriate message.

---

## STEP 3 — Live API Tests

Base URL: `https://resonance-dnd.vercel.app`
Game secret header: `X-Game-Secret: MannesAreTheBest`

Run these checks in order:

**Auth & Unlock**
- POST `/api/unlock` with `{"pin":"wrong"}` → expect `{"ok":false}`
- POST `/api/unlock` with `{"pin":"5414"}` → expect `{"ok":true}`
- POST `/api/gm?world=manlandia` with no `X-Game-Secret` header → expect `{"error":"Unauthorized"}`
- POST `/api/help?world=manlandia` with no secret → expect a valid `answer` field (help needs no auth)

**State (GET)**
- GET `/api/state?world=resonance` → expect `characters.fen` and `characters.lyra` exist
- GET `/api/state?world=manlandia` → expect `characters.player1` exists, `worldState.villain_awareness` is a number
- GET `/api/campaigns` → expect response with `campaigns` array

**Poll**
- GET `/api/poll?since=0&world=resonance` → expect `entries` array and `worldState` object
- GET `/api/poll?since=0&world=manlandia` → expect `entries` array and `worldState` object

**Recap**
- GET `/api/recap?world=manlandia` (or any world with existing sessionLog entries) → expect a `recap` string

**Static assets**
- GET `/pure.js` → expect 200 with JS content (this is a Vercel rewrite in vercel.json — if it's ever missing, the whole app breaks silently since game.js depends on functions defined there)

**Adult gate (server-side enforcement)**
- GET `/api/poll?since=0&world=resonance` with NO `X-Adult-Pin` header → expect `{"error": "This world is locked..."}` with 403
- GET `/api/poll?since=0&world=resonance` with `X-Adult-Pin: 5414` → expect normal poll response (200)
- GET `/api/poll?since=0&world=manlandia` with no adult-pin header → expect normal response (Manlandia is never gated)

**GM (live call — pick whichever world has entries)**
- If manlandia has 0 entries: POST `/api/gm?world=manlandia` with `{"player":"player1","message":"[SESSION BEGINS]","type":"begin"}` → expect `response` string or `needsRoll: true`

Report PASS or FAIL for each. Stop and investigate any FAIL before continuing.

---

## STEP 4 — Key Behaviour Checks

These are logic checks using the existing state, not new calls:

1. **Adult gate**: Confirm `worldConfig.adult === true` for any known adult campaign in the campaigns list.
2. **Custom campaign playerCount**: If any custom campaigns exist, GET their state and confirm `worldConfig.playerCount` is set.
3. **Character isolation**: Confirm kid campaigns (manlandia) have `characters.player1` through `player4`; resonance has `fen` and `lyra` only.
4. **No cross-contamination**: Resonance state has no `villain_awareness`; Manlandia state has no `conclave_awareness`.
5. **GM tag drift** (do this if there's time — this is how every parsing bug fixed so far was actually found): `GET /api/state` for each live campaign with real history, grep the `sessionLog` for `gm` entries containing `[`, and eyeball whether the model's actual bracket-tag formatting still looks like what `lib/gm-tags.js` expects. The model's compliance drifts; this catches it before a player does.

---

## STEP 5 — Memory Update

Read the current memory files:
- `memory/project_resonance.md`
- `memory/project_resonance_v2.md`

Update them to accurately reflect the current state of the app. Key things to keep current:
- All completed features (never remove a completed feature from the list)
- Active backlog (add anything new that came up this session)
- Key files table (add any new files added this session)
- Env vars in the tech stack section (add `ADULT_PIN` if not already there)

Also scan for any memory that is now stale or wrong and update it.

---

## STEP 6 — Session Summary

Write a concise close-out report covering:

**What was built/fixed this session** (one line each, be specific)

**Current app state** — what works end-to-end right now:
- World selector and world switching
- Which worlds are gated behind adult unlock
- Character creation / wizard
- GM narration loop
- Any known limitations or rough edges

**Vercel env vars required** — list all env vars the deployment needs to function

**Next session pick-up** — top 3 things worth doing next, ranked by player impact. Be specific about what the work actually is, not just "improve X".

**Any open risks or known issues** — things that could break or that need attention

---

## STEP 7 — Final Confirmation

State clearly: "✅ Session closed. App is deployed, all tests pass, git is clean."

Or if anything failed: list exactly what is broken and what needs to be done before the next session.
