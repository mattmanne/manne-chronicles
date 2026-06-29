/* ── State ── */
let currentPlayer = "fen";
let isLoading = false;
let isListening = false;
let recognition = null;
let pollTimer = null;
let lastTimestamp = 0;

const STATS = {
  fen:     { force: 0, acuity: 1, agility: 1, will: 3, presence: 0 },
  lyra: { force: 1, acuity: 3, agility: 2, will: 2, presence: 1 }
};

const HARM_LEVELS = ["Unhurt", "Scratched", "Hurt", "Wounded", "Broken", "Dying"];

/* ── DOM refs ── */
const logEntries   = document.getElementById("log-entries");
const actionInput  = document.getElementById("action-input");
const sendBtn      = document.getElementById("send-btn");
const voiceBtn     = document.getElementById("voice-btn");
const loadingBar   = document.getElementById("loading-bar");
const statusPanel  = document.getElementById("status-panel");
const voiceStatus  = document.getElementById("voice-status");
const diceOverlay  = document.getElementById("dice-overlay");
const sessionLabel = document.getElementById("session-label");

/* ── Init ── */
document.addEventListener("DOMContentLoaded", async () => {
  setupPlayerButtons();
  setupVoice();
  setupInputHandlers();
  setupStatusPanel();
  setupNewSession();
  await loadExistingLog();
  startPolling();
  triggerOpeningIfNeeded();
});

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
  if (!SpeechRecognition) {
    voiceBtn.style.display = "none";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    actionInput.value = transcript;
    stopListening();
  };

  recognition.onerror = () => stopListening();
  recognition.onend   = () => stopListening();

  voiceBtn.addEventListener("click", () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  });
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitAction();
    }
  });
}

/* ── Status Panel ── */
function setupStatusPanel() {
  document.getElementById("status-btn").addEventListener("click", () => {
    statusPanel.classList.toggle("hidden");
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
      alert(`Session saved! Starting Session ${data.session}.`);
      statusPanel.classList.add("hidden");
      triggerOpeningIfNeeded();
    }
  });
}

/* ── Load existing log on page open ── */
async function loadExistingLog() {
  try {
    const res = await fetch("/api/poll?since=0");
    const data = await res.json();
    sessionLabel.textContent = `Session ${data.worldState.session}`;
    updateCharacterUI(data);
    for (const entry of data.entries) {
      if (entry.role === "gm") {
        appendGMEntry(entry.content, false);
      } else {
        appendPlayerEntry(entry.player || "fen", entry.content.replace(/^(Fen|Lyra): /, ""), false);
      }
      if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
    }
    scrollToBottom();
  } catch(_) {}
}

/* ── Polling for the other player's actions ── */
function startPolling() {
  pollTimer = setInterval(async () => {
    if (isLoading) return;
    try {
      const res = await fetch(`/api/poll?since=${lastTimestamp}`);
      const data = await res.json();
      if (data.entries && data.entries.length > 0) {
        for (const entry of data.entries) {
          if (entry.role === "gm") {
            appendGMEntry(entry.content, true);
          } else {
            appendPlayerEntry(entry.player || "fen", entry.content.replace(/^(Fen|Lyra): /, ""), true);
          }
          if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
        }
        updateCharacterUI(data);
        scrollToBottom();
      }
    } catch(_) {}
  }, 8000);
}

/* ── Trigger opening narration on first load ── */
async function triggerOpeningIfNeeded() {
  try {
    const res = await fetch("/api/poll?since=0");
    const data = await res.json();
    if (data.entries.length === 0) {
      await sendToGM("fen", "[SESSION BEGINS]", "begin");
    }
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
    if (data.error) {
      appendSystemMessage("Error: " + data.error);
      return;
    }

    if (data.needsRoll) {
      const rollResult = await animateRoll(player, data.rollStat, data.rollAdvantage);
      appendRollResult(player, data.rollStat, rollResult);

      const rollMsg = formatRollMessage(player, data.rollStat, rollResult);
      await sendToGM(player, rollMsg, "roll_result");
    } else {
      appendGMEntry(data.response, true);
      updateCharacterUI(data);
      if (data.gameState) {
        const ts = Date.now();
        lastTimestamp = Math.max(lastTimestamp, ts - 1000);
      }
      scrollToBottom();
    }
  } catch(err) {
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
    const modifier = STATS[player]?.[stat.toLowerCase()] ?? 0;
    const statName = stat.toUpperCase();

    document.getElementById("dice-title").textContent =
      `${player === "fen" ? "MATT" : "MICHELLE"} — Rolling ${statName}${advantage ? " (Advantage)" : ""}`;

    const die1El = document.getElementById("die1");
    const die2El = document.getElementById("die2");
    const totalEl = document.getElementById("dice-total");
    const labelEl = document.getElementById("dice-result-label");
    const modEl   = document.getElementById("modifier-display");

    totalEl.textContent = "—";
    totalEl.className = "";
    labelEl.textContent = "";
    die1El.textContent = "?";
    die2El.textContent = "?";
    modEl.textContent = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    diceOverlay.classList.remove("hidden");

    die1El.classList.add("rolling");
    die2El.classList.add("rolling");

    const rollDie = () => Math.floor(Math.random() * 6) + 1;

    let shuffleCount = 0;
    const shuffle = setInterval(() => {
      die1El.textContent = rollDie();
      die2El.textContent = rollDie();
      shuffleCount++;
      if (shuffleCount >= 8) {
        clearInterval(shuffle);

        let d1 = rollDie();
        let d2 = rollDie();

        if (advantage) {
          const d3 = rollDie();
          const rolls = [d1, d2, d3].sort((a, b) => a - b);
          d1 = rolls[1];
          d2 = rolls[2];
        }

        die1El.textContent = d1;
        die2El.textContent = d2;
        die1El.classList.remove("rolling");
        die2El.classList.remove("rolling");

        const total = d1 + d2 + modifier;
        totalEl.textContent = total;

        let level, label;
        if (total >= 10)     { level = "success";  label = "Full Success"; }
        else if (total >= 7) { level = "partial";  label = "Partial Success"; }
        else if (total >= 4) { level = "failure";  label = "Failure"; }
        else                 { level = "disaster"; label = "Disaster"; }

        totalEl.className = level;
        labelEl.textContent = label;

        setTimeout(() => {
          diceOverlay.classList.add("hidden");
          resolve({ die1: d1, die2: d2, modifier, total, level, label, stat });
        }, 1800);
      }
    }, 80);
  });
}

/* ── DOM Builders ── */
function appendGMEntry(text, animate) {
  const cleanText = text
    .replace(/\[CONCLAVE AWARENESS: \d+ → \d+\]/g, "")
    .replace(/\[DISSONANCE: \d+ → \d+\]/g, "")
    .replace(/\[(MICHELLE|MATT): [A-Za-z]+ → [A-Za-z]+\]/g, "")
    .trim();

  const stateChanges = extractStateChanges(text);

  const entry = document.createElement("div");
  entry.className = `log-entry gm${animate ? "" : " no-anim"}`;

  entry.innerHTML = `
    <span class="entry-label">The Story</span>
    <div class="entry-content">${escapeHtml(cleanText)}</div>
    ${stateChanges.map(s => `<div class="state-change${s.positive ? " positive" : ""}">${s.text}</div>`).join("")}
  `;

  logEntries.appendChild(entry);
}

function appendPlayerEntry(player, text, animate) {
  const entry = document.createElement("div");
  entry.className = `log-entry player-${player}${animate ? "" : " no-anim"}`;
  const name = player === "fen" ? "Fen" : "Lyra";
  entry.innerHTML = `
    <span class="entry-label">${name}</span>
    <div class="entry-content">${escapeHtml(text)}</div>
  `;
  logEntries.appendChild(entry);
}

function appendRollResult(player, stat, result) {
  const entry = document.createElement("div");
  entry.className = "roll-result-entry";
  const name = player === "fen" ? "Fen" : "Lyra";
  entry.innerHTML = `
    <span>${name} rolled ${stat.toUpperCase()}: ${result.die1}+${result.die2}${result.modifier >= 0 ? "+" : ""}${result.modifier} = <strong>${result.total}</strong></span>
    <span class="roll-badge ${result.level}">${result.label}</span>
  `;
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
  if (awareness) {
    changes.push({ text: `⚡ Conclave Awareness: ${awareness[1]} → ${awareness[2]}`, positive: false });
  }
  const dissonance = text.match(/\[DISSONANCE: (\d+) → (\d+)\]/);
  if (dissonance) {
    changes.push({ text: `◈ Dissonance Awakening: ${dissonance[1]} → ${dissonance[2]}`, positive: true });
  }
  const harm = text.match(/\[(MICHELLE|MATT): ([A-Za-z]+) → ([A-Za-z]+)\]/g);
  if (harm) {
    harm.forEach(h => {
      const m = h.match(/\[(\w+): (\w+) → (\w+)\]/);
      const worsened = HARM_LEVELS.indexOf(m[3]) > HARM_LEVELS.indexOf(m[2]);
      changes.push({ text: `${m[1]}: ${m[2]} → ${m[3]}`, positive: !worsened });
    });
  }
  return changes;
}

/* ── Update Character UI ── */
function updateCharacterUI(data) {
  const chars = data.characters || data.gameState?.characters;
  const ws = data.worldState || data.gameState?.worldState;
  if (!chars) return;

  updateHarm("fen", chars.fen?.harm);
  updateHarm("lyra", chars.lyra?.harm);

  if (chars.lyra?.magic_uses_remaining !== undefined) {
    document.getElementById("magic-count").textContent = chars.lyra.magic_uses_remaining;
  }

  updateAbility("fen-notmywatch", chars.fen?.not_on_my_watch_used);
  updateAbility("fen-luckybreak", chars.fen?.lucky_break_used);
  updateAbility("lyra-knowing", chars.lyra?.weight_of_knowing_used);

  if (ws?.conclave_awareness !== undefined) {
    const badge = document.getElementById("awareness-badge");
    badge.textContent = `⚡ ${ws.conclave_awareness}`;
    badge.className = ws.conclave_awareness >= 8 ? "danger" : ws.conclave_awareness >= 5 ? "warning" : "";
  }

  if (ws?.session) {
    sessionLabel.textContent = `Session ${ws.session}`;
  }
}

function updateHarm(player, harm) {
  if (!harm) return;
  const el = document.getElementById(`${player}-harm`);
  if (el) {
    el.textContent = harm;
    el.className = `harm-value ${harm}`;
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
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
