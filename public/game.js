/* ── State ── */
let currentPlayer = "fen";
let isLoading = false;
let isListening = false;
let autoRead = false;
let recognition = null;
let pollTimer = null;
let lastTimestamp = 0;
let cachedGameState = null;

const STATS = {
  fen:  { force: 0, acuity: 1, agility: 1, will: 3, presence: 0 },
  lyra: { force: 1, acuity: 3, agility: 2, will: 2, presence: 1 }
};
const HARM_LEVELS = ["Unhurt", "Scratched", "Hurt", "Wounded", "Broken", "Dying"];

const LOCATIONS = [
  { id: "archive",       name: "The Archive",      x: 105, y: 80,  type: "landmark",
    desc: "Lyra's library. Ancient records under Conclave scrutiny. The Archives date back three centuries.",
    lx: 0,   ly: 17 },
  { id: "scholars-row",  name: "Scholar's Row",    x: 165, y: 118, type: "district",
    desc: "Academic housing. Quiet streets. Everyone knows everyone — and watches.",
    lx: -9,  ly: -12, la: "end" },
  { id: "salt-wick",     name: "Salt & Wick Pub",  x: 200, y: 210, type: "landmark",
    desc: "Where the story begins. Wednesday evening. Fen's on shift.",
    lx: 0,   ly: 17 },
  { id: "market-square", name: "Market Square",    x: 292, y: 152, type: "district",
    desc: "Busy by day. Warden patrols at dusk. Do not make a scene here.",
    lx: 12,  ly: 4,  la: "start" },
  { id: "conclave-hall", name: "Concordance Hall", x: 328, y: 76,  type: "conclave",
    desc: "The Conclave's local seat in Varek. Their reach extends from here into every district.",
    lx: -9,  ly: -12, la: "end" },
  { id: "warden-post",   name: "Warden Post",      x: 316, y: 205, type: "conclave",
    desc: "Grey cloaks. Tuning forks humming. Do not linger near the Post.",
    lx: 12,  ly: 4,  la: "start" },
  { id: "docks",         name: "The Docks",        x: 86,  y: 252, type: "district",
    desc: "Old smuggling routes. Someone here knows something. The water doesn't ask questions.",
    lx: 12,  ly: 4,  la: "start" },
  { id: "low-quarter",   name: "Low Quarter",      x: 234, y: 256, type: "district",
    desc: "Where people go when they don't want to be found. Warden patrols are thin here.",
    lx: 0,   ly: -12 },
];

/* ── DOM refs ── */
const logEntries  = document.getElementById("log-entries");
const actionInput = document.getElementById("action-input");
const sendBtn     = document.getElementById("send-btn");
const voiceBtn    = document.getElementById("voice-btn");
const loadingBar  = document.getElementById("loading-bar");
const voiceStatus = document.getElementById("voice-status");
const diceOverlay = document.getElementById("dice-overlay");
const sessionLabel = document.getElementById("session-label");

/* ── Init ── */
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupPlayerButtons();
  setupVoice();
  setupInputHandlers();
  setupAbilityToggles();
  setupHarmRecovery();
  setupNewSession();
  setupAutoRead();
  await loadExistingLog();
  startPolling();
  triggerOpeningIfNeeded();
});

/* ── Tabs ── */
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
  if (tab === "story")   { setUnreadBadge(false); setTimeout(scrollToBottom, 50); }
  if (tab === "archive") loadArchive();
  if (tab === "map")     renderMap(cachedGameState);
}

function setUnreadBadge(val) {
  document.querySelector('.tab-btn[data-tab="story"]').classList.toggle("unread", val);
}

/* ── Auto-read Toggle ── */
function setupAutoRead() {
  const btn = document.getElementById("auto-read-btn");
  btn.addEventListener("click", () => {
    autoRead = !autoRead;
    btn.classList.toggle("active", autoRead);
    btn.title = autoRead ? "Auto-read ON — tap to turn off" : "Auto-read new narrations";
  });
}

/* ── Player selection ── */
function setupPlayerButtons() {
  document.querySelectorAll(".player-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".player-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentPlayer = btn.dataset.player;
      actionInput.placeholder = `What does ${currentPlayer === "fen" ? "Fen" : "Lyra"} do?`;
    });
  });
}

/* ── Voice Input ── */
function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { voiceBtn.style.display = "none"; return; }
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  recognition.onresult = (e) => { actionInput.value = e.results[0][0].transcript; stopListening(); };
  recognition.onerror  = () => stopListening();
  recognition.onend    = () => stopListening();
  voiceBtn.addEventListener("click", () => { isListening ? stopListening() : startListening(); });
}

function startListening() {
  if (!recognition) return;
  isListening = true;
  voiceBtn.classList.add("listening");
  voiceStatus.classList.remove("hidden");
  recognition.start();
}

function stopListening() {
  isListening = false;
  voiceBtn.classList.remove("listening");
  voiceStatus.classList.add("hidden");
  if (recognition) try { recognition.stop(); } catch(_) {}
}

/* ── Input Handlers ── */
function setupInputHandlers() {
  sendBtn.addEventListener("click", submitAction);
  actionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAction(); }
  });
}

/* ── Harm Recovery ── */
function setupHarmRecovery() {
  ["fen", "lyra"].forEach(character => {
    const el = document.getElementById(`${character}-harm`);
    if (!el) return;
    el.addEventListener("click", async () => {
      if (el.classList.contains("Unhurt")) return;
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recover_harm", payload: { character } })
      });
      const data = await res.json();
      if (data.ok) updateCharacterUI({ characters: data.characters });
    });
  });
}

/* ── Ability Toggles ── */
function setupAbilityToggles() {
  document.querySelectorAll(".ability[data-ability]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.classList.contains("used")) return;
      const { character, ability } = btn.dataset;
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_ability", payload: { character, ability } })
      });
      const data = await res.json();
      if (data.ok) updateCharacterUI({ characters: data.characters });
    });
  });

  document.getElementById("lyra-magic").addEventListener("click", async () => {
    const count = parseInt(document.getElementById("magic-count").textContent);
    if (count <= 0) return;
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "use_magic", payload: {} })
    });
    const data = await res.json();
    if (data.ok) updateCharacterUI({ characters: data.characters });
  });
}

/* ── New Session ── */
function setupNewSession() {
  document.getElementById("new-session-btn").addEventListener("click", async () => {
    const summary = prompt("Briefly summarize what happened this session (saved to campaign history):");
    if (!summary) return;
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "new_session", payload: { summary } })
    });
    const data = await res.json();
    if (data.ok) {
      logEntries.innerHTML = "";
      lastTimestamp = 0;
      sessionLabel.textContent = `Session ${data.session}`;
      switchTab("story");
      alert(`Session ${data.session - 1} archived! Starting Session ${data.session}.`);
      triggerOpeningIfNeeded();
    }
  });
}

/* ── Load existing log on page open ── */
async function loadExistingLog() {
  try {
    const res = await fetch("/api/poll?since=0");
    const data = await res.json();
    cachedGameState = { worldState: data.worldState, characters: data.characters };
    sessionLabel.textContent = `Session ${data.worldState.session}`;
    updateCharacterUI(data);
    for (const entry of data.entries) {
      if (entry.role === "gm") appendGMEntry(entry.content, false);
      else appendPlayerEntry(entry.player || "fen", entry.content.replace(/^(Fen|Lyra): /, ""), false);
      if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
    }
    scrollToBottom();
  } catch(_) {}
}

/* ── Polling ── */
function startPolling() {
  pollTimer = setInterval(async () => {
    if (isLoading) return;
    try {
      const res = await fetch(`/api/poll?since=${lastTimestamp}`);
      const data = await res.json();
      if (data.entries && data.entries.length > 0) {
        for (const entry of data.entries) {
          if (entry.role === "gm") appendGMEntry(entry.content, true);
          else appendPlayerEntry(entry.player || "fen", entry.content.replace(/^(Fen|Lyra): /, ""), true);
          if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
        }
        cachedGameState = { worldState: data.worldState, characters: data.characters };
        updateCharacterUI(data);
        if (document.getElementById("tab-story").classList.contains("active")) {
          scrollToBottom();
        } else {
          setUnreadBadge(true);
        }
        if (document.getElementById("tab-map").classList.contains("active")) renderMap(cachedGameState);
      }
    } catch(_) {}
  }, 8000);
}

/* ── Opening narration ── */
async function triggerOpeningIfNeeded() {
  try {
    const res = await fetch("/api/poll?since=0");
    const data = await res.json();
    if (data.entries.length === 0) await sendToGM("fen", "[SESSION BEGINS]", "begin");
  } catch(_) {}
}

/* ── Submit Action ── */
async function submitAction() {
  const text = actionInput.value.trim();
  if (!text || isLoading) return;
  actionInput.value = "";
  setLoading(true);
  appendPlayerEntry(currentPlayer, text, true);
  scrollToBottom();
  await sendToGM(currentPlayer, text, "action");
}

async function sendToGM(player, message, type) {
  setLoading(true);
  try {
    const res = await fetch("/api/gm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, message, type })
    });
    const data = await res.json();
    if (data.error) { appendSystemMessage("Error: " + data.error); return; }

    if (data.needsRoll) {
      const rollResult = await animateRoll(player, data.rollStat, data.rollAdvantage);
      appendRollResult(player, data.rollStat, rollResult);
      await sendToGM(player, formatRollMessage(player, data.rollStat, rollResult), "roll_result");
    } else {
      const entry = appendGMEntry(data.response, true);
      if (autoRead && entry) {
        speakText(getCleanText(data.response), entry.querySelector(".speak-btn"));
      }
      if (data.gameState) {
        cachedGameState = data.gameState;
        updateCharacterUI(data.gameState);
        lastTimestamp = Math.max(lastTimestamp, Date.now() - 1000);
        if (document.getElementById("tab-map").classList.contains("active")) renderMap(cachedGameState);
      }
      scrollToBottom();
    }
  } catch(_) {
    appendSystemMessage("Connection error. Check your internet and try again.");
  } finally {
    setLoading(false);
  }
}

function formatRollMessage(player, stat, result) {
  const name = player === "fen" ? "Fen" : "Lyra";
  return `${name} rolls ${stat.toUpperCase()}: ${result.die1} + ${result.die2} + (${result.modifier}) = ${result.total}`;
}

/* ── Dice Animation ── */
function animateRoll(player, stat, advantage = false) {
  return new Promise((resolve) => {
    const modifier  = STATS[player]?.[stat.toLowerCase()] ?? 0;
    const statName  = stat.toUpperCase();
    const playerName = player === "fen" ? "FEN" : "LYRA";

    document.getElementById("dice-title").textContent =
      `${playerName} — Rolling ${statName}${advantage ? " (Advantage)" : ""}`;

    const die1El  = document.getElementById("die1");
    const die2El  = document.getElementById("die2");
    const totalEl = document.getElementById("dice-total");
    const labelEl = document.getElementById("dice-result-label");
    const modEl   = document.getElementById("modifier-display");

    totalEl.textContent = "—"; totalEl.className = "";
    labelEl.textContent = "";
    die1El.textContent  = "?"; die2El.textContent = "?";
    modEl.textContent   = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    diceOverlay.classList.remove("hidden");
    die1El.classList.add("rolling"); die2El.classList.add("rolling");

    const rollDie = () => Math.floor(Math.random() * 6) + 1;
    let shuffleCount = 0;
    const shuffle = setInterval(() => {
      die1El.textContent = rollDie(); die2El.textContent = rollDie();
      if (++shuffleCount >= 8) {
        clearInterval(shuffle);
        let d1 = rollDie(), d2 = rollDie();
        if (advantage) {
          const rolls = [d1, d2, rollDie()].sort((a, b) => a - b);
          d1 = rolls[1]; d2 = rolls[2];
        }
        die1El.textContent = d1; die2El.textContent = d2;
        die1El.classList.remove("rolling"); die2El.classList.remove("rolling");

        const total = d1 + d2 + modifier;
        totalEl.textContent = total;

        let level, label;
        if (total >= 10)     { level = "success";  label = "Full Success"; }
        else if (total >= 7) { level = "partial";  label = "Partial Success"; }
        else if (total >= 4) { level = "failure";  label = "Failure"; }
        else                 { level = "disaster"; label = "Disaster"; }

        totalEl.className = level; labelEl.textContent = label;
        setTimeout(() => {
          diceOverlay.classList.add("hidden");
          resolve({ die1: d1, die2: d2, modifier, total, level, label, stat });
        }, 1800);
      }
    }, 80);
  });
}

/* ── Speech Synthesis ── */
let activeSpeech = null;
let iosSpeechKeepalive = null;

function getStoryVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = ["Daniel", "Arthur", "Google UK English Male", "Microsoft George", "Microsoft David", "Aaron", "Google US English"];
  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith("en")) || null;
}

function stopSpeech() {
  if (iosSpeechKeepalive) { clearInterval(iosSpeechKeepalive); iosSpeechKeepalive = null; }
  if (activeSpeech) {
    window.speechSynthesis.cancel();
    if (activeSpeech.btn) { activeSpeech.btn.textContent = "🔊"; activeSpeech.btn.classList.remove("speaking"); }
    activeSpeech = null;
  }
}

function speakText(text, btn) {
  if (!window.speechSynthesis) return;
  const isSame = activeSpeech && activeSpeech.text === text;
  stopSpeech();
  if (isSame) return;

  btn.textContent = "⏹"; btn.classList.add("speaking");
  activeSpeech = { text, btn };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak(text, getStoryVoice(), btn);
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      if (activeSpeech && activeSpeech.text === text) doSpeak(text, getStoryVoice(), btn);
    };
  }
}

function doSpeak(text, voice, btn) {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  let idx = 0;

  // iOS: prevent audio pausing after ~15s in background
  iosSpeechKeepalive = setInterval(() => {
    if (!activeSpeech) { clearInterval(iosSpeechKeepalive); iosSpeechKeepalive = null; return; }
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10000);

  function speakNext() {
    if (!activeSpeech || idx >= paragraphs.length) { finishSpeech(btn); return; }
    const spoken = paragraphs[idx].replace(/—/g, ", ").replace(/\.{3,}/g, "... ");
    const utt = new SpeechSynthesisUtterance(spoken);
    utt.rate = 0.84; utt.pitch = 0.95; utt.volume = 1.0;
    if (voice) utt.voice = voice;
    utt.onend  = () => { idx++; idx < paragraphs.length ? setTimeout(speakNext, 350) : finishSpeech(btn); };
    utt.onerror = () => finishSpeech(btn);
    window.speechSynthesis.speak(utt);
  }
  speakNext();
}

function finishSpeech(btn) {
  if (iosSpeechKeepalive) { clearInterval(iosSpeechKeepalive); iosSpeechKeepalive = null; }
  if (btn) { btn.textContent = "🔊"; btn.classList.remove("speaking"); }
  activeSpeech = null;
}

/* ── Archive ── */
async function loadArchive() {
  try {
    const res = await fetch("/api/state");
    const state = await res.json();
    renderArchive(state);
  } catch(_) {}
}

function renderArchive(state) {
  const el = document.getElementById("archive-content");
  const archive   = state.worldState?.session_archive  || [];
  const summaries = state.worldState?.session_summaries || [];

  const archivedSessions = new Set(archive.map(a => a.session));
  const legacyItems = summaries
    .map((s, i) => ({ session: i + 1, summary: s, log: null }))
    .filter(s => !archivedSessions.has(s.session));

  const all = [...archive, ...legacyItems].sort((a, b) => b.session - a.session);

  if (!all.length) {
    el.innerHTML = '<div class="archive-empty">No sessions archived yet.<br>End a session to save it here.</div>';
    return;
  }

  el.innerHTML = all.map(item => {
    const logHtml = item.log
      ? item.log.map(e => {
          const isGM = e.role === "gm";
          const cls  = isGM ? "gm" : `player-${e.player || "fen"}`;
          const lbl  = isGM ? "Story" : (e.player === "lyra" ? "Lyra" : "Fen");
          let content = e.content || "";
          if (isGM) {
            content = content
              .replace(/\[CONCLAVE AWARENESS: \d+ → \d+\]/g, "")
              .replace(/\[DISSONANCE: \d+ → \d+\]/g, "")
              .replace(/\[LOCATION: [^\]]+\]/g, "")
              .replace(/\[(LYRA|FEN): [A-Za-z]+ → [A-Za-z]+\]/g, "").trim();
          } else {
            content = content.replace(/^(Fen|Lyra): /, "");
          }
          return `<div class="archive-log-entry ${cls}"><span class="archive-log-label">${lbl}</span><span class="archive-log-text">${escapeHtml(content)}</span></div>`;
        }).join("")
      : `<div class="archive-log-entry"><span class="archive-log-text" style="color:var(--parch-dim);font-style:italic">Full log not available for this session.</span></div>`;

    return `
      <details class="archive-entry">
        <summary>
          <span class="archive-session-num">Session ${item.session}</span>
          <span class="archive-summary-text">${escapeHtml(item.summary || "")}</span>
          <span class="archive-chevron">▼</span>
        </summary>
        <div class="archive-log">${logHtml}</div>
      </details>`;
  }).join("");
}

/* ── Map ── */
function renderMap(state) {
  const container = document.getElementById("map-container");
  if (!container) return;

  const ws = state?.worldState || {};
  const awareness = ws.conclave_awareness || 0;
  const currentLocStr = ws.location || "";

  // Awareness meter
  const fill  = document.getElementById("map-awareness-fill");
  const val   = document.getElementById("map-awareness-value");
  const astat = document.getElementById("map-awareness-status");
  if (fill) {
    fill.style.width = `${(awareness / 10) * 100}%`;
    fill.className = "awareness-fill" + (awareness >= 8 ? " danger" : awareness >= 5 ? " warning" : "");
    val.textContent   = `${awareness} / 10`;
    astat.textContent = awareness >= 8 ? "Wardens ordered to capture on sight" :
                        awareness >= 5 ? "Active search in progress" :
                        awareness >= 3 ? "Rumours spreading through the city" :
                        "Undetected — carry on normally";
  }

  const currentId = matchLocation(currentLocStr);

  // Street grid lines
  const streets = [
    [60,68,370,68],[60,138,370,138],[60,208,370,208],
    [65,52,65,280],[155,52,155,280],[245,52,245,280],[335,52,335,280]
  ].map(([x1,y1,x2,y2]) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#15152e" stroke-width="5"/>` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1c1c3a" stroke-width="1.5"/>`
  ).join("");

  // Dashed connections between locations
  const connections = [
    ["archive","scholars-row"],["scholars-row","salt-wick"],["salt-wick","market-square"],
    ["market-square","conclave-hall"],["market-square","warden-post"],
    ["salt-wick","low-quarter"],["low-quarter","docks"],["docks","scholars-row"],
    ["warden-post","conclave-hall"]
  ].map(([a, b]) => {
    const la = LOCATIONS.find(l => l.id === a);
    const lb = LOCATIONS.find(l => l.id === b);
    if (!la || !lb) return "";
    return `<line x1="${la.x}" y1="${la.y}" x2="${lb.x}" y2="${lb.y}" stroke="#28285a" stroke-width="1.2" stroke-dasharray="3,4"/>`;
  }).join("");

  // Location dots + labels + pulse ring for current
  const locSvg = LOCATIONS.map(loc => {
    const isCon     = loc.type === "conclave";
    const isLand    = loc.type === "landmark";
    const isCurrent = loc.id === currentId;
    const dotColor  = isCon ? "#c0392b" : isLand ? "#c9a84c" : "#8a7040";
    const txtColor  = isCon ? "#c0392b" : isLand ? "#c9a84c" : "#6a5a30";
    const r         = isLand ? 7 : 5;
    const anchor    = loc.la || "middle";
    const lx        = loc.x + (loc.lx || 0);
    const ly        = loc.y + (loc.ly || 17);

    const pulse = isCurrent
      ? `<circle cx="${loc.x}" cy="${loc.y}" r="${r + 8}" fill="none" stroke="${dotColor}" stroke-width="1.5" class="loc-pulse"/>`
      : "";
    const center = isCurrent
      ? `<circle cx="${loc.x}" cy="${loc.y}" r="3" fill="white" opacity="0.85"/>`
      : "";

    return `
      <g class="map-location" onclick="showLocationInfo('${loc.id}')">
        ${pulse}
        <circle cx="${loc.x}" cy="${loc.y}" r="${r}" fill="${dotColor}"/>
        ${center}
        <text x="${lx}" y="${ly}" text-anchor="${anchor}" fill="${txtColor}"
              font-size="9" font-family="Georgia,serif">${loc.name}</text>
      </g>`;
  }).join("");

  container.innerHTML = `
    <svg viewBox="50 48 320 248" xmlns="http://www.w3.org/2000/svg" class="map-svg">
      <defs>
        <style>
          .loc-pulse {
            animation: locPulse 2s ease-in-out infinite;
            transform-box: fill-box;
            transform-origin: center;
          }
          @keyframes locPulse {
            0%,100% { opacity: 0.5; transform: scale(1); }
            50%     { opacity: 0.1; transform: scale(1.7); }
          }
        </style>
      </defs>
      <rect x="50" y="48" width="320" height="248" fill="#090912"/>
      <rect x="55" y="52" width="94" height="80" fill="#0d0d1e" rx="1"/>
      <rect x="149" y="52" width="90" height="80" fill="#0d0d1c" rx="1"/>
      <rect x="239" y="52" width="80" height="80" fill="#140a0a" rx="1"/>
      <rect x="55" y="132" width="94" height="70" fill="#0c0c1c" rx="1"/>
      <rect x="149" y="132" width="90" height="70" fill="#0b0b1b" rx="1"/>
      <rect x="239" y="132" width="80" height="70" fill="#130d0d" rx="1"/>
      <rect x="55" y="202" width="94" height="68" fill="#0a0a18" rx="1"/>
      <rect x="149" y="202" width="90" height="68" fill="#0a0a18" rx="1"/>
      <rect x="239" y="202" width="80" height="68" fill="#0a0a18" rx="1"/>
      ${streets}
      ${connections}
      ${locSvg}
      <text x="102" y="56" text-anchor="middle" fill="#1c1c36" font-size="6.5" letter-spacing="1.5" font-family="Georgia,serif">ARCHIVE DIST.</text>
      <text x="279" y="56" text-anchor="middle" fill="#281010" font-size="6.5" letter-spacing="1.5" font-family="Georgia,serif">ACCORD WARD</text>
      <path d="M 50 267 Q 118 260 195 264 Q 265 268 320 263 Q 348 260 370 264" stroke="#0c1a28" stroke-width="14" fill="none"/>
      <path d="M 50 267 Q 118 260 195 264 Q 265 268 320 263 Q 348 260 370 264" stroke="#081420" stroke-width="6" fill="none"/>
      <text x="195" y="279" text-anchor="middle" fill="#102030" font-size="7" letter-spacing="2" font-family="Georgia,serif">THE ARDENN RIVER</text>
      <text x="195" y="60" text-anchor="middle" fill="#242450" font-size="11" letter-spacing="4" font-family="Georgia,serif" opacity="0.35">VAREK</text>
    </svg>`;
}

function matchLocation(str) {
  if (!str) return "salt-wick";
  const s = str.toLowerCase();
  if (s.includes("salt") || s.includes("wick") || s.includes("pub"))   return "salt-wick";
  if (s.includes("archive"))                                            return "archive";
  if (s.includes("scholar"))                                            return "scholars-row";
  if (s.includes("market"))                                             return "market-square";
  if (s.includes("concordance") || s.includes("conclave hall"))        return "conclave-hall";
  if (s.includes("warden"))                                             return "warden-post";
  if (s.includes("dock"))                                               return "docks";
  if (s.includes("low quarter") || s.includes("quarter"))              return "low-quarter";
  return "salt-wick";
}

function showLocationInfo(id) {
  const loc = LOCATIONS.find(l => l.id === id);
  if (!loc) return;
  const danger = loc.type === "conclave";
  document.getElementById("location-info").innerHTML = `
    <div class="loc-info-card">
      <strong style="${danger ? "color:var(--red)" : ""}">${loc.name}${danger ? " ⚡" : ""}</strong>
      <span>${escapeHtml(loc.desc)}</span>
    </div>`;
}

/* ── DOM Builders ── */
function getCleanText(text) {
  return (text || "")
    .replace(/\[CONCLAVE AWARENESS: \d+ → \d+\]/g, "")
    .replace(/\[DISSONANCE: \d+ → \d+\]/g, "")
    .replace(/\[LOCATION: [^\]]+\]/g, "")
    .replace(/\[(LYRA|FEN): [A-Za-z]+ → [A-Za-z]+\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function appendGMEntry(text, animate) {
  const cleanText    = getCleanText(text);
  const stateChanges = extractStateChanges(text);

  const entry = document.createElement("div");
  entry.className = `log-entry gm${animate ? "" : " no-anim"}`;
  entry.innerHTML = `
    <div class="entry-header">
      <span class="entry-label">The Story</span>
      <button class="speak-btn" title="Read aloud">🔊</button>
    </div>
    <div class="entry-content">${escapeHtml(cleanText)}</div>
    ${stateChanges.map(s => `<div class="state-change${s.positive ? " positive" : ""}">${s.text}</div>`).join("")}`;

  entry.querySelector(".speak-btn").addEventListener("click", function() {
    speakText(cleanText, this);
  });
  logEntries.appendChild(entry);
  return entry;
}

function appendPlayerEntry(player, text, animate) {
  const entry = document.createElement("div");
  entry.className = `log-entry player-${player}${animate ? "" : " no-anim"}`;
  entry.innerHTML = `
    <span class="entry-label">${player === "fen" ? "Fen" : "Lyra"}</span>
    <div class="entry-content">${escapeHtml(text)}</div>`;
  logEntries.appendChild(entry);
}

function appendRollResult(player, stat, result) {
  const entry = document.createElement("div");
  entry.className = "roll-result-entry";
  const name = player === "fen" ? "Fen" : "Lyra";
  const mod  = result.modifier >= 0 ? `+${result.modifier}` : `${result.modifier}`;
  entry.innerHTML = `
    <span>${name} rolled ${stat.toUpperCase()}: ${result.die1}+${result.die2}${mod} = <strong>${result.total}</strong></span>
    <span class="roll-badge ${result.level}">${result.label}</span>`;
  logEntries.appendChild(entry);
}

function appendSystemMessage(msg) {
  const entry = document.createElement("div");
  entry.style.cssText = "text-align:center;font-size:0.75rem;color:#666;padding:8px;";
  entry.textContent = msg;
  logEntries.appendChild(entry);
}

function extractStateChanges(text) {
  const changes = [];
  const awareness = text.match(/\[CONCLAVE AWARENESS: (\d+) → (\d+)\]/);
  if (awareness) changes.push({ text: `⚡ Conclave Awareness: ${awareness[1]} → ${awareness[2]}`, positive: false });
  const dissonance = text.match(/\[DISSONANCE: (\d+) → (\d+)\]/);
  if (dissonance) changes.push({ text: `◈ Dissonance Awakening: ${dissonance[1]} → ${dissonance[2]}`, positive: true });
  for (const m of [...text.matchAll(/\[(LYRA|FEN): ([A-Za-z]+) → ([A-Za-z]+)\]/g)]) {
    const worsened = HARM_LEVELS.indexOf(m[3]) > HARM_LEVELS.indexOf(m[2]);
    changes.push({ text: `${m[1]}: ${m[2]} → ${m[3]}`, positive: !worsened });
  }
  const loc = text.match(/\[LOCATION: ([^\]]+)\]/);
  if (loc) changes.push({ text: `📍 ${loc[1].trim()}`, positive: true });
  return changes;
}

/* ── Update Character UI ── */
function updateCharacterUI(data) {
  const chars = data.characters || data.gameState?.characters;
  const ws    = data.worldState  || data.gameState?.worldState;
  if (!chars) return;

  updateHarm("fen",  chars.fen?.harm);
  updateHarm("lyra", chars.lyra?.harm);

  if (chars.lyra?.magic_uses_remaining !== undefined) {
    const count = chars.lyra.magic_uses_remaining;
    document.getElementById("magic-count").textContent = count;
    const magicBtn = document.getElementById("lyra-magic");
    if (magicBtn) magicBtn.style.opacity = count === 0 ? "0.35" : "1";
  }

  updateAbility("fen-notmywatch", chars.fen?.not_on_my_watch_used);
  updateAbility("fen-luckybreak",  chars.fen?.lucky_break_used);
  updateAbility("lyra-knowing",    chars.lyra?.weight_of_knowing_used);

  if (ws?.conclave_awareness !== undefined) {
    const badge = document.getElementById("awareness-badge");
    badge.textContent = `⚡ ${ws.conclave_awareness}`;
    badge.className = ws.conclave_awareness >= 8 ? "danger" : ws.conclave_awareness >= 5 ? "warning" : "";
  }
  if (ws?.session) sessionLabel.textContent = `Session ${ws.session}`;
}

function updateHarm(player, harm) {
  if (!harm) return;
  const el = document.getElementById(`${player}-harm`);
  if (el) {
    el.textContent = harm;
    el.className = `harm-value ${harm}`;
    el.title = harm === "Unhurt" ? "" : "Tap to recover one step";
  }
}

function updateAbility(id, used) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `ability used-indicator ${used ? "used" : "available"}`;
}

/* ── Utilities ── */
function setLoading(val) {
  isLoading = val;
  sendBtn.disabled = val;
  loadingBar.classList.toggle("hidden", !val);
}

function scrollToBottom() {
  const logArea = document.getElementById("log-area");
  setTimeout(() => { logArea.scrollTop = logArea.scrollHeight; }, 50);
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
