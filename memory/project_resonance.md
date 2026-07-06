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
- Dice roll flow, including tolerant `ROLL:` parsing across multiple model phrasing drifts
- Wait-for-all-players merged turns (multi-hero worlds only; solo worlds unaffected)
- Session log with 40-entry LLM context window, 80-entry storage trim
- New session / session archive flow

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

**Security/robustness**
- Two independent auth layers: `X-Game-Secret` (fails open if unset) and `X-Adult-Pin` (fails closed)
- Rate limiting: paid-API cost control (help/recap) and PIN-guessing protection (unlock + every adult-gated endpoint)
- Groq quota handling: retry, 8B fallback, per-world `gmlock`, player-facing wait messages
- Duplicate roll_result / double-submission protection

## Active backlog

Tracked in **`project_resonance_backlog_decisions.md`** (repo root), not
duplicated here — that file is the single source of truth for pending
decisions and known deferred gaps.

**Newest addition (2026-07-05)**: `playtest_findings_2026-07-05.md` documents
a 6-persona live playtest against production. Headline, high-confidence,
independently-reproduced-twice finding: the GM frequently asks for a dice
roll in plain prose with no `ROLL:` token at all, so the roll never actually
triggers. Also: combat tracking not engaging during clear fights, item/
location tags not firing reliably, and a new (not-yet-live) malformed
`[CHARACTER N (Name): ...]`/`[ABILITY N (Name): ...]` tag shape that would
silently fail to parse if it ever reaches production. Not yet triaged into
fix/defer — that's the next thing to review.

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
| `api/recap.js` | POV-aware session recap |
| `api/state.js` | Player-driven actions (toggles, bonds, pins, author note, new_session, etc.) |
| `api/unlock.js` | Adult PIN verification |
| `api/vapid-public-key.js` | Serves the public VAPID key for push subscription |
| `lib/adultgate.js` | `checkAdultAccess()` / `isAdultWorld()` — shared adult-content gating |
| `lib/apply-state-tags.js` | Bracket-tag → state-mutation wiring (`applyStateTags()`) |
| `lib/character-options.js` | Single source of truth: archetype/ability ids, hero colors/symbols |
| `lib/gamestate.js` / `-manlandia.js` / `-custom.js` | Initial state builders per world type |
| `lib/gemini.js` | Groq API client (named `gemini.js` for historical reasons — not Google Gemini) |
| `lib/gm-tags.js` | Pure regex tag-extraction functions, unit-tested directly |
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
