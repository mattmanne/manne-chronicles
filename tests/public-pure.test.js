const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  HARM_LEVELS, isManlandiaLike, withWorld, getPlayerDisplayName, stripPlayerPrefix,
  formatRollMessage, stripGMTags, getCleanText, extractStateChanges, formatCampaignExport,
} = require("../public/pure.js");

test("isManlandiaLike is true for manlandia and any c_ world, false for resonance", () => {
  assert.equal(isManlandiaLike("manlandia"), true);
  assert.equal(isManlandiaLike("c_123"), true);
  assert.equal(isManlandiaLike("resonance"), false);
});

test("withWorld appends world as a query param, using ? or & as appropriate", () => {
  assert.equal(withWorld("/api/gm", "manlandia"), "/api/gm?world=manlandia");
  assert.equal(withWorld("/api/poll?since=0", "resonance"), "/api/poll?since=0&world=resonance");
});

test("getPlayerDisplayName resolves Fen/Lyra by name, and heroes by stored name or fallback", () => {
  assert.equal(getPlayerDisplayName("fen"), "Fen");
  assert.equal(getPlayerDisplayName("lyra"), "Lyra");
  assert.equal(getPlayerDisplayName("player2", { characters: { player2: { name: "Taisha" } } }), "Taisha");
  assert.equal(getPlayerDisplayName("player3", { characters: {} }), "Hero 3");
  assert.equal(getPlayerDisplayName("player4", { characters: { player4: { name: "Hero 4" } } }), "Hero 4");
});

test("stripPlayerPrefix removes a leading 'Name: ' label", () => {
  assert.equal(stripPlayerPrefix("Fen: I open the door"), "I open the door");
  assert.equal(stripPlayerPrefix("no prefix here"), "no prefix here");
});

test("formatRollMessage builds a readable roll summary", () => {
  const msg = formatRollMessage("player1", "force", { die1: 4, die2: 5, modifier: 2, total: 11 }, { characters: { player1: { name: "Taisha" } } });
  assert.equal(msg, "Taisha rolls FORCE: 4 + 5 + (2) = 11");
});

test("stripGMTags removes every known bracket tag, including the newest SUGGESTIONS tag", () => {
  const raw = "Story text. [LOCATION: The Docks] [SCAR: The Docks: A fire scorched the pier] [CONCLAVE AWARENESS: 1 → 2] [DISSONANCE: 0 → 1] [LYRA: Unhurt → Hurt] [ABILITY FEN: lucky_break_used] [VILLAIN AWARENESS: 0 → 1] [CURSE: 0 → 1] [STONE FOUND: earthstone] [CHARACTER 2: Unhurt → Hurt] [ABILITY 3: used] [SUGGESTIONS: Look around | Leave]";
  assert.equal(stripGMTags(raw), "Story text.");
});

test("stripGMTags also removes a named-hero harm tag (live: model wrote a hero's name instead of CHARACTER N)", () => {
  assert.equal(stripGMTags("Ouch! [Globak: Unhurt → Scratched]"), "Ouch!");
});

test("stripGMTags tolerates an ASCII arrow, not just the Unicode one", () => {
  assert.equal(stripGMTags("Uh oh. [CURSE: 0 -> 1]"), "Uh oh.");
});

test("stripGMTags removes an ability tag padded with extra descriptive text", () => {
  assert.equal(stripGMTags("You did it! [ABILITY 1: Lucky Break used]"), "You did it!");
});

test("getCleanText strips tags and collapses excess blank lines", () => {
  const raw = "First line. [LOCATION: The Docks]\n\n\n\nSecond line.";
  // stripGMTags only removes the bracketed tag itself, so the space that preceded
  // it in the source text is preserved (matches long-standing GM output behavior).
  assert.equal(getCleanText(raw), "First line. \n\nSecond line.");
});

test("extractStateChanges reports Manlandia-flavored changes, including stone finds only for manlandia proper", () => {
  const text = "[VILLAIN AWARENESS: 0 → 1] [CURSE: 0 → 1] [STONE FOUND: earthstone] [CHARACTER 2: Unhurt → Hurt] [LOCATION: Frost Lands]";
  const gameState = { characters: { player2: { name: "Taisha" } } };

  const manlandiaChanges = extractStateChanges(text, { world: "manlandia", gameState });
  assert.ok(manlandiaChanges.some(c => c.text.includes("Stone Found: earthstone")));
  assert.ok(manlandiaChanges.some(c => c.text === "Taisha: Unhurt → Hurt" && c.positive === false));
  assert.ok(manlandiaChanges.some(c => c.text.includes("📍 Frost Lands")));

  const customChanges = extractStateChanges(text, { world: "c_1", gameState });
  assert.ok(!customChanges.some(c => c.text.includes("Stone Found")), "custom worlds don't track Manlandia stones");
});

test("extractStateChanges reports Resonance-flavored changes", () => {
  const text = "[CONCLAVE AWARENESS: 0 → 1] [DISSONANCE: 0 → 1] [LYRA: Unhurt → Scratched]";
  const changes = extractStateChanges(text, { world: "resonance" });
  assert.ok(changes.some(c => c.text.includes("Conclave Awareness: 0 → 1")));
  assert.ok(changes.some(c => c.text.includes("Dissonance Awakening: 0 → 1")));
  assert.ok(changes.some(c => c.text === "LYRA: Unhurt → Scratched"));
});

test("formatCampaignExport renders archived sessions with GM/player labels and strips tags", () => {
  const state = {
    worldState: {
      session_archive: [{
        session: 1,
        summary: "They met in the pub.",
        log: [
          { role: "user", player: "fen", content: "Fen: I sit at the bar." },
          { role: "gm", content: "The bartender nods. [LOCATION: Salt & Wick Pub]" },
        ],
      }],
    },
  };
  const text = formatCampaignExport(state, { world: "resonance" });
  assert.match(text, /RESONANCE — A LEGACY CAMPAIGN/);
  assert.match(text, /SESSION 1/);
  assert.match(text, /Summary: They met in the pub\./);
  assert.match(text, /Fen: I sit at the bar\./);
  assert.match(text, /Story: The bartender nods\./);
  assert.doesNotMatch(text, /\[LOCATION:/);
});

test("formatCampaignExport falls back to a legacy summary-only entry when no full log was archived", () => {
  const state = { worldState: { session_summaries: ["The team explored the ruins."] } };
  const text = formatCampaignExport(state, { world: "manlandia", gameTitle: "Manlandia" });
  assert.match(text, /MANLANDIA/);
  assert.match(text, /Summary: The team explored the ruins\./);
  assert.match(text, /Full log not available/);
});

test("formatCampaignExport reports no sessions archived yet when history is empty", () => {
  const text = formatCampaignExport({ worldState: {} }, { world: "resonance" });
  assert.match(text, /No sessions archived yet\./);
});

test("HARM_LEVELS is exported and ordered from best to worst", () => {
  assert.deepEqual(HARM_LEVELS, ["Unhurt", "Scratched", "Hurt", "Wounded", "Broken", "Dying"]);
});
