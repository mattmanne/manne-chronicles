const assert = require("node:assert/strict");
const { test } = require("node:test");
const { formatTranscript, buildRecapSystemPrompt } = require("../lib/recap");

test("formats sessionLog entries as Player/GM lines in order", () => {
  const gameState = {
    sessionLog: [
      { role: "user", player: "fen", content: "I enter the pub." },
      { role: "gm", content: "The pub is loud and warm." },
    ],
    worldState: {},
  };
  const transcript = formatTranscript(gameState);
  assert.equal(transcript, "fen: I enter the pub.\nGM: The pub is loud and warm.");
});

test("falls back to the latest archived session's log when sessionLog is empty", () => {
  const gameState = {
    sessionLog: [],
    worldState: {
      session_archive: [
        { session: 1, summary: "Old summary", log: [{ role: "gm", content: "Long ago..." }] },
        { session: 2, summary: "Newer summary", log: [{ role: "user", player: "lyra", content: "We pressed on." }] },
      ],
    },
  };
  const transcript = formatTranscript(gameState);
  assert.equal(transcript, "lyra: We pressed on.");
});

test("falls back to archived summary text when the archived session has no log", () => {
  const gameState = {
    sessionLog: [],
    worldState: {
      session_archive: [{ session: 1, summary: "A quiet session.", log: [] }],
    },
  };
  assert.equal(formatTranscript(gameState), "A quiet session.");
});

test("returns empty string when there is no history at all", () => {
  const gameState = { sessionLog: [], worldState: {} };
  assert.equal(formatTranscript(gameState), "");
});

test("windows sessionLog to the most recent 40 entries", () => {
  const sessionLog = [];
  for (let i = 0; i < 50; i++) {
    sessionLog.push({ role: "gm", content: `entry ${i}` });
  }
  const transcript = formatTranscript({ sessionLog, worldState: {} });
  const lines = transcript.split("\n");
  assert.equal(lines.length, 40);
  assert.equal(lines[0], "GM: entry 10");
  assert.equal(lines[39], "GM: entry 49");
});

test("recap prompt asks for simple language for kid worlds", () => {
  const kidPrompt = buildRecapSystemPrompt(true);
  const adultPrompt = buildRecapSystemPrompt(false);
  assert.match(kidPrompt, /child aged 8/);
  assert.doesNotMatch(adultPrompt, /child aged 8/);
});
