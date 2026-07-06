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

### Review the remaining 2026-07-05 playtest findings
Three of the six confirmed findings are now fixed (see Resolved below):
malformed `(Name)`-padded `CHARACTER`/`ABILITY` tags, the roll-request-with-
no-`ROLL:`-anchor bug (the headline finding), and combat tracking. The
combat fix is implemented and tested but **not yet deployed** — see the
Resolved entry for what it does and why a parser-side fallback (unlike the
roll fix) was deliberately not attempted.

Still open, in suggested priority order — full detail in
`playtest_findings_2026-07-05.md`:
1. Items/location tags and `[SUGGESTIONS: ...]` not firing reliably —
   lower urgency, cosmetic/completeness gaps. Live evidence of the
   `SUGGESTIONS` gap specifically surfaced again during this session's
   deployment verification: the model wrote `(SUGGESTIONS: ...)` with
   parentheses instead of `[SUGGESTIONS: ...]` brackets.
2. `type: "begin"` not being idempotent — quick, low-risk guard.
- **What's needed from you**: same "real bug vs. accepted quirk" judgment
  call as everything else in this doc — pick what's next, or say "all of it."

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
  (playtest finding #2)**: implemented, not yet deployed. Two changes: (1)
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
