# Playtest Findings — 2026-07-05

**Status: COMPLETE.** Workflow `w36fr5ron` finished; findings below are real.
Both test campaigns (`c_1783300053516`, `c_1783300063481`) were deleted from
`campaigns:index` afterward — cleanup confirmed via `GET /api/campaigns`.

## Method

6 agent personas played live turns against the real production API
(`https://manne-chronicles.vercel.app`), using two throwaway custom campaigns
created specifically for this test (no real family data touched):

**Round 1 — three "experienced player" flavors, one campaign (`c_1783300053516`):**
1. Kestra (fighter) — The Rules-Lawyer / Optimizer
2. Dorian (charmer) — The Immersive Roleplayer / Storyteller
3. Vex (scout) — The Tactician / Combat-focused player

**Round 2 — mixed experience levels, second campaign (`c_1783300063481`):**
4. Bram (leader) — The Experienced Player, paired with newer players
5. Poppy/"Sella" (mage) — The Completely New Player, never played a TTRPG before
6. Reeve (scout) — The "Played Similar" Player (narrative choice games, not tabletop)

Each persona created a character, played several resolved rounds (dice rolls,
NPC interaction, combat, inventory/ability use), and cross-checked the GM's
narration against `GET /api/state` to catch state/tag bugs, not just
narrative impressions.

**⚠️ Important test-design caveat.** Each persona-agent was instructed to
simulate all 3 player slots itself (submitting brief filler actions for the
other two slots) so it could get past the wait-for-all-players gate solo.
With 3 agents doing this at once per campaign, all 3 were actually racing to
submit to the same 3 slots concurrently — a scenario that doesn't reflect
real family usage (one person per character). This inflated some findings
below (duplicate `[SESSION BEGINS]`, characters getting overwritten,
`pending_turn` entries clobbered) — those are flagged as environmental below,
not necessarily real-world severity. The **tag-parsing and prompt-adherence
bugs are a different story**: they showed up independently in both campaigns
(which had no agents in common), so they aren't a concurrency artifact.

## Cross-cutting confirmed bugs (high confidence — seen in both campaigns, independently)

### 1. GM asks for a roll in plain prose with no `ROLL:` token at all (HIGH — seen by all 6 personas)
Live examples, verbatim: *"Roll a FORCE to see how well Kestra can hold her
ground..."*, *"Roll your PRESENCE to see if you can affect the orb..."*,
*"Rolling Bram's Force for the attack"*, *"Roll Bram's Will, as he's the one
handling the talking"*. None of these contain the literal substring `ROLL:`
that `extractRoll()` scans for (per `lib/gm-tags.js`), so `needsRoll` never
fires — confirmed via raw `sessionLog` inspection (`rollStat: null`, no
`rolling` flag). This is a new, more extreme variant of the exact
phrasing-drift problem `CLAUDE.md` already documents three prior fixes for
(bracketed stat, colon-space, mid-sentence) — but this time there's no
`ROLL:` anchor string at all, so no amount of tolerance on the existing token
can catch it; the fix would need to also recognize "Roll/Rolling
[Name's] STAT" phrasing as an implicit roll request.

**Real consequence, captured verbatim**: the new-player persona, faced with
this, actually typed *"Wait, sorry, how do I roll something? I do not have
any dice..."* as their in-character action — exactly the onboarding failure
this persona exists to catch — and the game simply proceeded past it with no
acknowledgment.

**Compounding bug**: when the GM self-resolves a "roll" itself without a real
`roll_result` ever happening, it invents stat values and gets them wrong —
e.g. narrating "with his Force of 0" for a hero whose real Force is 2, or
pairing `rollStat:"force"` with `rollPlayer:"player2"` for an action that was
narratively a different character's.

### 2. Combat tracker never activates during unambiguous physical fights (HIGH — seen by 4 personas)
A "hulking figure" charged the party; a hero "crashed into" it; another
landed a killing shot ("its chest not rising or falling," "massive body
crashing to the floor") — and `worldState.combat` stayed
`{"active":false,"round":0,"enemies":[]}` for the entire encounter in round
1. No `[COMBAT START]`, `[ENEMY:...]`, or `[ENEMY DEFEATED]` ever fired
despite narration that any player would call a boss fight. In round 2,
`[COMBAT START]` *did* fire but tracked only 2 generic enemies ("Scarred
Man", "Bandit Gang") while the narration described 4 distinct combatants,
and enemy harm/defeat state never updated even after the narration explicitly
killed one ("The Scarred Man collapses to the ground, defeated" — enemy
entry still showed `harm:"Unhurt", defeated:false`). One persona had to
manually invoke `action:"end_combat"` to close a fight the narration had
already resolved three rounds earlier.

### 3. Malformed `[CHARACTER N]`/`[ABILITY N]` tags with a name inserted before the colon (MEDIUM-HIGH — new drift pattern, not yet in production)
Live format seen repeatedly: `[CHARACTER 1 (Kestra): Harm: Unhurt]` and
`[ABILITY 1 (Kestra): Protect Friend used]` — a `(Name)` parenthetical
inserted between the number and the colon. This breaks parsing outright:
`extractCharacterHarmUpdates()`/`extractAbilityUsedKeys()`'s regexes require
the colon to directly follow the digit (`(\d):`), so these don't match at
all — confirmed live: `ability_used` stayed `false` even after the ability
tag was emitted. Also breaks `public/pure.js`'s strip pattern, so it would
leak as literal bracket-text in the real UI. **This has not shown up in real
production data** (checked via `npm run check-drift` against Resonance,
Manlandia, and all 3 real custom campaigns — see below) — it's a real,
reproduced failure mode, just not one that's bitten real play yet.

### 4. Item pickup and location-change tags rarely/never fire despite clear narration (MEDIUM — seen by 5 personas)
A key, scrolls, an orb, gold coins, and a "crystal-enhancing pendant" were
all explicitly picked up/carried in narration across both campaigns —
`worldState.inventory` stayed `[]` the entire time in every case, no
`[ITEM FOUND: ...]` ever fired. Similarly, round 2's party reached and
stayed in a named town ("Willowdale") and tavern ("The Red Stallion") for 3+
rounds with `worldState.location` frozen at the default `"The Beginning"` —
no `[LOCATION: ...]` tag fired despite unambiguous location narration.

### 5. `[SUGGESTIONS: ...]` essentially never populates as structured data (MEDIUM — seen by 3 personas)
The `suggestions` array came back `[]` on nearly every response, even when
the narration text itself contained a clear "▶ What do you do? → option /
option / option" menu written as plain prose instead of the bracket tag. Any
client UI that renders clickable suggestion chips from the structured field
(rather than parsing prose) would have nothing to show for most of both
sessions.

### 6. `type: "begin"` is not idempotent (MEDIUM — confirmed, though severity inflated by the test-harness caveat above)
Nothing rejects or no-ops a second `[SESSION BEGINS]` once the log already
has content — each resubmission generates a brand-new, unrelated opening
scene. In round 1, this produced 3 contradictory openings in the same
`sessionLog`, one narrating characters ("Bram", "Sella") that were never
actually created. The model even noticed its own confusion mid-session
("It seems we've started again, let's get back to it...") but the app let it
happen anyway. Real risk even outside this test's concurrency artifact: any
accidental double-tap or retry on a slow connection could trigger this.

## Supplementary check against real production data

Ran `npm run check-drift` (the repo's existing live-transcript tag auditor)
against Resonance, Manlandia, and all 3 real custom campaigns
(`c_1782834686899` "Dark wars", `c_1783000788254` "Stratustopia",
`c_1783002979813`). **Good news**: none of the malformed tag shapes from
finding #3 above appear in real play — every bracket tag in production
matches an already-known, already-tolerated format (`[LOCATION: ...]`,
`[CHARACTER N: Old → New]`, `[CURSE: X → Y]`, `[VILLAIN AWARENESS: X → Y]`,
`ROLL: [AGILITY]`, etc., including formats CLAUDE.md already documents as
handled).

I also scanned every real GM entry for the word "roll" appearing without a
`ROLL:` tag nearby, to check whether finding #1 is already happening in real
play. Most hits are legitimate — narration correctly resolving an
already-submitted roll ("With a roll of 13 on Acuity, Fen's observation
powers..."), which needs no tag since it's not requesting a new roll. A
**small number of entries in the two long-running custom campaigns** read
more ambiguously (e.g. "You try to roll to see what the noise is... With an
Acuity roll of 7, you focus..." appearing as one GM turn with no clearly
preceding roll_result) and are worth a manual read-through of those specific
timestamps if this bug gets prioritized — I did not have time to fully
correlate each one against the exact preceding request/response pair.

## Architecture findings (real, but test-harness inflated the *frequency* observed)

- **No per-slot ownership or optimistic locking on `POST /api/characters`.**
  A second write to the same player slot silently overwrites the first with
  no "already exists"/conflict warning. In this app's real single-secret
  shared-household model this is a known, accepted tradeoff (per
  `CLAUDE.md`'s authorization section) — flagging because the playtest made
  the blast radius concrete (an in-progress hero's name/backstory/ability
  silently vanishing), not because it's news that the app trusts everyone
  with the shared secret.
- **`pending_turn` entries for a slot can be silently overwritten with no
  signal distinguishing "I changed my mind" from "someone else submitted as
  me."** Documented, intended behavior for the first case; the second case
  is only reachable if two people actually share one character's submissions,
  which isn't the app's intended usage pattern.

## Positive findings — things that worked and are worth explicitly *not* touching

- **Wait-for-all-players merge gating held up perfectly under real, messy,
  concurrent load** — every `{"waiting":true,"waitingOn":[...]}` response was
  accurate, and merged turns cleanly credited every contributor even with 3+
  agents hammering the same campaign at once. Praised independently by all 6
  personas.
- **Concurrency-safety mechanisms fired exactly as documented under genuine
  concurrent load**: both the duplicate-`roll_result` rejection (`"This roll
  was already resolved"`) and the per-world `gmlock` (`"Another turn just
  came in for this world"`) were organically triggered and worked correctly
  — real validation beyond single-player theory.
- **Deferred-tag-on-roll design confirmed working**: `[LOCATION: ...]` only
  landed in `visited_locations` right after a pending roll resolved, never
  before, verified via direct state inspection.
- **`action:"end_combat"` manual escape hatch worked perfectly** — exactly
  the "AI narration and mechanical state diverged, let the player fix it"
  safety valve this session needed and used for real.
- **Character voice differentiation and narrative quality were genuinely
  strong** across both campaigns — distinct personalities per hero, and the
  GM built real emergent plot on top of player-initiated roleplay rather than
  ignoring it.
- **Archetype-driven character creation is good low-friction onboarding** —
  sensible stat spreads with zero manual setup, praised specifically by the
  "paired with a novice" persona as removing a barrier for new players.

## Suggested triage (my recommendation — not a decision, that's yours)

Roughly in priority order if you want to act on any of these:

1. **Finding #3 (malformed tag shape) is the cheapest, lowest-risk fix** —
   same pattern as the `CHARACTER N (Name)` tolerance already added for harm
   tags elsewhere in `lib/gm-tags.js`. Small, contained regex change.
2. **Finding #1 (roll request without `ROLL:`) is the highest-impact but
   hardest to fix well** — it's a prompt-adherence problem, not just a
   parser-tolerance one; the model needs to reliably emit the trigger, not
   just have the trigger recognized in more shapes. Worth a prompt-wording
   pass in all three prompt files before (or alongside) any parser change.
3. **Finding #2 (combat never activating)** is probably the single biggest
   gap versus what the app promises (a whole tracked-combat feature that
   silently never engages) — likely needs the same prompt-wording attention
   as #1, since the underlying data model and UI already work correctly once
   the tags actually fire.
4. **Findings #4/#5 (items/location/suggestions not firing)** are lower
   urgency — cosmetic/completeness gaps rather than broken mechanics — but
   cheap to bundle into the same prompt-wording pass if you're already in
   there.
5. **Finding #6 (begin not idempotent)** is a quick, low-risk guard to add
   independent of everything else (reject/no-op a `begin` if `sessionLog`
   already has content).
6. Architecture findings — no action suggested; these reflect the app's
   existing, accepted trust model.

## Raw per-persona notes

Full unedited notes from each of the 6 personas are preserved in this
session's workflow journal:
`C:\Users\mmanne\.claude\projects\C--Users-mmanne-OneDrive---Harvard-Business-School-Desktop-Personal-Manne-Chronicles\13bd3cf7-16b8-4eb2-a756-56c8c4d34189\subagents\workflows\wf_b7d38e80-cd1\journal.jsonl`
