#!/usr/bin/env node
// Fetches every live campaign's stored transcript and reports any bracket-tag
// text found in GM entries, so a human/agent can eyeball whether the model's
// real formatting still matches what lib/gm-tags.js expects to parse.
//
// This is literally how every GM tag-parsing bug in this app has been found
// so far (see CLAUDE.md) — run it whenever there's fresh play data, not just
// when something seems broken.
//
// Usage: GAME_SECRET=... ADULT_PIN=... node scripts/check-tag-drift.js [baseUrl]
// Both env vars are optional — omit them and gated worlds (Resonance, adult
// custom campaigns) are just skipped rather than failing the whole run.

const BASE = process.argv[2] || "https://resonance-dnd.vercel.app";
const ADULT_PIN = process.env.ADULT_PIN || "";
const GAME_SECRET = process.env.GAME_SECRET || "";

async function fetchState(world) {
  const res = await fetch(`${BASE}/api/state?world=${world}`, {
    headers: { "X-Adult-Pin": ADULT_PIN, "X-Game-Secret": GAME_SECRET },
  });
  if (!res.ok) return null;
  return res.json();
}

async function listCampaigns() {
  const res = await fetch(`${BASE}/api/campaigns`);
  const data = await res.json();
  return data.campaigns || [];
}

function extractTagLines(sessionLog) {
  const lines = new Set();
  for (const e of sessionLog || []) {
    if (e.role !== "gm") continue;
    (e.content.match(/\[[^\]]{1,70}\]/g) || []).forEach((m) => lines.add(m));
    (e.content.match(/^ROLL:.*$/gim) || []).forEach((m) => lines.add(m));
  }
  return [...lines];
}

async function main() {
  const worlds = ["resonance", "manlandia"];
  const campaigns = await listCampaigns();
  campaigns.forEach((c) => worlds.push(c.id));

  let anyFound = false;
  for (const world of worlds) {
    const state = await fetchState(world);
    if (!state) {
      console.log(`[skip] ${world} — could not fetch (likely missing ADULT_PIN/GAME_SECRET, or a network error)`);
      continue;
    }
    const gmCount = (state.sessionLog || []).filter((e) => e.role === "gm").length;
    const tags = extractTagLines(state.sessionLog);
    if (tags.length) {
      anyFound = true;
      console.log(`\n=== ${world} (${gmCount} GM entries) ===`);
      tags.forEach((t) => console.log(" ", JSON.stringify(t)));
    } else {
      console.log(`[clean] ${world} — ${gmCount} GM entries, no bracket tags found`);
    }
  }

  console.log(anyFound
    ? "\nEyeball the tags above against lib/gm-tags.js's expected formats (see CLAUDE.md's tag table). Anything that looks unrecognized is worth a closer look."
    : "\nNo GM entries with bracket tags found in any reachable campaign yet.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
