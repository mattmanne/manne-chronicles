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

### Review the 2026-07-05 playtest findings
Ran a 6-persona live playtest (3 "experienced player" flavors in one round,
then an experienced/newcomer/genre-transfer trio in a second round) against
two throwaway custom campaigns on the real production API — dice rolls,
combat, inventory, growth unlocks, the whole loop. Cross-checked against real
production transcripts (`npm run check-drift` + a manual roll-mention scan)
to see which findings are reproduced-but-not-yet-live vs. already happening
in real play.

- **Findings are ready**: `playtest_findings_2026-07-05.md` (repo root) —
  6 confirmed cross-cutting bugs (ranked by corroboration/severity), a
  production-data cross-check, architecture notes, positive findings worth
  protecting, and a suggested (not decided) triage order.
- **Headline finding**: the GM asks for a dice roll in plain prose with no
  `ROLL:` token at all (e.g. "Roll a FORCE to see how well Kestra can hold
  her ground") — a new, more extreme variant of a phrasing-drift problem
  `CLAUDE.md` already documents three prior fixes for. Independently
  reproduced by all 6 personas across both separate test campaigns.
- **What's needed from you**: read `playtest_findings_2026-07-05.md` and
  decide which findings are worth fixing vs. accepting — same "real bug vs.
  accepted quirk" judgment call as everything else in this doc. Nothing has
  been fixed yet; only investigated and documented.

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
