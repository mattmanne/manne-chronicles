# Backlog & Pending Decisions

Reconstructed 2026-07-05 from references scattered through `CLAUDE.md` — a prior
version of this file (and the memory notes `CLAUDE.md` links to,
`[[project_resonance_v2]]` / `[[project_data_safety]]`) appears to have been
lost. If you have the original content saved somewhere, it's worth diffing
against this reconstruction; otherwise treat this as the new source of truth
going forward.

Each item below is either (a) a real design decision only Matt can make, or
(b) a known, deliberately-deferred gap that's fine to leave alone until it
actually matters. Resolved items should move to a "Resolved" section at the
bottom with the decision and date, not just get deleted — so future-us can see
what was already decided instead of re-litigating it.

## Pending decisions (need a call)

_(none open right now — see Resolved below)_

### 2026-07-05 playtest: closed out
All six confirmed findings from the 2026-07-05 live playtest are now fixed,
deployed, and verified live (see the individual Resolved entries below):
malformed `(Name)`-padded `CHARACTER`/`ABILITY` tags, the roll-request-with-
no-`ROLL:`-anchor bug (the headline finding), combat tracking, item/location
tags, `[SUGGESTIONS: ...]` parentheses drift, and `begin` idempotency.

Two of these (combat tracking, item/location tags) are prompt-adherence
mitigations, not compliance-independent parser fixes the way the roll-tag
fix is — they make the model more likely to comply, but can't be
definitively confirmed working from a single non-deterministic live call.
Worth an `npm run check-drift` re-check on both once more real combat/
location/item transcripts exist from actual family play.

## Known simplifications, deliberately deferred

These are accepted gaps, not bugs — revisit only if real usage shows they
matter, per this app's established "ship first pass, refine after live data"
pattern.

- **No "update an existing NPC" tag.** `[NPC: Name: Description]` skips a
  repeat name rather than updating it.
- **No clue-to-clue relationships.** Can't express "this clue contradicts
  clue X" — each clue is tracked independently.
- **No background/mood music.** Sound effects (`playTone()`) only; looping/
  crossfade music was judged a real problem, not a quick addition.
- **`scene_pin` (Resonance private-scene PIN) is checked client-side and
  travels in plaintext** on ordinary API responses. A 2026-07-05 security
  review flagged moving verification server-side; Matt's call was that it's
  overkill for what the feature actually protects (a UX device between two
  people who trust each other, not real access control). Deliberately left
  as-is — don't "fix" without checking with him first.
- **Catch-up banner's "last seen" is per-device, not per-player globally**
  (2026-07-19). `checkCatchUp()` in `public/game.js` uses a `localStorage`
  timestamp, so a player alternating between two devices gets independent
  tracking on each and could see the "welcome back" banner on one device the
  same day they played on the other. Fixing this for real would need a
  server-side per-character `last_seen_at` field (a new write on every turn)
  — deferred as not worth the cost for a nice-to-have nudge. Revisit only if
  it proves genuinely annoying in practice.
- **Optimistic-entry rollback doesn't cover a roll-then-fail sequence.**
  (2026-07-19) If a roll-triggered action's first leg succeeds but the
  recursive `roll_result` leg then fails, only the original action's
  optimistically-appended log line is removed — the separate roll-result
  entry added in between is left in place. Rare (two round-trips have to
  succeed-then-fail back to back); not fixed, revisit if it shows up live.
  See CLAUDE.md's "Action input box" section.

## Known platform limits (not fixable by us)

- **iOS Safari-tab push notifications don't work.** Apple only allows Web
  Push for a home-screen-installed PWA, not a regular Safari tab (since iOS
  16.4). Documented for players in `README.md`.

## Resolved

- **2026-07-05 — "Leads" tag naming/scope**: keep as "Leads", stays universal
  across all world types. Rationale: any world's story can raise an open
  question worth tracking, not just mystery-flavored ones — a kid custom
  campaign can have a "who has the map" lead as easily as Resonance has
  conclave intrigue. No code change.
- **2026-07-05 — Custom-world map**: keep the snake-path quest-trail graph as
  the permanent answer; not pursuing AI-generated map art. No code change.
- **2026-07-05 — Hero customization + level-up moments**: approved as shipped,
  final design. No code change.
- **2026-07-05 — Illustrated Storybook idea**: shelved, not being scoped.
  Revisit only if it comes up again independently.
- **2026-07-05 — Bonus ability used-tracking**: implemented. Each unlocked
  bonus ability now has its own once-per-session used/available state
  (`character.bonus_abilities_used`), separate from the starting ability's
  `ability_used`. See `CLAUDE.md`'s "Character growth (XP)" and "Manual
  ability/magic toggles" sections for the full mechanism. 435/435 tests pass
  (12 new/updated). Not yet verified against a real multi-ability live
  transcript — worth a `npm run check-drift` pass once one exists.
- **2026-07-05 — Stuck Manlandia roll**: checked the real live `sessionLog`
  (`GET /api/state?world=manlandia`, 34 entries) for any `rolling: true`
  entry — found none, and `worldState.pending_turn` is empty too. The stuck
  entry `CLAUDE.md` referenced (as of 2026-07) is no longer present, most
  likely aged out naturally as new turns were played since. No repair
  needed; no code or data change made.
- **2026-07-06 — Malformed `(Name)`-padded CHARACTER/ABILITY tags (playtest
  finding #3)**: fixed. `lib/gm-tags.js`'s `extractCharacterHarmUpdates()`
  and `extractAbilityUsedKeys()` now tolerate a `(Name)` parenthetical
  between the number and colon, plus a literal `Harm:` label before the harm
  word — matching `public/pure.js`'s `stripGMTags()` so it doesn't leak into
  display either. 9 new tests, 448/448 pass. Deployed and verified live
  2026-07-06.
- **2026-07-06 — Roll request with no `ROLL:` anchor at all (playtest
  finding #1, headline finding)**: fixed. `extractRoll()` now falls back to
  a natural-language scan for "Roll(ing) [.../Name's] STAT" phrasing when no
  literal `ROLL:` tag is found, resolving stat + roller the same way the
  explicit tag does. Verified against every real "roll"-mentioning
  production GM entry with zero false positives. 8 new tests, 448/448 pass.
  Deployed and verified live 2026-07-06 (byte-check on the deployed `pure.js`, a live GM round-trip against the Dark Wars test campaign, and a clean `check-drift` pass).
- **2026-07-06 — Roll-trigger prompt-wording reinforcement (belt-and-
  suspenders alongside the parser fallback above)**: all three prompt files
  (`lib/prompt.js`, `lib/prompt-manlandia.js`, `lib/prompt-custom.js`) now
  give a concrete ✗ WRONG / ✓ RIGHT example pair right after the existing
  "MUST include the ROLL:STAT line" instruction, directly targeting the
  exact failure phrasing observed live ("Roll a Force to see if you can
  hold your ground" with no follow-up trigger line). The parser fallback
  means this isn't load-bearing for correctness anymore, but a model that
  reliably emits the real tag is strictly better (real dice math, proper
  advantage/roller-name support) than one that only gets caught by the
  fallback. 448/448 tests still pass (no test asserts exact prompt text).
  Deployed and verified live 2026-07-06 (byte-check on the deployed `pure.js`, a live GM round-trip against the Dark Wars test campaign, and a clean `check-drift` pass).
- **2026-07-06 — Combat tracker not engaging / drifting out of sync
  (playtest finding #2)**: deployed and verified live 2026-07-06 (a live
  combat-themed GM round-trip against the Dark Wars test campaign completed
  cleanly with no crash, plus a clean `check-drift` pass). Two changes: (1)
  `lib/prompt-shared.js`'s new `buildCombatStatusBlock(ws)`, wired into all
  three prompt files, echoes the live combat state (round number, every
  tracked enemy's current harm/defeat) back to the model every turn — the
  same way character harm already was via `charLine()`, but enemy state
  never was, so the model had no anchor for what it still owed the tracker.
  (2) All three prompt files' COMBAT instructions gained a concrete ✗ WRONG
  / ✓ RIGHT example pair targeting the exact observed failure (a clear
  physical clash narrated with zero tags). Deliberately **not** attempted: a
  parser-side fallback like the `ROLL:` fix got — "a fight is starting" has
  no narrow, reliable grammatical signal the way "a roll is being requested"
  does, so a regex-based combat-start detector would carry real false-
  positive risk with no clear bound. Both changes here are prompt-adherence
  mitigations only. 6 new tests, 454/454 pass.
- **2026-07-06 — `[SUGGESTIONS: ...]` parentheses drift (playtest finding
  #5)**: fixed. `lib/suggestions.js`'s `extractSuggestions()` and
  `public/pure.js`'s `stripGMTags()` now both tolerate the tag wrapped in
  parentheses instead of brackets — live evidence came from this session's
  own deployment-verification calls (twice): `"(SUGGESTIONS: a | b | c)"`
  instead of `"[SUGGESTIONS: a | b | c]"`, silently dropped by the original
  bracket-only regex. Same "parser tolerance" pattern as the CHARACTER/
  ABILITY `(Name)` padding fix — cheap, low-risk, no prompt change needed.
  2 new tests, 457/457 pass. Deployed and verified live 2026-07-06 (byte-check on the deployed `pure.js`, a live GM round-trip, and a clean `check-drift` pass).
- **2026-07-06 — `type: "begin"` not idempotent (playtest finding #6)**:
  fixed. `api/gm.js` now checks `sessionLog.length > 0` before calling Groq
  for a `begin` submission and returns `{ alreadyBegun: true, gameState }`
  as a true no-op if the campaign already has content — not an error, since
  a duplicate begin from a device race isn't a client bug worth surfacing.
  `public/game.js`'s `sendToGM()` handles it the same way it already
  handles `data.waiting` (resync state, append nothing). 1 new test,
  457/457 pass. Deployed and verified live 2026-07-06 — confirmed directly
  by calling `type: "begin"` against the real Dark Wars test campaign
  (which already has content) and getting back `{"alreadyBegun":true}` with
  no Groq call and no new sessionLog entry. Unlike the combat/item-location
  mitigations, this one *is* definitively verifiable, and was.
- **2026-07-06 — Item/location tags not firing reliably (playtest finding
  #4)**: mitigated via prompt reinforcement, same treatment/reasoning as the
  combat fix above (no parser-side fallback attempted — no narrow, reliable
  grammatical signal for "the party moved" or "the party picked something
  up" the way there is for a roll request). All three prompt files' LOCATION
  CHANGE and ITEM(S) instructions gained a concrete ✗ WRONG / ✓ RIGHT example
  pair targeting the exact failures observed live (a real move or a clear
  pickup narrated with zero tags). Deployed 2026-07-06; a live verification
  round-trip completed cleanly with no crash, though (same limitation as
  combat) the fix's actual effectiveness can't be proven from one
  non-deterministic call.
- **2026-07-19 — Catch-up recap batch**: (1) added a "🔊 Listen" read-aloud
  button to the recap overlay, reusing the existing per-entry speech
  machinery via a new shared `setSpeakBtnIcon()` helper so a labeled button
  and icon-only buttons can coexist without either clobbering the other's
  text. (2) Rewrote the recap prompt from a per-viewer second-person POV
  (`"you" = whichever character requested it`) to a universal third-person
  narration naming every character — Matt found the POV version still didn't
  read naturally for whichever hero actually picked it up. The now-unused
  `?player=` param and `getPlayerDisplayName` wiring were removed from
  `api/recap.js` rather than left as dead code. 456/456 tests pass (2 tests
  rewritten for the new prompt shape). Verified in a headless-browser pass
  (Playwright against a local static server, since `vercel dev` isn't
  available in this environment) — screenshots confirmed the banner, the
  recap overlay, and the Listen button's icon/label swap all render
  correctly; not yet deployed/checked against the live site.
- **2026-07-19 — Voice input silently failing (parent report: "didn't work on
  an iPad, might be user error")**: iOS Safari has supported
  `webkitSpeechRecognition` since 14.5, so the mic button itself was never
  the problem — `recognition.onerror` swallowing every failure with zero
  user-facing feedback was. Now shows a specific message for a blocked mic
  permission and a generic one for anything else, auto-hiding after 4s. See
  CLAUDE.md's "Voice input" section for the `onend`-after-`onerror` ordering
  gotcha this ran into.
- **2026-07-19 — Draft text carrying over between worlds**: `switchWorld()`
  now clears `#action-input` and any visible suggestion chips on every
  switch — previously a half-typed draft in one world's box was still there
  after switching to an unrelated world, since the box is one shared DOM
  element with no per-world state of its own.
- **2026-07-19 — Failed send leaving a contradictory UI state**: a failed
  `submitAction()` already restored the typed text to the input box for easy
  resending, but also left the optimistically-appended player line sitting in
  the story log — reading as "this both did and didn't happen." The
  optimistic log entry is now removed on failure, matching the restored
  input box. Root cause of the specific failure that surfaced this
  (`Error: Unauthorized`) is almost certainly a stale/mismatched
  `X-Game-Secret` on that player's device — see the Env vars / Authorization
  sections of CLAUDE.md; the fix here is about the UI's failure *display*,
  not that underlying cause.
- **2026-07-19 — Action input box auto-resize**: `#action-input` changed
  from a single-line `<input>` to an auto-growing `<textarea>` so a
  multi-line action (typed or spoken) stays fully visible instead of
  scrolling sideways. Shift+Enter now inserts a real newline as a side
  effect of the element-type change. See CLAUDE.md's "Action input box"
  section for the implementation (`autoResizeActionInput()`,
  `setActionInputValue()`).
- **2026-07-19 — Groq rate-limit hit tracking**: added after Matt hit the
  free tier's limit despite little play. `lib/groq-tracking.js` records
  every player-visible Groq-quota failure to Redis; `GET /api/groq-stats`
  and `scripts/check-groq-ratelimit.js` surface total/24h/7d/by-world
  frequency. Matt's call was to stay on the free tier for now and monitor —
  see CLAUDE.md's "Rate limiting" section and the `project_groq_ratelimit_monitoring`
  memory note (check it — and this data — before that topic comes up again,
  rather than re-estimating from scratch). 9 new tests, 465/465 pass.
