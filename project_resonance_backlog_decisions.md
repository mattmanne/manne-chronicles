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

### 2026-07-21: further story-log UX ideas, not yet decided
Matt asked for the story log to use more of the screen width and to make the
story easier to follow without scrolling as much. Three rounds shipped same
day (see Resolved below — the responsive `--content-max` width, then the
wide-screen party/location/threads sidebar after Matt reviewed a screenshot
and found the first pass still wasted space, then a collapsible mobile
counterpart to the sidebar) — all three are now on `main` and pushed to
`origin/main`. Three further ideas were floated but not yet requested —
evaluate later, pick whichever (if any) are still worth it once the current
shape has been used for a while:

- **Tighter narration spacing.** Reduce the gap between log entries so more
  turns fit on screen at once, without shrinking the actual reading font.
- **"Jump to latest" button.** Appears once you've scrolled up from the
  bottom of the story log, instead of relying on scrolling all the way down
  by hand.
- **Auto-collapse older sessions.** Collapse story content from before the
  current session by default (expandable on tap) — mainly useful once a
  campaign has a long history.

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

- **2026-07-21 — Story log too narrow / too much scrolling on larger
  screens, round 1**: `#app`'s max-width changed from a fixed 680px to a
  responsive `--content-max: clamp(680px, 92vw, 1100px)` in
  `public/style.css`, applied to `#app` and the two bottom-sheet overlays
  that mirror its width (`.help-box`, `.end-session-box`); `.recap-box` (a
  separate centered modal) got a smaller matching clamp,
  `clamp(420px, 90vw, 720px)`. On phones this is a no-op (the clamp floor
  never forces the layout wider than the actual viewport), but on
  tablets/desktops the reading column now grows with the screen instead of
  sitting fixed at 680px with large empty margins. Verified visually via a
  headless Playwright pass against a local static server (`vercel dev` isn't
  available in this environment): `#app` measured 390px wide at a 390px
  mobile viewport (unchanged) and 1100px wide at a 1600px desktop viewport
  (was 680px before), with no overflow or clipping in the header, tabs, or
  input row at either size.
- **2026-07-21 — Story log too narrow, round 2 (wide-screen sidebar)**: Matt
  reviewed a screenshot on a genuinely wide monitor (1880px browser window)
  and found round 1 still left large empty gutters outside the 1100px-capped
  `#app`, while the narration lines inside it (already ~150+ characters at
  that width) were already too long for comfortable reading — pushing the cap
  higher would have shrunk the gutters at the cost of even longer lines, a
  straight tradeoff with no good single number. Asked Matt which way to
  resolve that tradeoff (`AskUserQuestion`); he chose putting the reclaimed
  width to use rather than just stretching text further. Shipped: `#tab-story`
  now splits into a row layout at `min-width: 1100px` — the existing content
  moved into a new `#story-main` column, with a new `<aside id="story-sidebar">`
  next to it (`public/index.html`, `public/style.css`, `public/game.js`'s new
  `renderStorySidebar()`, wired into the existing `updateCharacterUI()` so it
  stays in sync for free with every poll/turn/initial load). The sidebar shows
  party harm status (reusing `getRealCharacterKeys()`/`getPlayerDisplayName()`
  from `public/pure.js`, same "real character" definition as the waiting-on
  banner), current location, and up to 5 open Objectives/Leads merged into one
  condensed list (`worldState.objectives`/`.clues`, both already in the poll
  payload via `buildWorldStatePayload()` — no new API surface needed) with a
  "+N more — see Map tab" note if truncated, no data loss. `--content-max`'s
  cap raised from 1100px to 1400px alongside this, since past the sidebar
  breakpoint the extra width splits between sidebar and log instead of only
  lengthening narration lines. Below 1100px, layout is byte-for-byte the
  round-1 single-column shape (`#story-sidebar` is `display:none`). Verified
  visually (headless Playwright, fake `worldState`/`characters` driven through
  the real `updateCharacterUI()` render path): sidebar correctly hidden at
  390px/1000px, shown at 1600px/2200px with harm chips colored per level,
  location, and open threads all rendering; no overflow at either breakpoint
  or at an extreme 2200px viewport. Three further UX ideas (tighter log
  spacing, a "jump to latest" button, auto-collapsing older sessions) were
  floated but not requested — see the Pending decisions section above.
- **2026-07-21 — Story log, round 3 (mobile counterpart to the sidebar)**:
  after reviewing round 2 on a preview deployment, Matt asked whether the
  same party/location/threads info could be visible on a phone too without
  disturbing the existing compact mobile layout. The sidebar itself only
  fits above 1100px, so a collapsible summary was added instead: a
  `#story-summary-toggle` button next to the existing Recap button
  (`📍 <location> ▾`), which expands `#story-summary-panel` in place on tap
  — collapsed by default, so a phone's Story tab looks exactly like it
  always did until a player actually taps it. `buildStorySummaryHTML()` was
  extracted out of `renderStorySidebar()` so both the desktop sidebar and
  this mobile panel render from the exact same function and can never show
  different info. Force-hidden via the same `min-width: 1100px` breakpoint
  once the real sidebar takes over, so the two never appear at once.
  Verified visually (headless Playwright): collapsed state shows just the
  location next to Recap at 390px width; tapping it expands to the full
  party/location/threads content with the chevron flipping; at 1600px both
  the toggle and panel are correctly force-hidden while the sidebar shows
  instead. **Update**: all three rounds (this one plus the two below) are
  committed directly to `main` and pushed to `origin/main` (`git log` shows
  no separate preview branch remains) — per `CLAUDE.md`'s "Vercel auto-deploys
  on push to main," this is live in production now, not sitting on a preview
  branch awaiting a merge decision.
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
- **2026-07-19 — "Underseas bleeding into other worlds" report**: investigated
  by pulling the real live data (Matt shared `GAME_SECRET` directly for this).
  Read Underseas' entire stored sessionLog (8 entries) plus its NPCs/
  objectives/clues/inventory/location — everything traced back cleanly to
  its own theme (a pearl, an underwater kingdom, an ancient door with
  whispers behind it warning of a "Great Dark"). Cross-checked Stratustopia
  and Flabbershock for any of Underseas' specific content (none found) and
  noticed something genuinely interesting instead: both those campaigns
  *also* independently feature a near-identical "whispers behind a locked/
  hidden door, guarding secrets" beat (Flabbershock literally has both a
  "Tree of Whispers" and "Library of Whispers"). Conclusion: not a data
  bleed — the underlying model (Llama 3.3 70B) just has a recurring generic
  fantasy-RPG narrative habit it reaches for across unrelated campaigns,
  which can feel like cross-contamination without actually being any. No
  code change needed for the reported symptom itself.
- **2026-07-19 — Custom campaign ID collision risk (found during the above
  investigation, unrelated to its actual cause)**: fixed. `api/campaigns.js`'s
  `create` action generated ids as a bare `c_${Date.now()}` with no
  collision protection — two creates in the same millisecond would get an
  identical id and silently share one Redis key from then on. Checked: none
  of the 5 live campaigns currently collide, so nothing is corrupted today.
  Now `c_<timestamp>_<8-char random hex>` via `crypto.randomUUID()`,
  guaranteeing uniqueness regardless of request timing. 1 new test
  (two same-millisecond creates get distinct ids and independent gamestate),
  1 existing test's regex updated to match the new id shape. 466/466 pass.
  See CLAUDE.md's "World routing" section.
- **2026-07-19 — Underseas investigation, follow-up**: Matt also shared
  `ADULT_PIN` so the two adult-flagged campaigns (Dark Wars, Pirate teat)
  could be checked too, closing the loose end from the entry above. Same
  result — no Underseas-specific content in either, and both *also*
  independently feature the same "whispering = tension" narrative habit
  (Dark Wars has a near-identical "faint whispering... from the other side
  of the door" beat). Fully confirms the "generic model habit, not a bleed"
  conclusion across all 5 live campaigns, not just the 2 non-adult ones.
- **2026-07-19 — Closeout findings**: running the full closeout routine
  (syntax check, tests, live `check-drift`) surfaced two real issues, both
  fixed same-day:
  1. **`[LOCATION CHANGE]` leaking into player-facing narration.** The
     prompt files' own instruction section is literally labeled "LOCATION
     CHANGE:" (plain prose) — live evidence (Underseas) showed the model
     echoing that label back as a bracket tag of its own, right before the
     real `[LOCATION: Name]` tag. Not real notation (`lib/gm-tags.js` never
     parses it), so nothing was stripping it from display either.
     `stripGMTags()` now strips the bare marker too. Display-only fix — no
     data migration needed, since stripping happens at render time against
     whatever's already stored. 1 new test.
  2. **Groq rate-limit tracking had a gap.** The tracking shipped earlier
     today only instrumented `api/gm.js`; a live recap call failed from the
     exact same Groq quota (the *daily* token cap this time, a separate
     dimension from the per-minute one discussed earlier — 99,066/100,000
     used) during this same closeout, exposing that `api/recap.js` wasn't
     wired in. Fixed — both endpoints now record hits. 1 new test.
  468/468 tests pass after both fixes.
