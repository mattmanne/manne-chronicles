# Project Memory — The Manne Chronicles

**Reconstructed 2026-07-06.** The closeout skill (`.claude/skills/closeout/SKILL.md`)
expects this file plus a `project_resonance_v2.md` sibling, but neither existed
anywhere in the repo as of this closeout — same loss already noted in
`project_resonance_backlog_decisions.md` for the backlog doc and the auto-memory
notes `CLAUDE.md` links to (`[[project_resonance_v2]]`, `[[project_data_safety]]`).
Collapsed back into a single file here since the original v1/v2 split's rationale
is unknown and lost — split it again later if this one grows unwieldy.

`CLAUDE.md` is the authoritative, detailed architecture reference — this file is
a lighter session-tracking companion (what's done, what's next, where things
live), not a duplicate of that detail.

## Completed features

Grouped roughly by area; never remove an entry from this list once shipped,
even if later superseded — note the supersession instead.

**Core loop**
- World routing (Resonance, Manlandia, unlimited custom campaigns) via `lib/worldconfig.js`
- GM narration loop with bracket-tag state notation (full table in `CLAUDE.md`)
- Dice roll flow, including tolerant `ROLL:` parsing across multiple model phrasing drifts, plus a 2026-07-06 natural-language fallback (`extractRoll()`) for when the model asks for a roll in plain prose with no `ROLL:` anchor at all
- Wait-for-all-players merged turns (multi-hero worlds only; solo worlds unaffected)
- Session log with 40-entry LLM context window, 80-entry storage trim
- New session / session archive flow
- `type: "begin"` idempotency (2026-07-06) — a duplicate opening-narration call once the log already has content is a no-op (`{ alreadyBegun: true }`), not a second contradictory scene
- Combat status echoed back to the model every turn (`buildCombatStatusBlock()`, 2026-07-06) — same idea as character harm already being shown, now extended to enemy harm/defeat

**Characters & growth**
- Character creation wizard (archetype, ability, name, photo, backstory)
- Hero customization: color swatch + emoji symbol picker
- Character growth (XP): milestone badges + bonus ability unlocks (Manlandia/custom only)
- Bonus ability used-tracking (`bonus_abilities_used`) — added 2026-07-05, own once-per-session state per unlocked power, separate from the starting ability
- In-place level-up banner + border pulse moments
- Manual ability/magic toggles with confirm-before-spend (Resonance abilities, Lyra's magic, Manlandia/custom starting + bonus abilities)

**World state & tracking**
- Objectives (goal-shaped) and Leads/Clues (question-shaped) tracking, both fuzzy-matched/deduped
- NPC lorebook ("Who's Who")
- Inventory — shared party (kid/non-adult) vs. per-character (adult), decided once at campaign creation
- Location tracking + visited-locations map (real hand-drawn maps for Resonance/Manlandia, procedural snake-graph for custom worlds)
- Combat tracker (universal shape, DW-style single-roll-per-exchange philosophy, not a real initiative system)
- Remember-this pins (universal, player-authored, fed into every prompt)
- Author's Note (parent-curated, fed into every prompt)

**Adult-only (Resonance always, adult-flagged custom)**
- Bonds (relationship statements between party members)
- Solo/private scenes with per-character scene PIN gate

**Social/session features**
- Waiting-on banner + turn-stall push reminder cron (48h)
- The Living World: ambient "meanwhile..." beats for stalled worlds (72h, flavor-only, no state mutation)
- Push notifications (web-push, VAPID), iOS PWA caveat documented
- Sound effects (synthesized tones, opt-in, off by default)
- World archive/unarchive, delete-with-typed-confirmation
- Catch-up recap (2026-07-19): dismissible banner nudges a returning player toward the existing recap after 24h+ away (`checkCatchUp()`, device-local via `localStorage`); recap now writes in **third person naming every character**, not a per-viewer second-person POV (the earlier POV-aware version fixed the wrong half of the problem — it made the POV correct per viewer but still locked to one character, so it didn't read naturally for whichever hero actually picked it up); recap overlay also gained a "🔊 Listen" read-aloud button reusing the existing speech engine
- Action input box (2026-07-19): `#action-input` is now an auto-growing `<textarea>` (was a single-line `<input>`) so a multi-line action stays visible; Shift+Enter inserts a real newline as a side effect

**Security/robustness**
- Two independent auth layers: `X-Game-Secret` (fails open if unset) and `X-Adult-Pin` (fails closed)
- Rate limiting: paid-API cost control (help/recap) and PIN-guessing protection (unlock + every adult-gated endpoint)
- Groq quota handling: retry, 8B fallback, per-world `gmlock`, player-facing wait messages
- Duplicate roll_result / double-submission protection
- Groq rate-limit hit tracking (2026-07-19): `lib/groq-tracking.js` records every player-visible Groq-quota failure (both `api/gm.js` and `api/recap.js` — the recap call site was a gap in the first version, caught during this same day's closeout) to Redis; `GET /api/groq-stats` + `scripts/check-groq-ratelimit.js` surface total/24h/7d/by-world frequency. Matt is staying on Groq's free tier for now and monitoring via this before deciding whether to upgrade.
- Custom campaign ID collision fix (2026-07-19): ids were a bare `Date.now()` timestamp with no collision protection — two creates in the same millisecond would silently share one Redis key. Now `c_<timestamp>_<random hex>` via `crypto.randomUUID()`.
- Voice input error surfacing (2026-07-19): `recognition.onerror` used to fail completely silently; now shows a specific "microphone blocked" message or a generic fallback, auto-hiding after 4s. iOS Safari has actually supported the underlying API since 14.5 — the mic button itself was never the problem.
- Fixed two UI-state bugs (2026-07-19): a half-typed draft no longer carries over when switching worlds; a failed send no longer leaves a phantom line in the story log (the optimistically-appended entry is now rolled back alongside the restored input text).
- `stripGMTags()` now also strips a bare `[LOCATION CHANGE]` marker (2026-07-19, found live via `npm run check-drift` during this session's closeout) — the model echoed the prompt files' own "LOCATION CHANGE:" instruction *label* back as if it were a bracket tag, and nothing was stripping it from display since it's not real notation (`lib/gm-tags.js` never parses it either). Pure display-layer fix — no data migration needed, since `stripGMTags()` runs at render time against whatever's already stored.

## Active backlog

Tracked in **`project_resonance_backlog_decisions.md`** (repo root), not
duplicated here — that file is the single source of truth for pending
decisions and known deferred gaps. As of 2026-07-19 it has no open pending
decisions — everything raised so far has been resolved or explicitly
deferred with a reason. Notable 2026-07-19 investigation: a "worlds bleeding
into each other" report (Underseas) turned out to be the model reusing a
generic "whispers behind a locked door" narrative trope across unrelated
campaigns, not real data sharing — confirmed by reading the actual stored
transcripts of all 5 live campaigns. The real (unrelated) risk found along
the way — same-millisecond campaign ID collisions — is fixed.

**2026-07-05 playtest, closed out 2026-07-06**: `playtest_findings_2026-07-05.md`
documents a 6-persona live playtest against production. All 6 confirmed
findings are now fixed and deployed: the roll-request-with-no-anchor bug
(headline finding, fixed via a parser fallback — a true compliance-
independent safety net), malformed `(Name)`-padded `CHARACTER`/`ABILITY`
tags (parser tolerance fix), combat tracking and item/location tags not
firing reliably (both prompt-adherence mitigations only — no reliable
grammatical signal exists for "a fight/move/pickup happened" the way there
is for a roll request, so these can't be proven fixed from a single live
call the way the roll fix could), `[SUGGESTIONS: ...]` parentheses drift
(parser tolerance fix), and `type: "begin"` non-idempotency (fixed and
directly, definitively verified live).

## Key files

| Path | Purpose |
|---|---|
| `api/campaigns.js` | Custom campaign CRUD (create/update/archive/delete), world-selector listing |
| `api/characters.js` | Character creation/edit (Manlandia + custom only) |
| `api/cron-turn-reminder.js` | Daily Vercel Cron — turn-stall reminders + Living World ambient beats |
| `api/gm.js` | Core GM request/response orchestration — merged turns, rolls, locking, push |
| `api/help.js` | Kid-safe rules-question endpoint (no game secret required) |
| `api/poll.js` | Client polling endpoint — new entries, world state, pending roll recovery |
| `api/push.js` | Push subscription management |
| `api/recap.js` | Third-person, viewer-agnostic session recap |
| `api/groq-stats.js` | Read-only Groq rate-limit hit stats (`X-Game-Secret` gated) |
| `api/state.js` | Player-driven actions (toggles, bonds, pins, author note, new_session, etc.) |
| `api/unlock.js` | Adult PIN verification |
| `api/vapid-public-key.js` | Serves the public VAPID key for push subscription |
| `lib/adultgate.js` | `checkAdultAccess()` / `isAdultWorld()` — shared adult-content gating |
| `lib/apply-state-tags.js` | Bracket-tag → state-mutation wiring (`applyStateTags()`) |
| `lib/character-options.js` | Single source of truth: archetype/ability ids, hero colors/symbols |
| `lib/gamestate.js` / `-manlandia.js` / `-custom.js` | Initial state builders per world type |
| `lib/gemini.js` | Groq API client (named `gemini.js` for historical reasons — not Google Gemini) |
| `lib/gm-tags.js` | Pure regex tag-extraction functions, unit-tested directly |
| `lib/groq-tracking.js` | Records/aggregates player-visible Groq rate-limit hits to Redis |
| `lib/growth.js` | XP/milestone/ability-unlock logic |
| `lib/livingworld.js` | Ambient "meanwhile..." beat prompt builder |
| `lib/prompt.js` / `-manlandia.js` / `-custom.js` / `-shared.js` | System prompt builders per world type + shared blocks |
| `lib/push.js` | Push payload building, notify-target selection |
| `lib/ratelimit.js` | Redis INCR+EXPIRE fixed-window rate limiter |
| `lib/recap.js` | Recap prompt/logic |
| `lib/redis.js` | Upstash Redis REST client (only persistence layer) |
| `lib/suggestions.js` | `[SUGGESTIONS: ...]` tag parsing |
| `lib/worldconfig.js` | World routing (`getWorldConfig`), shared `buildWorldStatePayload()` |
| `public/game.js` | Main frontend logic (DOM-heavy, not unit-tested) |
| `public/pure.js` | Logic-only functions shared between browser and Node tests |
| `public/sw.js` | Push notification service worker |
| `scripts/check-tag-drift.js` | Live-transcript bracket-tag auditor — run every closeout |
| `scripts/check-groq-ratelimit.js` | Human-readable Groq rate-limit hit-frequency report |
| `project_resonance_backlog_decisions.md` | Pending decisions + known deferred gaps |
| `playtest_findings_2026-07-05.md` | 2026-07-05 live playtest results |

## Env vars

See `CLAUDE.md`'s "Env vars" section for the authoritative table (9 vars:
`GROQ_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`GAME_SECRET`, `ADULT_PIN`, `ALLOWED_ORIGIN`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `CRON_SECRET`) — confirmed current as of this closeout,
`ADULT_PIN` included.

## Tech stack

Vercel (hosting + serverless functions) + Groq API (Llama 3.3 70B) + Upstash
Redis (REST only, no SDK). One npm dependency: `web-push`. Plain HTML/CSS/JS
frontend, no bundler/framework. See `CLAUDE.md` for full rationale on each
choice.
