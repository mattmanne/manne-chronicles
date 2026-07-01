const assert = require("node:assert/strict");
const { test } = require("node:test");
const { extractSuggestions } = require("../lib/suggestions");

test("extracts three options and strips the tag", () => {
  const raw = "You step into the clearing.\n\n[SUGGESTIONS: Look around | Talk to the fox | Check your pack]";
  const { clean, suggestions } = extractSuggestions(raw);
  assert.equal(clean, "You step into the clearing.");
  assert.deepEqual(suggestions, ["Look around", "Talk to the fox", "Check your pack"]);
});

test("trims extra whitespace around options", () => {
  const raw = "Text.\n[SUGGESTIONS:   Look around   |  Talk to the fox  |Check your pack ]";
  const { suggestions } = extractSuggestions(raw);
  assert.deepEqual(suggestions, ["Look around", "Talk to the fox", "Check your pack"]);
});

test("returns unchanged text and empty array when no tag present", () => {
  const raw = "Nothing special happens here.";
  const { clean, suggestions } = extractSuggestions(raw);
  assert.equal(clean, raw);
  assert.deepEqual(suggestions, []);
});

test("ignores a malformed tag (missing closing bracket)", () => {
  const raw = "Text.\n[SUGGESTIONS: Look around | Talk to the fox";
  const { clean, suggestions } = extractSuggestions(raw);
  assert.equal(clean, raw);
  assert.deepEqual(suggestions, []);
});

test("caps at 3 options even when more are supplied", () => {
  const raw = "[SUGGESTIONS: One | Two | Three | Four | Five]";
  const { suggestions } = extractSuggestions(raw);
  assert.deepEqual(suggestions, ["One", "Two", "Three"]);
});

test("drops empty options from stray separators", () => {
  const raw = "[SUGGESTIONS: Look around || Talk to the fox |   ]";
  const { suggestions } = extractSuggestions(raw);
  assert.deepEqual(suggestions, ["Look around", "Talk to the fox"]);
});
