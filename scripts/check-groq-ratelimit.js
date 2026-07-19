#!/usr/bin/env node
// Reports how often a turn has actually failed because Groq's quota was
// exhausted (primary model 429s, the one retry also 429s, and the fallback
// model fails too — see lib/gemini.js and lib/groq-tracking.js). Added
// 2026-07-19 after a family playtest hit the free tier's limit despite
// "very little" play — this is how to check whether that's a one-off or a
// recurring problem before deciding whether to upgrade off the free tier.
//
// Usage: GAME_SECRET=... node scripts/check-groq-ratelimit.js [baseUrl]
// GAME_SECRET is optional — omit it and the request is only rejected if the
// deployed GAME_SECRET env var is actually set (same fail-open convention as
// every other endpoint in this app).

const BASE = process.argv[2] || "https://manne-chronicles.vercel.app";
const GAME_SECRET = process.env.GAME_SECRET || "";

function formatSince(ts) {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function main() {
  const res = await fetch(`${BASE}/api/groq-stats`, {
    headers: { "X-Game-Secret": GAME_SECRET },
  });
  if (!res.ok) {
    console.error(`Request failed: HTTP ${res.status} — ${await res.text()}`);
    process.exit(1);
  }
  const stats = await res.json();

  console.log("Groq rate-limit hit tracking (player-visible failures only, not transient retries)\n");
  console.log(`  All-time total:     ${stats.totalAllTime}`);
  console.log(`  Last 24h:           ${stats.last24h}`);
  console.log(`  Last 7 days:        ${stats.last7d}`);
  console.log(`  Most recent hit:    ${formatSince(stats.lastHitAt)}`);
  console.log(`  (tracked in detail: last ${stats.recentEventsTracked} events)`);

  const worlds = Object.entries(stats.byWorld || {}).sort((a, b) => b[1] - a[1]);
  if (worlds.length) {
    console.log("\n  By world (within tracked window):");
    worlds.forEach(([world, count]) => console.log(`    ${world}: ${count}`));
  }

  if (stats.totalAllTime === 0) {
    console.log("\nNo recorded hits yet — the free tier hasn't actually failed a turn since tracking began.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
