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

The GM's raw LLM response is plain narration plus optional bracket tags on their own lines at the end. All parsing happens in one place: `api/gm.js`, after the response comes back from `lib/gemini.js`. Every prompt file (`lib/prompt.js`, `lib/prompt-manlandia.js`, `lib/prompt-custom.js`) instructs the model to emit whichever of these apply, in a "STATE NOTATION" block.

| Tag | Worlds | Effect |
|---|---|---|
| `ROLL:STAT[:ADVANTAGE]` | all | Not a bracket tag — a bare line. Triggers the dice-roll UI; client resubmits the result as `type: "roll_result"`. |
| `[LOCATION: Name]` | all | Updates `worldState.location`; if the name matches a known location, adds it to `visited_locations` (deduped) |
| `[SCAR: Location: Label]` | all | Adds `{ id, label }` to `worldState.location_scars` (deduped by id+label) |
| `[SUGGESTIONS: a \| b \| c]` | all | Parsed by `lib/suggestions.js`, returned as the `suggestions` array; forced to `[]` server-side whenever `needsRoll` is true or `type === "roll_result"` |
| `[CONCLAVE AWARENESS: X → Y]` | resonance | `worldState.conclave_awareness = Y` |
| `[DISSONANCE: X → Y]` | resonance | `worldState.fen_dissonance_awakening = Y` |
| `[LYRA\|FEN: OldHarm → NewHarm]` | resonance | Sets that character's `harm` |
| `[ABILITY FEN\|LYRA: ability_name]` | resonance | Sets that boolean field true on the character (or decrements `lyra.magic_uses_remaining` when `ability_name === "magic"`) |
| `[VILLAIN AWARENESS: X → Y]` | manlandia, custom | `worldState.villain_awareness = Y` |
| `[CURSE: X → Y]` | manlandia, custom | `worldState.curse_level = Y` |
| `[CHARACTER N: OldHarm → NewHarm]` | manlandia, custom | Sets `characters.playerN.harm` |
| `[ABILITY N: used]` | manlandia, custom | Sets `characters.playerN.ability_used = true` |
| `[STONE FOUND: stone_id]` | manlandia only | Adds to `worldState.stones_found` (deduped); `stone_id` must be one of `STONE_IDS` in `lib/gamestate-manlandia.js` |

Never trust these tags to be well-formed — the model can omit them, duplicate them, or get creative with spacing. Every parser here is defensive (regex non-matches are silently ignored, dedup checks before pushing).

## Session log mechanics

- `gameState.sessionLog` is the running turn-by-turn history. `api/gm.js` sends only the most recent `MAX_HISTORY` (40) entries to the LLM as context, to bound prompt cost — the full log is still stored.
- Once `sessionLog.length > 100`, it's trimmed to the most recent 80 entries (keeps the Redis payload bounded).
- **Roll flow**: when the GM calls for a roll, both the triggering user entry and the GM's response are pushed with `.rolling = true` and are excluded from `/api/poll` results. When the client submits the roll result (`type: "roll_result"`), those flagged entries are un-flagged and their timestamps are pushed back to `Date.now() - 2` (so they still sort before the new entries being added in that same call) — this is what keeps a roll's "before" and "after" entries appearing in the right order without a real multi-turn transaction.
- **New session** (`api/state.js`, `action: "new_session"`): archives the current `sessionLog` + a player-written summary into `worldState.session_archive`, increments `session`, clears `sessionLog`, and resets per-world ability flags (Resonance: `lyra`/`fen`'s once-per-session abilities + `magic_uses_remaining`; Manlandia/custom: every `playerN.ability_used`).

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
| `ADULT_PIN` | `api/unlock.js` | PIN gating Resonance + adult custom campaigns |
| `ALLOWED_ORIGIN` | every `api/*.js` | CORS `Access-Control-Allow-Origin` (defaults to `*`) |
