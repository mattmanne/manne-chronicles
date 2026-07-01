# Resonance / Manlandia — Architecture Notes

This is the developer-facing companion to `README.md` (which is written for players). Read this before making structural changes.

## Tech stack

- **Vercel** — hosting + serverless functions (`api/*.js`), auto-deploys on push to `main`
- **Groq API** — Llama 3.3 70B, called from `lib/gemini.js` (file is named `gemini.js` for historical reasons — it does **not** call Google's Gemini API; don't rename it, several places assume this path)
- **Upstash Redis** — REST API only, no SDK (`lib/redis.js`); this is the only persistence layer
- **Zero npm dependencies** in the shipped app — all external calls use native `fetch`. Test tooling (`node:test`) is Node-built-in; nothing gets installed.
- **Frontend**: plain HTML/CSS/JS, no bundler, no framework. `public/index.html` loads `pure.js` then `game.js` as ordinary global-scope `<script>` tags (in that order — `game.js` calls functions defined in `pure.js`).

## World routing (`lib/worldconfig.js`)

Every API handler starts by calling `getWorldConfig(req.query.world)`, which returns `{ id, type?, key, getInitialState, buildSystemPrompt }`:

| `world` param | Resolves to | Redis key | Gamestate / prompt |
|---|---|---|---|
| `"resonance"` | built-in | `resonance:gamestate` | `lib/gamestate.js` / `lib/prompt.js` |
| `"manlandia"` | built-in | `manlandia:gamestate` | `lib/gamestate-manlandia.js` / `lib/prompt-manlandia.js` |
| `c_<anything>` | custom campaign | `campaign:<id>:gamestate` | `lib/gamestate-custom.js` / `lib/prompt-custom.js` |
| anything else / missing | falls back to `"resonance"` | — | — |

Custom worlds carry their own config (`name`, `theme`, `playerCount`, `adult`) inside `gameState.worldConfig`, not in the static `getWorldConfig()` return value — that config only exists once a campaign has actually been created and stored.

## Redis key structure

- `resonance:gamestate`, `manlandia:gamestate` — the two built-in worlds' full state
- `campaign:<id>:gamestate` — one per custom campaign
- `campaigns:index` — array of `{ id, name, subtitle, playerCount, adult, createdAt }`, the list rendered in the world selector

**Known quirk**: deleting a campaign (`api/campaigns.js`, `action: "delete"`) only removes its entry from `campaigns:index` — the `campaign:<id>:gamestate` key itself is never deleted, so it becomes an orphaned, unreachable key in Redis. Harmless (small, never read again) but worth knowing if you're ever auditing Redis usage. See `[[project_data_safety]]` in memory re: Redis data being precious — don't add cleanup logic here without checking that memory note first.

## GM bracket-tag notation

The GM's raw LLM response is plain narration plus optional bracket tags on their own lines at the end. `api/gm.js` orchestrates parsing after the response comes back from `lib/gemini.js`; the actual tolerant regex logic lives in `lib/gm-tags.js` (pure functions, unit-tested directly — see `tests/gm-tags.test.js`). Every prompt file (`lib/prompt.js`, `lib/prompt-manlandia.js`, `lib/prompt-custom.js`) instructs the model to emit whichever of these apply, in a "STATE NOTATION" block.

| Tag | Worlds | Effect |
|---|---|---|
| `ROLL:STAT[:ADVANTAGE]` | all | Not a bracket tag — a bare line. Triggers the dice-roll UI; client resubmits the result as `type: "roll_result"`. `lib/gm-tags.js`'s `extractRoll()` tolerates an optional `[...]` around `STAT`, a space after the colon (live: `"ROLL: [AGILITY]"`), trailing whitespace, and any case — plus strips *every* stray `ROLL:` line from the display (the model has been seen prefixing its own explanation sentence with `ROLL:` too, not just the real trigger). This bit the app for real, twice: first with bracketed stats silently failing to trigger a roll, then again with the colon-space variant still slipping past the first fix. Don't tighten this back up without re-checking `tests/gm-tags.test.js`'s live-captured fixtures. |
| `[LOCATION: Name]` | all | Updates `worldState.location`; if the name matches a known location, adds it to `visited_locations` (deduped) |
| `[SCAR: Location: Label]` | all | Adds `{ id, label }` to `worldState.location_scars` (deduped by id+label) |
| `[SUGGESTIONS: a \| b \| c]` | all | Parsed by `lib/suggestions.js`, returned as the `suggestions` array; forced to `[]` server-side whenever `needsRoll` is true or `type === "roll_result"` |
| `[CONCLAVE AWARENESS: X → Y]` | resonance | `worldState.conclave_awareness = Y`. `extractCounterUpdate()` tolerates an ASCII `->` in place of `→`, extra whitespace, and case — never empirically observed failing, but cheap insurance |
| `[DISSONANCE: X → Y]` | resonance | `worldState.fen_dissonance_awakening = Y`. Same tolerance as above. |
| `[LYRA\|FEN: OldHarm → NewHarm]` | resonance | Sets that character's `harm`, via `extractResonanceHarmUpdates()` — same arrow tolerance, plus the harm word is normalized case-insensitively against `HARM_LEVELS` (`lib/gamestate.js`) and dropped entirely if it isn't a real harm level, so a typo can't silently corrupt `recover_harm`'s `HARM_LEVELS.indexOf()` lookup |
| `[ABILITY FEN\|LYRA: ability_name]` | resonance | Sets that boolean field true on the character (or decrements `lyra.magic_uses_remaining` when `ability_name === "magic"`). Not hardened against typos in `ability_name` — no live evidence of that failing yet, unlike everything else on this list |
| `[VILLAIN AWARENESS: X → Y]` | manlandia, custom | `worldState.villain_awareness = Y`. Same `extractCounterUpdate()` tolerance as CONCLAVE AWARENESS. |
| `[CURSE: X → Y]` | manlandia, custom | `worldState.curse_level = Y`. Same tolerance. |
| `[CHARACTER N: OldHarm → NewHarm]` | manlandia, custom | Sets `characters.playerN.harm`, via `extractCharacterHarmUpdates()`. **Also accepts the hero's actual name in place of "CHARACTER N"** — confirmed live in a real campaign (`"[Globak: Unhurt → Scratched]"` for a hero who should have been `CHARACTER 2`; the model prefers narrating a named hero over an anonymous slot number despite the prompt's explicit instruction not to). Same harm-word normalization as the Resonance harm tag. `public/pure.js`'s `stripGMTags()` has a matching generic `[Name: Harm → Harm]` strip so the raw tag doesn't leak into what the player sees either way. |
| `[ABILITY N: used]` | manlandia, custom | Sets `characters.playerN.ability_used = true`, via `extractAbilityUsedKeys()`. Tolerates the model padding in the ability's name (live: `"[ABILITY 1: Lucky Break used]"`) as long as the word "used" appears — but a negative lookahead means `"[ABILITY 1: Lucky Break - not used]"` (also seen live) correctly does **not** fire. |
| `[STONE FOUND: stone_id]` | manlandia only | Adds to `worldState.stones_found` (deduped); `stone_id` must be one of `STONE_IDS` in `lib/gamestate-manlandia.js` |

Never trust these tags to be well-formed — the model can omit them, duplicate them, or get creative with spacing. Every parser here is defensive (regex non-matches are silently ignored, dedup checks before pushing). When investigating a "the GM said X happened but the state didn't update" report, the fastest diagnostic is pulling the real campaign's stored `sessionLog` via `GET /api/state` and grepping for `[` — that's how every bug in this table was actually found (real transcripts, not speculation).

## Session log mechanics

- `gameState.sessionLog` is the running turn-by-turn history. `api/gm.js` sends only the most recent `MAX_HISTORY` (40) entries to the LLM as context, to bound prompt cost — the full log is still stored.
- Once `sessionLog.length > 100`, it's trimmed to the most recent 80 entries (keeps the Redis payload bounded).
- **Roll flow**: when the GM calls for a roll, both the triggering user entry and the GM's response are pushed with `.rolling = true` and are excluded from `/api/poll` results. When the client submits the roll result (`type: "roll_result"`), those flagged entries are un-flagged and their timestamps are pushed back to `Date.now() - 2` (so they still sort before the new entries being added in that same call) — this is what keeps a roll's "before" and "after" entries appearing in the right order without a real multi-turn transaction.
- **New session** (`api/state.js`, `action: "new_session"`): archives the current `sessionLog` + a player-written summary into `worldState.session_archive`, increments `session`, clears `sessionLog`, and resets per-world ability flags (Resonance: `lyra`/`fen`'s once-per-session abilities + `magic_uses_remaining`; Manlandia/custom: every `playerN.ability_used`).

## Authorization: game secret vs. adult PIN

Two independent, orthogonal checks, both simple shared-secret headers (no sessions, no tokens):

- **`X-Game-Secret`** — required on state-mutating POSTs (`api/gm.js`, `api/state.js`, `api/characters.js`, `api/campaigns.js`). Fails **open** if `GAME_SECRET` is unset (`if (gameSecret && header !== gameSecret)`) — this is existing, long-standing behavior; don't "fix" it without checking whether anything relies on local/no-env-var dev use.
- **`X-Adult-Pin`** — required on any request that touches an adult-gated world: Resonance always, or a custom campaign with `worldConfig.adult === true`. Enforced by `lib/adultgate.js`'s `checkAdultAccess(req, res, worldConfig, gameState)`, called after each handler loads state (so no extra Redis round-trip except in `api/state.js`'s POST branch, which loads state early specifically to check this). Wired into `api/gm.js`, `api/poll.js`, `api/recap.js`, `api/state.js`, `api/help.js` — every endpoint that can read or narrate world content. Unlike the game secret, this **fails closed**: if `ADULT_PIN` isn't configured, adult worlds stay locked rather than opening up. The client stores the raw PIN in `localStorage` (`adult_pin`) after a successful `/api/unlock` call and resends it on every request via `authPost()`/`authGet()` in `game.js` — same trust model as `X-Game-Secret`, just a second independent secret for a second boundary (family-wide vs. kids-vs-adult-content).
- `api/campaigns.js` GET (the world-selector listing) and `api/unlock.js` itself are deliberately **not** gated — you need to see a campaign exists (name/theme/adult flag) before you could ever supply the right PIN for it, and unlock is how you obtain the PIN check in the first place.

## Rate limiting

`lib/ratelimit.js`'s `checkRateLimit(key, limit, windowSeconds)` is a simple Redis `INCR`+`EXPIRE` fixed-window counter, applied per-`X-Forwarded-For` IP to the two endpoints that call the paid Groq API with **no** `X-Game-Secret` required: `api/help.js` and `api/recap.js` (both intentionally auth-free so kids can ask for help without a login). Limit is 10 requests/60s per IP per endpoint — generous for real use, tight enough to stop a loop from running up Groq costs. `api/gm.js` isn't rate-limited since it already requires `X-Game-Secret`.

`api/gm.js` also caps the `message` field at 1000 characters (mirrors the 500-char cap `api/help.js` already had on `question`) — there was previously no limit on the one field that reaches the LLM with no size check at all.

## Testing

`npm test` runs `node --experimental-test-module-mocks --test tests/*.test.js` — plain `node:test`/`node:assert`, zero test-framework dependency.

- **Pure modules** (`lib/suggestions.js`, `lib/recap.js`, `lib/worldconfig.js`, `public/pure.js`) are `require()`'d directly — no mocking needed.
- **API handlers** are tested by stubbing `lib/redis.js` (and `lib/gemini.js` where the handler calls the LLM) with `t.mock.module()`, then invoking the handler with a fake `req`/`res`. See `tests/helpers.js` for the shared `mockRes()`, `freshRequire()` (clears `require.cache` so a fresh mock takes effect), `statefulRedisMock()` (single-key, persists across calls within a test) and `keyedRedisMock()` (multi-key, for handlers like `api/campaigns.js` that touch more than one Redis key per request).
- **`public/game.js`** itself is not unit-tested — it's a DOM-heavy browser script with no module system. The handful of genuinely reusable, logic-only functions it used to contain (`stripGMTags`, `getPlayerDisplayName`, `formatCampaignExport`, etc.) were moved into `public/pure.js`, which is loaded as a plain global-scope script before `game.js` and doubles as a CommonJS module for tests (see the `typeof module !== "undefined"` guard at the bottom of that file, and the `defaultWorld()`/`defaultGameState()`/etc. helpers that let its functions read the browser's globals while still being safely callable with explicit args from Node). Verify DOM-dependent changes by hand or with a real browser — a mock static server + Playwright script was used to smoke-test the app during development; there's no permanent browser test in this repo.

## Env vars

All 6 that the code actually reads from `process.env`:

| Var | Used by | Purpose |
|---|---|---|
| `GROQ_API_KEY` | `lib/gemini.js` | Groq API auth |
| `UPSTASH_REDIS_REST_URL` | `lib/redis.js` | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | `lib/redis.js` | Redis REST auth |
| `GAME_SECRET` | `api/gm.js`, `api/state.js`, `api/characters.js`, `api/campaigns.js` | Shared secret required on `X-Game-Secret` header for all state-mutating POSTs |
| `ADULT_PIN` | `api/unlock.js`, `lib/adultgate.js` (used by `api/gm.js`, `api/poll.js`, `api/recap.js`, `api/state.js`, `api/help.js`) | PIN gating Resonance + adult custom campaigns, enforced server-side on every endpoint that can read/narrate world content |
| `ALLOWED_ORIGIN` | every `api/*.js` | CORS `Access-Control-Allow-Origin` (defaults to `*`) |
