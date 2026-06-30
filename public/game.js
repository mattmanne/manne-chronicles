/* ── State ── */
let currentPlayer    = "fen";
let currentWorld     = "resonance";
let isLoading        = false;
let isListening      = false;
let autoRead         = false;
let recognition      = null;
let pollTimer        = null;
let lastTimestamp    = 0;
let cachedGameState  = null;
let gameSecret       = null;
let continueInitDone = false;
let manlandiaTone    = localStorage.getItem("manlandia_tone") || "adventure";
let campaignList     = [];

const STATS = {
  fen:  { force: 0, acuity: 1, agility: 1, will: 3, presence: 0 },
  lyra: { force: 1, acuity: 3, agility: 2, will: 2, presence: 1 },
  player1: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
  player2: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
  player3: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
  player4: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
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

const MANLANDIA_LOCATIONS = [
  { id: "hidden-village",  name: "Hidden Village",   x: 160, y: 130, type: "home",
    desc: "The last safe place in Manlandia. Your home, hidden from the Hollow Court by old magic.",
    lx: 0,  ly: 17,  la: "middle" },
  { id: "sky-realm",       name: "Sky Realm",         x: 200, y: 48,  type: "sky",
    desc: "Floating islands in the clouds. Sky whales hum old songs. The Skystone drifts here on the wind.",
    lx: 0,  ly: -8,  la: "middle" },
  { id: "frost-lands",     name: "Frost Lands",       x: 82,  y: 68,  type: "land",
    desc: "Eternal winter. Ice sprites and glowing fish under frozen lakes. The Froststone waits in a glacier.",
    lx: -8, ly: 4,   la: "end" },
  { id: "mountain-peaks",  name: "Mountain Peaks",    x: 255, y: 73,  type: "land",
    desc: "Stone giants sleep standing up here. Eagles the size of horses nest in crags. The Earthstone is buried deep.",
    lx: 9,  ly: 4,   la: "start" },
  { id: "the-swamp",       name: "The Swamp",         x: 75,  y: 190, type: "land",
    desc: "Talking frogs, walking trees, fireflies with lanterns. The Lifestone rests in the oldest roots.",
    lx: -8, ly: 4,   la: "end" },
  { id: "dragons-cave",    name: "Dragon's Cave",     x: 272, y: 148, type: "land",
    desc: "Home of Valora, the ancient dragon. She's kept the Firestone for centuries and is not easily impressed.",
    lx: 9,  ly: 4,   la: "start" },
  { id: "pirate-coast",    name: "Pirate Coast",      x: 248, y: 210, type: "land",
    desc: "Wild shores where alien traders sell impossible things. Maps to strange places cost a song — literally.",
    lx: 9,  ly: 4,   la: "start" },
  { id: "underground-lair",name: "Underground Lair",  x: 155, y: 225, type: "villain",
    desc: "The hidden home of the Hollow Court. Cold grey halls below everything. No one has found the entrance yet.",
    lx: 0,  ly: -7,  la: "middle" },
];

const MANLANDIA_CONNECTIONS = [
  ["frost-lands","mountain-peaks"],["frost-lands","hidden-village"],
  ["mountain-peaks","hidden-village"],["mountain-peaks","dragons-cave"],
  ["sky-realm","mountain-peaks"],["sky-realm","hidden-village"],
  ["hidden-village","the-swamp"],["hidden-village","dragons-cave"],
  ["hidden-village","underground-lair"],["the-swamp","underground-lair"],
  ["the-swamp","pirate-coast"],["dragons-cave","pirate-coast"],
  ["pirate-coast","underground-lair"],
];

/* ── DOM refs ── */
const logEntries   = document.getElementById("log-entries");
const actionInput  = document.getElementById("action-input");
const sendBtn      = document.getElementById("send-btn");
const voiceBtn     = document.getElementById("voice-btn");
const loadingBar   = document.getElementById("loading-bar");
const voiceStatus  = document.getElementById("voice-status");
const diceOverlay  = document.getElementById("dice-overlay");
const sessionLabel = document.getElementById("session-label");

/* ── URL helpers ── */
function withWorld(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}world=${currentWorld}`;
}

function authPost(url, body) {
  return fetch(withWorld(url), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Game-Secret": gameSecret || "" },
    body: JSON.stringify(body)
  });
}

/* ── Secret ── */
function initSecret() {
  const urlParam = new URLSearchParams(window.location.search).get("secret");
  if (urlParam) {
    localStorage.setItem("gameSecret", urlParam);
    const url = new URL(window.location.href);
    url.searchParams.delete("secret");
    window.history.replaceState({}, "", url.toString());
  }
  gameSecret = localStorage.getItem("gameSecret");
  if (!gameSecret) {
    const entered = prompt("Enter the campaign secret to continue:");
    if (entered) {
      gameSecret = entered;
      localStorage.setItem("gameSecret", entered);
    } else {
      document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#090912;color:#c9a84c;font-family:Georgia,serif;text-align:center;padding:2rem"><div><div style="font-size:1.1rem;margin-bottom:1rem">Campaign secret required.</div><div style="font-size:0.8rem;color:#6a5a30;line-height:1.8">Reload the page to try again,<br>or visit the URL with ?secret=YOUR_SECRET</div></div></div>`;
      return false;
    }
  }
  return true;
}

/* ── Helpers ── */
function isManlandiaLike() {
  return currentWorld === "manlandia" || currentWorld.startsWith("c_");
}

/* ── World Selection ── */
function initWorld() {
  const urlParam = new URLSearchParams(window.location.search).get("world");
  if (urlParam && (urlParam === "resonance" || urlParam === "manlandia" || urlParam.startsWith("c_"))) {
    currentWorld = urlParam;
    localStorage.setItem("currentWorld", currentWorld);
    return true;
  }
  const saved = localStorage.getItem("currentWorld");
  if (saved && (saved === "resonance" || saved === "manlandia" || saved.startsWith("c_"))) {
    currentWorld = saved;
    return true;
  }
  return false;
}

function applyWorldUI() {
  const isML = isManlandiaLike();
  document.body.classList.remove("world-resonance", "world-manlandia");
  document.body.classList.add(isML ? "world-manlandia" : "world-resonance");

  let title;
  if (currentWorld === "manlandia") title = "MANLANDIA";
  else if (currentWorld.startsWith("c_")) {
    const camp = campaignList.find(c => c.id === currentWorld);
    title = (camp?.name || localStorage.getItem("currentWorldName") || "MY WORLD").toUpperCase();
  } else {
    title = "RESONANCE";
  }
  document.title = title.charAt(0) + title.slice(1).toLowerCase();
  document.getElementById("game-title").textContent = title;

  document.querySelectorAll(".player-btn").forEach(b => b.classList.remove("active"));
  if (isML) {
    currentPlayer = "player1";
    const btn = document.getElementById("btn-p1");
    if (btn) btn.classList.add("active");
  } else {
    currentPlayer = "fen";
    const btn = document.getElementById("btn-fen");
    if (btn) btn.classList.add("active");
  }
}

function renderCampaignList() {
  const container = document.getElementById("custom-campaigns-list");
  if (!container) return;
  if (!campaignList.length) { container.innerHTML = ""; return; }
  container.innerHTML = campaignList.map(c => `
    <div class="world-btn custom-campaign-card" data-world="${c.id}">
      <div class="custom-campaign-info">
        <span class="world-btn-name">${c.name.toUpperCase()}</span>
        <span class="world-btn-sub">${c.playerCount} hero${c.playerCount > 1 ? "es" : ""} · ${c.subtitle || "Custom world"}</span>
      </div>
      <button class="campaign-delete-btn" data-id="${c.id}" title="Delete this world">🗑</button>
    </div>
  `).join("");
}

function setupWorldSelector() {
  // Fixed world buttons
  document.querySelectorAll(".world-btn[data-world]").forEach(btn => {
    if (!btn.closest("#custom-campaigns-list")) {
      btn.addEventListener("click", () => switchWorld(btn.dataset.world));
    }
  });

  // Delegated: custom campaigns + delete
  document.getElementById("custom-campaigns-list").addEventListener("click", e => {
    const delBtn = e.target.closest(".campaign-delete-btn");
    if (delBtn) {
      e.stopPropagation();
      deleteCampaign(delBtn.dataset.id);
      return;
    }
    const card = e.target.closest(".custom-campaign-card[data-world]");
    if (card) switchWorld(card.dataset.world);
  });

  // Create new world button
  document.getElementById("create-world-btn").addEventListener("click", () => {
    document.getElementById("world-creator").classList.add("active");
  });

  // World switch header button
  const switchBtn = document.getElementById("world-switch-btn");
  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      logEntries.innerHTML = "";
      lastTimestamp = 0;
      cachedGameState = null;
      document.getElementById("world-selector").classList.add("active");
    });
  }
}

async function loadCampaigns() {
  try {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    campaignList = data.campaigns || [];
    renderCampaignList();
  } catch(_) { campaignList = []; }
}

async function deleteCampaign(id) {
  if (!confirm("Delete this world? This can't be undone.")) return;
  try {
    await authPost("/api/campaigns", { action: "delete", payload: { id } });
    campaignList = campaignList.filter(c => c.id !== id);
    renderCampaignList();
    if (currentWorld === id) {
      currentWorld = "resonance";
      localStorage.setItem("currentWorld", currentWorld);
    }
  } catch(_) {}
}

function setupWorldCreator() {
  let selectedCount = 2;

  // Player count buttons
  document.querySelectorAll(".wc-count-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedCount = parseInt(btn.dataset.count);
      document.querySelectorAll(".wc-count-btn").forEach(b => b.classList.toggle("active", b === btn));
    });
  });

  document.getElementById("wc-close-btn").addEventListener("click", closeWorldCreator);
  document.getElementById("wc-cancel-btn").addEventListener("click", closeWorldCreator);

  document.getElementById("wc-create-btn").addEventListener("click", async () => {
    const name  = document.getElementById("wc-name").value.trim();
    const theme = document.getElementById("wc-theme").value.trim();
    if (!name)  { document.getElementById("wc-name").focus();  return; }
    if (!theme) { document.getElementById("wc-theme").focus(); return; }

    const btn = document.getElementById("wc-create-btn");
    btn.disabled = true;
    btn.textContent = "Creating…";
    try {
      const res  = await authPost("/api/campaigns", { action: "create", payload: { name, theme, playerCount: selectedCount } });
      const data = await res.json();
      if (!data.ok) { btn.textContent = "Create World →"; btn.disabled = false; return; }
      campaignList.push(data.campaign);
      renderCampaignList();
      closeWorldCreator();
      switchWorld(data.campaign.id);
    } catch(_) {
      btn.textContent = "Create World →";
      btn.disabled = false;
    }
  });
}

function closeWorldCreator() {
  document.getElementById("world-creator").classList.remove("active");
  document.getElementById("wc-name").value = "";
  document.getElementById("wc-theme").value = "";
  document.querySelectorAll(".wc-count-btn").forEach(b => b.classList.toggle("active", b.dataset.count === "2"));
}

async function switchWorld(worldId) {
  currentWorld = worldId;
  localStorage.setItem("currentWorld", currentWorld);
  if (currentWorld.startsWith("c_")) {
    const camp = campaignList.find(c => c.id === currentWorld);
    if (camp) localStorage.setItem("currentWorldName", camp.name);
  }
  document.getElementById("world-selector").classList.remove("active");
  applyWorldUI();
  if (!continueInitDone) {
    continueInitDone = true;
    await continueInit();
  } else {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    logEntries.innerHTML = "";
    lastTimestamp = 0;
    cachedGameState = null;
    await loadExistingLog();
    startPolling();
    triggerOpeningIfNeeded();
  }
}

/* ── Init ── */
document.addEventListener("DOMContentLoaded", async () => {
  if (!initSecret()) return;
  await loadCampaigns();
  setupWorldSelector();
  setupWorldCreator();
  const worldReady = initWorld();
  if (worldReady) {
    applyWorldUI();
    continueInitDone = true;
    await continueInit();
  } else {
    document.getElementById("world-selector").classList.add("active");
  }
});

async function continueInit() {
  setupTabs();
  setupPlayerButtons();
  setupVoice();
  setupInputHandlers();
  setupAbilityToggles();
  setupHarmRecovery();
  setupNewSession();
  setupAutoRead();
  setupExport();
  setupWizard();
  setupHelp();
  setupToneSelector();
  await loadExistingLog();
  startPolling();
  triggerOpeningIfNeeded();
}

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

/* ── Auto-read ── */
function setupAutoRead() {
  const btn = document.getElementById("auto-read-btn");
  btn.addEventListener("click", () => {
    autoRead = !autoRead;
    btn.classList.toggle("active", autoRead);
    btn.title = autoRead ? "Auto-read ON — tap to turn off" : "Auto-read new narrations";
  });
}

/* ── Player buttons ── */
function setupPlayerButtons() {
  document.querySelectorAll(".player-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".player-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentPlayer = btn.dataset.player;
      const name = getPlayerDisplayName(currentPlayer);
      actionInput.placeholder = `What does ${name} do?`;
    });
  });
}

function getPlayerDisplayName(player) {
  if (player === "fen")  return "Fen";
  if (player === "lyra") return "Lyra";
  if (player && player.startsWith("player")) {
    const n = player.slice(6);
    const name = cachedGameState?.characters?.[player]?.name;
    return (name && name !== `Hero ${n}`) ? name : `Hero ${n}`;
  }
  return player;
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
      const res = await authPost("/api/state", { action: "recover_harm", payload: { character } });
      const data = await res.json();
      if (data.ok) updateCharacterUI({ characters: data.characters });
    });
  });

  document.querySelectorAll("[data-player]").forEach(el => {
    const player = el.dataset.player;
    if (!player || !player.startsWith("player")) return;
    el.addEventListener("click", async () => {
      if (el.classList.contains("Unhurt")) return;
      const res = await authPost("/api/state", { action: "recover_harm", payload: { character: player } });
      const data = await res.json();
      if (data.ok) updateCharacterUI({ characters: data.characters });
    });
  });
}

/* ── Ability Toggles (Resonance only) ── */
function setupAbilityToggles() {
  document.querySelectorAll(".ability[data-ability]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.classList.contains("used")) return;
      const { character, ability } = btn.dataset;
      const res = await authPost("/api/state", { action: "toggle_ability", payload: { character, ability } });
      const data = await res.json();
      if (data.ok) updateCharacterUI({ characters: data.characters });
    });
  });

  const lyraM = document.getElementById("lyra-magic");
  if (lyraM) {
    lyraM.addEventListener("click", async () => {
      const count = parseInt(document.getElementById("magic-count").textContent);
      if (count <= 0) return;
      const res = await authPost("/api/state", { action: "use_magic", payload: {} });
      const data = await res.json();
      if (data.ok) updateCharacterUI({ characters: data.characters });
    });
  }
}

/* ── New Session ── */
function setupNewSession() {
  document.getElementById("new-session-btn").addEventListener("click", () => {
    document.getElementById("end-session-input").value = "";
    document.getElementById("end-session-overlay").classList.add("active");
    setTimeout(() => document.getElementById("end-session-input").focus(), 100);
  });

  document.getElementById("end-session-cancel").addEventListener("click", () => {
    document.getElementById("end-session-overlay").classList.remove("active");
  });

  document.getElementById("end-session-confirm").addEventListener("click", async () => {
    const summary = document.getElementById("end-session-input").value.trim();
    if (!summary) { document.getElementById("end-session-input").focus(); return; }
    const confirmBtn = document.getElementById("end-session-confirm");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Saving…";
    try {
      const res = await authPost("/api/state", { action: "new_session", payload: { summary } });
      const data = await res.json();
      if (data.ok) {
        document.getElementById("end-session-overlay").classList.remove("active");
        logEntries.innerHTML = "";
        lastTimestamp = 0;
        sessionLabel.textContent = `Session ${data.session}`;
        switchTab("story");
        triggerOpeningIfNeeded();
      }
    } catch(_) {
      confirmBtn.textContent = "Archive Session →";
    } finally {
      confirmBtn.disabled = false;
      if (confirmBtn.textContent === "Saving…") confirmBtn.textContent = "Archive Session →";
    }
  });
}

/* ── Load existing log ── */
async function loadExistingLog() {
  try {
    const res = await fetch(withWorld("/api/poll?since=0"));
    const data = await res.json();
    cachedGameState = { worldState: data.worldState, characters: data.characters };
    sessionLabel.textContent = `Session ${data.worldState.session}`;
    updateCharacterUI(data);
    for (const entry of data.entries) {
      if (entry.role === "gm") appendGMEntry(entry.content, false);
      else appendPlayerEntry(entry.player || currentPlayer, stripPlayerPrefix(entry.content), false);
      if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
    }
    scrollToBottom();
  } catch(_) {
    appendSystemMessage("Could not load story — check your connection and reload the page.");
  }
}

function stripPlayerPrefix(content) {
  return (content || "").replace(/^[A-Za-z][A-Za-z0-9]*: /, "");
}

/* ── Polling ── */
function startPolling() {
  pollTimer = setInterval(async () => {
    if (isLoading) return;
    try {
      const res = await fetch(withWorld(`/api/poll?since=${lastTimestamp}`));
      const data = await res.json();
      if (data.entries && data.entries.length > 0) {
        for (const entry of data.entries) {
          if (entry.role === "gm") appendGMEntry(entry.content, true);
          else appendPlayerEntry(entry.player || currentPlayer, stripPlayerPrefix(entry.content), true);
          if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
        }
        cachedGameState = { worldState: data.worldState, characters: data.characters };
        updateCharacterUI(data);
        if (document.getElementById("tab-story").classList.contains("active")) scrollToBottom();
        else setUnreadBadge(true);
        if (document.getElementById("tab-map").classList.contains("active")) renderMap(cachedGameState);
      }
    } catch(_) {}
  }, 8000);
}

/* ── Opening narration ── */
async function triggerOpeningIfNeeded() {
  try {
    const res = await fetch(withWorld("/api/poll?since=0"));
    const data = await res.json();
    if (data.entries.length === 0) await sendToGM(currentPlayer, "[SESSION BEGINS]", "begin");
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
    const res = await authPost("/api/gm", { player, message, type, ...(isManlandiaLike() && { tone: manlandiaTone }) });
    const data = await res.json();
    if (data.error) { appendSystemMessage("Error: " + data.error); return; }

    if (data.needsRoll) {
      const rollResult = await animateRoll(player, data.rollStat, data.rollAdvantage);
      appendRollResult(player, data.rollStat, rollResult);
      await sendToGM(player, formatRollMessage(player, data.rollStat, rollResult), "roll_result");
    } else {
      const entry = appendGMEntry(data.response, true);
      if (autoRead && entry) speakText(getCleanText(data.response), entry.querySelector(".speak-btn"));
      if (data.gameState) {
        cachedGameState = data.gameState;
        updateCharacterUI(data.gameState);
        lastTimestamp = data.serverTimestamp || Math.max(lastTimestamp, Date.now());
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
  const name = getPlayerDisplayName(player);
  return `${name} rolls ${stat.toUpperCase()}: ${result.die1} + ${result.die2} + (${result.modifier}) = ${result.total}`;
}

/* ── Dice Animation ── */
function animateRoll(player, stat, advantage = false) {
  return new Promise((resolve) => {
    const modifier   = STATS[player]?.[stat.toLowerCase()] ?? 0;
    const statName   = stat.toUpperCase();
    const playerName = getPlayerDisplayName(player).toUpperCase();

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

/* ── Export ── */
function setupExport() {
  document.getElementById("export-btn").addEventListener("click", async () => {
    try {
      const res = await fetch(withWorld("/api/state"));
      const state = await res.json();
      const text = formatCampaignExport(state);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = isManlandiaLike() ? `${currentWorld}-campaign.txt` : "resonance-campaign.txt";
      a.click();
      URL.revokeObjectURL(url);
    } catch(_) { alert("Export failed — try again."); }
  });
}

/* ── Character Wizard ── */
const ARCHETYPE_DISPLAY = {
  fighter: { label: "Fighter",  icon: "⚔️" },
  mage:    { label: "Mage",     icon: "✨" },
  scout:   { label: "Scout",    icon: "🐾" },
  leader:  { label: "Leader",   icon: "🛡️" },
  charmer: { label: "Charmer",  icon: "🌟" },
};
const ABILITY_DISPLAY = {
  animal_friend:  "Animal Friend",
  lucky_break:    "Lucky Break",
  protect_friend: "Protect a Friend",
  ancient_magic:  "Ancient Magic",
};

let wizardPlayer = null;
let wizardData   = {};

function setupWizard() {
  // Step 1 next button
  document.getElementById("wiz-name-next").addEventListener("click", () => {
    const name = document.getElementById("wiz-name").value.trim();
    if (!name) { document.getElementById("wiz-name").focus(); return; }
    wizardData.name = name;
    wizSetStep(2);
  });
  document.getElementById("wiz-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("wiz-name-next").click();
  });

  // Step 2: archetype cards — auto-advance
  document.querySelectorAll("[data-archetype]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-archetype]").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      wizardData.archetype = btn.dataset.archetype;
      setTimeout(() => wizSetStep(3), 280);
    });
  });

  // Step 3: ability cards — auto-advance
  document.querySelectorAll("[data-ability]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-ability]").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      wizardData.ability_id = btn.dataset.ability;
      setTimeout(() => wizSetStep(4), 280);
    });
  });

  // Step 4: photo input
  document.getElementById("wiz-photo-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resizeForStorage(file, (dataUrl) => {
      wizardData.photo = dataUrl;
      const prev = document.getElementById("wiz-photo-preview");
      prev.innerHTML = `<img src="${dataUrl}" alt="hero photo" />`;
    });
  });

  document.getElementById("wiz-finish-btn").addEventListener("click", () => wizFinish());
  document.getElementById("wiz-close-btn").addEventListener("click", closeWizard);

  // Delegated: create/edit hero buttons and manlandia ability buttons
  document.getElementById("tab-characters").addEventListener("click", async (e) => {
    const heroBtn = e.target.closest(".create-hero-btn, .edit-hero-btn");
    if (heroBtn) { openWizard(heroBtn.dataset.player); return; }

    const abilBtn = e.target.closest(".manlandia-ability-btn");
    if (abilBtn && !abilBtn.classList.contains("used")) {
      const p = abilBtn.dataset.player;
      const res = await authPost("/api/state", { action: "toggle_ability", payload: { character: p, ability: "ability_used" } });
      const data = await res.json();
      if (data.ok) { cachedGameState = { ...cachedGameState, characters: data.characters }; updateCharacterUI({ characters: data.characters }); }
    }
  });
}

function openWizard(player) {
  wizardPlayer = player;
  wizardData   = {};
  document.getElementById("wiz-name").value = "";
  document.querySelectorAll("[data-archetype], [data-ability]").forEach(b => b.classList.remove("selected"));
  document.getElementById("wiz-photo-preview").innerHTML = "";
  document.getElementById("wiz-backstory").value = "";
  const existing = cachedGameState?.characters?.[player];
  if (existing?.name && !existing.name.startsWith("Hero ")) {
    document.getElementById("wiz-name").value = existing.name;
    wizardData.name = existing.name;
  }
  if (existing?.backstory) {
    document.getElementById("wiz-backstory").value = existing.backstory;
  }
  wizSetStep(1);
  document.getElementById("character-wizard").classList.add("active");
}

function closeWizard() {
  document.getElementById("character-wizard").classList.remove("active");
}

function wizSetStep(step) {
  [1,2,3,4].forEach(n => {
    const el = document.getElementById(`wiz-step-${n}`);
    if (el) el.classList.toggle("hidden", n !== step);
  });
  document.getElementById("wiz-done").classList.add("hidden");
  document.querySelectorAll(".wiz-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i < step);
  });
}

async function wizFinish() {
  if (!wizardData.name || !wizardData.archetype || !wizardData.ability_id) return;

  // Save photo to localStorage (device-only)
  if (wizardData.photo) {
    localStorage.setItem(`manlandia_photo_${wizardPlayer}`, wizardData.photo);
  }

  // Save character data to server
  const backstory = (document.getElementById("wiz-backstory")?.value || "").trim();
  let chars;
  try {
    const res = await authPost("/api/characters", {
      player:     wizardPlayer,
      name:       wizardData.name,
      archetype:  wizardData.archetype,
      ability_id: wizardData.ability_id,
      backstory,
    });
    const data = await res.json();
    if (!data.ok) { alert("Oops — try again!"); return; }
    chars = data.characters;
  } catch(_) { alert("Connection problem — check your internet!"); return; }

  // Update cached state and sync stats
  if (cachedGameState) cachedGameState.characters = chars;
  else cachedGameState = { characters: chars };
  syncPlayerStats(chars);
  updateCharacterUI({ characters: chars });

  // Update Story tab player button
  const n = wizardPlayer.slice(6);
  const btn = document.getElementById(`btn-p${n}`);
  if (btn) btn.textContent = wizardData.name.toUpperCase();

  // Done screen
  const archInfo = ARCHETYPE_DISPLAY[wizardData.archetype] || {};
  const abilLabel = ABILITY_DISPLAY[wizardData.ability_id] || wizardData.ability_id;
  document.getElementById("wiz-done-name").textContent = wizardData.name + " is ready!";
  document.getElementById("wiz-done-summary").innerHTML =
    `${archInfo.icon || "⭐"} <strong>${archInfo.label || wizardData.archetype}</strong><br>✦ Special power: ${abilLabel}`;
  [1,2,3,4].forEach(n => { const el = document.getElementById(`wiz-step-${n}`); if (el) el.classList.add("hidden"); });
  document.getElementById("wiz-done").classList.remove("hidden");
  document.querySelectorAll(".wiz-dot").forEach(d => d.classList.add("active"));
}

function resizeForStorage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 200;
      let w = img.width, h = img.height;
      if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ── Tone Selector ── */
function setupToneSelector() {
  const btns = document.querySelectorAll(".tone-btn");
  function syncToneUI() {
    btns.forEach(b => b.classList.toggle("active", b.dataset.tone === manlandiaTone));
  }
  syncToneUI();
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      manlandiaTone = btn.dataset.tone;
      localStorage.setItem("manlandia_tone", manlandiaTone);
      syncToneUI();
    });
  });
}

/* ── Help ── */
function setupHelp() {
  document.getElementById("help-btn").addEventListener("click", () => {
    document.getElementById("help-overlay").classList.add("active");
    setTimeout(() => document.getElementById("help-input").focus(), 100);
  });
  document.getElementById("help-close-btn").addEventListener("click", () => {
    document.getElementById("help-overlay").classList.remove("active");
  });
  document.getElementById("help-send-btn").addEventListener("click", sendHelpQuestion);
  document.getElementById("help-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendHelpQuestion();
  });

  // Voice input for help
  const helpVoiceBtn = document.getElementById("help-voice-btn");
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    if (helpVoiceBtn) helpVoiceBtn.style.display = "none";
  } else if (helpVoiceBtn) {
    let helpRec = null;
    helpVoiceBtn.addEventListener("click", () => {
      if (helpRec) {
        try { helpRec.stop(); } catch(_) {}
        helpRec = null;
        helpVoiceBtn.textContent = "🎤";
        helpVoiceBtn.classList.remove("listening");
        return;
      }
      helpRec = new SpeechRec();
      helpRec.continuous = false;
      helpRec.interimResults = false;
      helpRec.lang = "en-US";
      helpVoiceBtn.textContent = "⏹";
      helpVoiceBtn.classList.add("listening");
      helpRec.onresult = (e) => {
        document.getElementById("help-input").value = e.results[0][0].transcript;
        helpVoiceBtn.textContent = "🎤";
        helpVoiceBtn.classList.remove("listening");
        helpRec = null;
      };
      helpRec.onerror = helpRec.onend = () => {
        helpVoiceBtn.textContent = "🎤";
        helpVoiceBtn.classList.remove("listening");
        helpRec = null;
      };
      helpRec.start();
    });
  }
}

async function sendHelpQuestion() {
  const input   = document.getElementById("help-input");
  const sendBtn = document.getElementById("help-send-btn");
  const messages = document.getElementById("help-messages");
  const question = input.value.trim();
  if (!question || sendBtn.disabled) return;

  const qEl = document.createElement("div");
  qEl.className = "help-msg-q";
  qEl.textContent = question;
  messages.appendChild(qEl);

  const thinking = document.createElement("div");
  thinking.className = "help-msg-thinking";
  thinking.textContent = "Thinking…";
  messages.appendChild(thinking);
  messages.scrollTop = messages.scrollHeight;

  input.value = "";
  sendBtn.disabled = true;

  try {
    const res = await fetch(withWorld("/api/help"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    thinking.remove();
    const aEl = document.createElement("div");
    aEl.className = "help-msg-a";
    aEl.textContent = data.answer || data.error || "Sorry, I couldn't get an answer. Try again!";
    messages.appendChild(aEl);
  } catch (_) {
    thinking.remove();
    const errEl = document.createElement("div");
    errEl.className = "help-msg-a";
    errEl.textContent = "Hmm, something went wrong. Check your connection and try again!";
    messages.appendChild(errEl);
  }

  sendBtn.disabled = false;
  messages.scrollTop = messages.scrollHeight;
}

function syncPlayerStats(characters) {
  ["player1","player2","player3","player4"].forEach(p => {
    if (characters[p]?.stats) STATS[p] = { ...characters[p].stats };
  });
}

function renderManlandiaCard(n, char) {
  const p     = `player${n}`;
  const isSetup = !!(char?.archetype);

  // Avatar (photo from localStorage, or initial letter)
  const avatarEl = document.getElementById(`p${n}-avatar`);
  if (avatarEl) {
    const photo = localStorage.getItem(`manlandia_photo_${p}`);
    if (photo) {
      avatarEl.innerHTML = `<img src="${photo}" alt="${char?.name || "Hero"}" />`;
    } else {
      const initial = (char?.name || `H${n}`).charAt(0).toUpperCase();
      avatarEl.innerHTML = `<div class="char-avatar-initials">${initial}</div>`;
    }
  }

  // Archetype badge in role slot
  const roleEl = document.getElementById(`p${n}-role`);
  if (roleEl) {
    if (isSetup) {
      const d = ARCHETYPE_DISPLAY[char.archetype] || {};
      roleEl.textContent = `${d.icon || "⭐"} ${d.label || char.archetype}`;
    } else {
      roleEl.textContent = `Player ${n}`;
    }
  }

  // Ability button
  const abilRow = document.getElementById(`p${n}-ability-row`);
  if (abilRow) {
    if (char?.ability_id) {
      const label = ABILITY_DISPLAY[char.ability_id] || char.ability_id;
      const used  = char.ability_used;
      abilRow.innerHTML = `<button class="manlandia-ability-btn ${used ? "used" : "available"}" data-player="${p}" title="${used ? "Already used this session" : "Tap to mark used"}">✦ ${label}</button>`;
    } else {
      abilRow.innerHTML = "";
    }
  }

  // Create/Edit button
  const actionsEl = document.getElementById(`p${n}-card-actions`);
  if (actionsEl) {
    if (isSetup) {
      actionsEl.innerHTML = `<button class="edit-hero-btn" data-player="${p}">✏️ Edit</button>`;
    } else {
      actionsEl.innerHTML = `<button class="create-hero-btn" data-player="${p}">✨ Create My Hero</button>`;
    }
  }

  // Backstory
  const backstoryEl = document.getElementById(`p${n}-backstory`);
  if (backstoryEl) {
    if (char?.backstory) {
      backstoryEl.textContent = char.backstory;
      backstoryEl.classList.remove("hidden");
    } else {
      backstoryEl.textContent = "";
      backstoryEl.classList.add("hidden");
    }
  }
}

function stripGMTags(content) {
  return (content || "")
    .replace(/\[CONCLAVE AWARENESS: \d+ → \d+\]/g, "")
    .replace(/\[DISSONANCE: \d+ → \d+\]/g, "")
    .replace(/\[VILLAIN AWARENESS: \d+ → \d+\]/g, "")
    .replace(/\[CURSE: \d+ → \d+\]/g, "")
    .replace(/\[STONE FOUND: [^\]]+\]/g, "")
    .replace(/\[CHARACTER \d: [A-Za-z]+ → [A-Za-z]+\]/g, "")
    .replace(/\[LOCATION: [^\]]+\]/g, "")
    .replace(/\[SCAR: [^\]]+\]/g, "")
    .replace(/\[(LYRA|FEN): [A-Za-z]+ → [A-Za-z]+\]/g, "")
    .replace(/\[ABILITY \d: used\]/gi, "")
    .replace(/\[ABILITY (FEN|LYRA): [a-z_]+\]/gi, "").trim();
}

function formatCampaignExport(state) {
  const archive   = state.worldState?.session_archive  || [];
  const summaries = state.worldState?.session_summaries || [];
  const archivedSessions = new Set(archive.map(a => a.session));
  const legacyItems = summaries
    .map((s, i) => ({ session: i + 1, summary: s, log: null }))
    .filter(s => !archivedSessions.has(s.session));
  const all = [...archive, ...legacyItems].sort((a, b) => a.session - b.session);

  const sep  = "═".repeat(44);
  const dash = "─".repeat(44);
  const title = currentWorld === "resonance" ? "RESONANCE — A LEGACY CAMPAIGN" : (document.getElementById("game-title")?.textContent || currentWorld).toUpperCase();
  const lines = [title, sep, ""];

  for (const item of all) {
    lines.push(`SESSION ${item.session}`);
    if (item.summary) lines.push(`Summary: ${item.summary}`);
    lines.push(dash);
    if (item.log) {
      for (const e of item.log) {
        const isGM  = e.role === "gm";
        const label = isGM ? "Story" : getPlayerDisplayName(e.player || currentPlayer);
        const content = isGM ? stripGMTags(e.content) : stripPlayerPrefix(e.content);
        lines.push(`${label}: ${content}`, "");
      }
    } else {
      lines.push("(Full log not available for this session.)", "");
    }
    lines.push(sep, "");
  }

  if (!all.length) lines.push("No sessions archived yet.");
  return lines.join("\n");
}

/* ── Archive ── */
async function loadArchive() {
  try {
    const res = await fetch(withWorld("/api/state"));
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
          const isGM    = e.role === "gm";
          const player  = e.player || currentPlayer;
          const cls     = isGM ? "gm" : `player-${player}`;
          const lbl     = isGM ? "Story" : getPlayerDisplayName(player);
          const content = isGM ? stripGMTags(e.content) : stripPlayerPrefix(e.content);
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
  if (currentWorld === "manlandia") renderManlandiaMap(state);
  else if (currentWorld.startsWith("c_")) renderCustomMap(state);
  else renderResonanceMap(state);
}

function renderCustomMap(state) {
  const ws = state?.worldState || {};
  const camp = campaignList.find(c => c.id === currentWorld) || {};
  const mapEl = document.getElementById("map-container-resonance");
  const manEl = document.getElementById("map-container-manlandia");
  if (manEl) manEl.style.display = "none";
  if (!mapEl) return;
  mapEl.style.display = "";
  mapEl.innerHTML = `
    <div class="custom-map-panel">
      <div class="custom-map-name">${camp.name || "Your World"}</div>
      <div class="custom-map-location">📍 ${ws.location || "The Beginning"}</div>
      <div class="custom-map-meters">
        <div class="custom-map-meter">
          <span class="custom-map-meter-label">👁 Danger</span>
          <div class="custom-map-bar"><div class="custom-map-bar-fill danger-fill" style="width:${(ws.villain_awareness||0)*10}%"></div></div>
          <span class="custom-map-meter-val">${ws.villain_awareness||0}/10</span>
        </div>
        <div class="custom-map-meter">
          <span class="custom-map-meter-label">🌫 Peril</span>
          <div class="custom-map-bar"><div class="custom-map-bar-fill peril-fill" style="width:${(ws.curse_level||0)*10}%"></div></div>
          <span class="custom-map-meter-val">${ws.curse_level||0}/10</span>
        </div>
      </div>
      ${ws.location_scars?.length ? `<div class="custom-map-scars">${ws.location_scars.map(s => `<div class="map-scar-entry">✕ <strong>${s.id}</strong> — ${s.label}</div>`).join("")}</div>` : ""}
    </div>
  `;
}

function renderResonanceMap(state) {
  const container = document.getElementById("map-container-resonance");
  if (!container) return;

  const ws = state?.worldState || {};
  const awareness = ws.conclave_awareness || 0;
  const currentLocStr = ws.location || "";

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

  const currentId = matchResonanceLocation(currentLocStr);
  const visited = ws.visited_locations || [];
  const scars   = ws.location_scars   || [];

  const streets = [
    [60,68,370,68],[60,138,370,138],[60,208,370,208],
    [65,52,65,280],[155,52,155,280],[245,52,245,280],[335,52,335,280]
  ].map(([x1,y1,x2,y2]) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#15152e" stroke-width="5"/>` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1c1c3a" stroke-width="1.5"/>`
  ).join("");

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

  const locSvg = LOCATIONS.map(loc => {
    const isCon     = loc.type === "conclave";
    const isLand    = loc.type === "landmark";
    const isCurrent = loc.id === currentId;
    const isVisited = visited.includes(loc.id);
    const locScars  = scars.filter(s => s.id === loc.id);
    const dotColor  = isCon ? "#c0392b" : isLand ? "#c9a84c" : "#8a7040";
    const txtColor  = isCon ? "#c0392b" : isLand ? "#c9a84c" : "#6a5a30";
    const dotOpacity = (isCurrent || isVisited) ? 1 : 0.25;
    const txtOpacity = (isCurrent || isVisited) ? 1 : 0.3;
    const r         = isLand ? 7 : 5;
    const anchor    = loc.la || "middle";
    const lx        = loc.x + (loc.lx || 0);
    const ly        = loc.y + (loc.ly || 17);

    const pulse  = isCurrent ? `<circle cx="${loc.x}" cy="${loc.y}" r="${r + 8}" fill="none" stroke="${dotColor}" stroke-width="1.5" class="loc-pulse"/>` : "";
    const center = isCurrent ? `<circle cx="${loc.x}" cy="${loc.y}" r="3" fill="white" opacity="0.85"/>` : "";
    const scarMark = locScars.length
      ? `<line x1="${loc.x+r-1}" y1="${loc.y-r-4}" x2="${loc.x+r+4}" y2="${loc.y-r+1}" stroke="#8b1a1a" stroke-width="1.3"/>
         <line x1="${loc.x+r+4}" y1="${loc.y-r-4}" x2="${loc.x+r-1}" y2="${loc.y-r+1}" stroke="#8b1a1a" stroke-width="1.3"/>` : "";

    return `<g class="map-location" onclick="showLocationInfo('resonance','${loc.id}')">
      ${pulse}
      <circle cx="${loc.x}" cy="${loc.y}" r="${r}" fill="${dotColor}" opacity="${dotOpacity}"/>
      ${center}${scarMark}
      <text x="${lx}" y="${ly}" text-anchor="${anchor}" fill="${txtColor}" opacity="${txtOpacity}"
            font-size="9" font-family="Georgia,serif">${loc.name}</text>
    </g>`;
  }).join("");

  container.innerHTML = `
    <svg viewBox="50 48 320 248" xmlns="http://www.w3.org/2000/svg" class="map-svg">
      <defs><style>
        .loc-pulse { animation: locPulse 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes locPulse { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.1; transform: scale(1.7); } }
      </style></defs>
      <rect x="50" y="48" width="320" height="248" fill="#090912"/>
      <rect x="55" y="52" width="94" height="80"  fill="#0d0d1e" rx="1"/>
      <rect x="149" y="52" width="90" height="80" fill="#0d0d1c" rx="1"/>
      <rect x="239" y="52" width="80" height="80" fill="#140a0a" rx="1"/>
      <rect x="55" y="132" width="94" height="70" fill="#0c0c1c" rx="1"/>
      <rect x="149" y="132" width="90" height="70" fill="#0b0b1b" rx="1"/>
      <rect x="239" y="132" width="80" height="70" fill="#130d0d" rx="1"/>
      <rect x="55" y="202" width="94" height="68" fill="#0a0a18" rx="1"/>
      <rect x="149" y="202" width="90" height="68" fill="#0a0a18" rx="1"/>
      <rect x="239" y="202" width="80" height="68" fill="#0a0a18" rx="1"/>
      ${streets}${connections}${locSvg}
      <text x="102" y="56" text-anchor="middle" fill="#1c1c36" font-size="6.5" letter-spacing="1.5" font-family="Georgia,serif">ARCHIVE DIST.</text>
      <text x="279" y="56" text-anchor="middle" fill="#281010" font-size="6.5" letter-spacing="1.5" font-family="Georgia,serif">ACCORD WARD</text>
      <path d="M 50 267 Q 118 260 195 264 Q 265 268 320 263 Q 348 260 370 264" stroke="#0c1a28" stroke-width="14" fill="none"/>
      <path d="M 50 267 Q 118 260 195 264 Q 265 268 320 263 Q 348 260 370 264" stroke="#081420" stroke-width="6" fill="none"/>
      <text x="195" y="279" text-anchor="middle" fill="#102030" font-size="7" letter-spacing="2" font-family="Georgia,serif">THE ARDENN RIVER</text>
      <text x="195" y="60" text-anchor="middle" fill="#242450" font-size="11" letter-spacing="4" font-family="Georgia,serif" opacity="0.35">VAREK</text>
    </svg>`;
}

function renderManlandiaMap(state) {
  const container = document.getElementById("map-container-manlandia");
  if (!container) return;

  const ws = state?.worldState || {};
  updateManlandiaMeterUI(ws);

  const currentId = matchManlandiaLocation(ws.location || "");
  const visited = ws.visited_locations || [];
  const scars   = ws.location_scars   || [];

  const connections = MANLANDIA_CONNECTIONS.map(([a, b]) => {
    const la = MANLANDIA_LOCATIONS.find(l => l.id === a);
    const lb = MANLANDIA_LOCATIONS.find(l => l.id === b);
    if (!la || !lb) return "";
    const isDark = a === "underground-lair" || b === "underground-lair";
    const isAerial = a === "sky-realm" || b === "sky-realm";
    const stroke = isDark ? "#2a1010" : isAerial ? "#1a2a3a" : "#0e2a0e";
    const dash = isAerial ? "2,5" : "3,4";
    return `<line x1="${la.x}" y1="${la.y}" x2="${lb.x}" y2="${lb.y}" stroke="${stroke}" stroke-width="1.2" stroke-dasharray="${dash}"/>`;
  }).join("");

  const DOT_COLORS = { home: "#c9a84c", sky: "#87b8d8", villain: "#8b1a1a", land: "#4a8a4a" };
  const TXT_COLORS = { home: "#c9a84c", sky: "#87b8d8", villain: "#8b1a1a", land: "#3a6a3a" };

  const locSvg = MANLANDIA_LOCATIONS.map(loc => {
    const isCurrent = loc.id === currentId;
    const isVisited = visited.includes(loc.id);
    const locScars  = scars.filter(s => s.id === loc.id);
    const dotColor  = DOT_COLORS[loc.type] || "#4a8a4a";
    const txtColor  = TXT_COLORS[loc.type] || "#3a6a3a";
    const dotOpacity = (isCurrent || isVisited) ? 1 : 0.22;
    const txtOpacity = (isCurrent || isVisited) ? 1 : 0.28;
    const r = loc.type === "home" ? 7 : loc.type === "villain" ? 6 : 5;
    const anchor = loc.la || "middle";
    const lx = loc.x + (loc.lx || 0);
    const ly = loc.y + (loc.ly || 17);

    const pulse  = isCurrent ? `<circle cx="${loc.x}" cy="${loc.y}" r="${r + 8}" fill="none" stroke="${dotColor}" stroke-width="1.5" class="loc-pulse"/>` : "";
    const center = isCurrent ? `<circle cx="${loc.x}" cy="${loc.y}" r="3" fill="white" opacity="0.85"/>` : "";
    const scarMark = locScars.length
      ? `<line x1="${loc.x+r-1}" y1="${loc.y-r-4}" x2="${loc.x+r+4}" y2="${loc.y-r+1}" stroke="#8b1a1a" stroke-width="1.3"/>
         <line x1="${loc.x+r+4}" y1="${loc.y-r-4}" x2="${loc.x+r-1}" y2="${loc.y-r+1}" stroke="#8b1a1a" stroke-width="1.3"/>` : "";
    const villainhalo = loc.type === "villain"
      ? `<circle cx="${loc.x}" cy="${loc.y}" r="${r+4}" fill="none" stroke="#5a1010" stroke-width="0.8" opacity="0.5"/>`
      : "";

    return `<g class="map-location" onclick="showLocationInfo('manlandia','${loc.id}')">
      ${villainhalo}${pulse}
      <circle cx="${loc.x}" cy="${loc.y}" r="${r}" fill="${dotColor}" opacity="${dotOpacity}"/>
      ${center}${scarMark}
      <text x="${lx}" y="${ly}" text-anchor="${anchor}" fill="${txtColor}" opacity="${txtOpacity}"
            font-size="9" font-family="Georgia,serif">${loc.name}</text>
    </g>`;
  }).join("");

  container.innerHTML = `
    <svg viewBox="40 28 310 220" xmlns="http://www.w3.org/2000/svg" class="map-svg">
      <defs><style>
        .loc-pulse { animation: locPulse 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes locPulse { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.1; transform: scale(1.7); } }
      </style></defs>
      <rect x="40" y="28" width="310" height="220" fill="#080f08"/>
      <rect x="40" y="28" width="150" height="100" fill="#09100a" rx="0"/>
      <rect x="190" y="28" width="160" height="100" fill="#0a0f09" rx="0"/>
      <rect x="40" y="155" width="130" height="93" fill="#081009" rx="0"/>
      <rect x="170" y="185" width="180" height="63" fill="#090808" rx="0"/>
      <rect x="100" y="175" width="200" height="73" fill="#090908" rx="0"/>
      ${connections}${locSvg}
      <text x="195" y="38" text-anchor="middle" fill="#1a2e1a" font-size="10" letter-spacing="4" font-family="Georgia,serif" opacity="0.5">MANLANDIA</text>
    </svg>`;
}

function matchResonanceLocation(str) {
  if (!str) return "salt-wick";
  const s = str.toLowerCase();
  if (s.includes("salt") || s.includes("wick") || s.includes("pub"))   return "salt-wick";
  if (s.includes("archive"))                                            return "archive";
  if (s.includes("scholar"))                                            return "scholars-row";
  if (s.includes("market"))                                             return "market-square";
  if (s.includes("concordance") || (s.includes("conclave") && !s.includes("warden"))) return "conclave-hall";
  if (s.includes("warden"))                                             return "warden-post";
  if (s.includes("dock"))                                               return "docks";
  if (s.includes("low quarter") || s.includes("low-quarter"))          return "low-quarter";
  return "salt-wick";
}

function matchManlandiaLocation(str) {
  if (!str) return "hidden-village";
  const s = str.toLowerCase();
  if (s.includes("hidden") || s.includes("village")) return "hidden-village";
  if (s.includes("sky"))                             return "sky-realm";
  if (s.includes("frost"))                           return "frost-lands";
  if (s.includes("mountain") || s.includes("peak"))  return "mountain-peaks";
  if (s.includes("swamp"))                           return "the-swamp";
  if (s.includes("dragon") || s.includes("cave"))    return "dragons-cave";
  if (s.includes("pirate") || s.includes("coast"))   return "pirate-coast";
  if (s.includes("underground") || s.includes("lair")) return "underground-lair";
  return "hidden-village";
}

function showLocationInfo(world, id) {
  const locs = world === "manlandia" ? MANLANDIA_LOCATIONS : LOCATIONS;
  const infoEl = document.getElementById(`location-info-${world}`);
  const loc = locs.find(l => l.id === id);
  if (!loc || !infoEl) return;

  const danger = loc.type === "conclave" || loc.type === "villain";
  const locScars = (cachedGameState?.worldState?.location_scars || []).filter(s => s.id === id);
  const scarsHtml = locScars.length
    ? `<div class="loc-scars">${locScars.map(s => `<span class="loc-scar">✕ ${escapeHtml(s.label)}</span>`).join("")}</div>`
    : "";

  infoEl.innerHTML = `
    <div class="loc-info-card">
      <strong style="${danger ? "color:var(--red)" : ""}">${loc.name}${danger ? " ⚠" : ""}</strong>
      <span>${escapeHtml(loc.desc)}</span>
      ${scarsHtml}
    </div>`;
}

/* ── Manlandia meter UI ── */
function updateManlandiaMeterUI(ws) {
  if (!ws) return;
  const va = ws.villain_awareness || 0;
  const cl = ws.curse_level || 0;

  const vFill = document.getElementById("map-villain-fill");
  if (vFill) {
    vFill.style.width = `${(va / 10) * 100}%`;
    vFill.className = "awareness-fill" + (va >= 8 ? " danger" : va >= 5 ? " warning" : "");
    const vVal = document.getElementById("map-villain-value");
    const vStat = document.getElementById("map-villain-status");
    if (vVal) vVal.textContent = `${va} / 10`;
    if (vStat) vStat.textContent = va >= 8 ? "The Hollow Court hunts you" :
                                   va >= 5 ? "The Hollow Court is searching" :
                                   va >= 3 ? "The Hollow Court grows suspicious" :
                                   "The Hollow Court hasn't noticed you";
  }

  const cFill = document.getElementById("map-curse-fill");
  if (cFill) {
    cFill.style.width = `${(cl / 5) * 100}%`;
    cFill.className = "awareness-fill curse-fill" + (cl >= 4 ? " danger" : cl >= 2 ? " warning" : "");
    const cVal = document.getElementById("map-curse-value");
    const cStat = document.getElementById("map-curse-status");
    if (cVal) cVal.textContent = `${cl} / 5`;
    if (cStat) cStat.textContent = cl >= 4 ? "Manlandia is nearly consumed — hurry!" :
                                   cl >= 3 ? "Magical creatures are losing their powers" :
                                   cl >= 2 ? "The grey mist spreads through the land" :
                                   cl >= 1 ? "Grey mist appeared at the forest edges" :
                                   "Manlandia's magic is intact";
  }

  updateStoneTracker(ws.stones_found || []);
}

const STONE_COLORS = {
  earthstone: "#a0732a",
  froststone: "#87ceeb",
  lifestone:  "#27ae60",
  firestone:  "#e74c3c",
  skystone:   "#7fb3d3",
};

function updateStoneTracker(stonesFound) {
  Object.keys(STONE_COLORS).forEach(id => {
    const el = document.getElementById(`stone-${id}`);
    if (!el) return;
    const found = stonesFound.includes(id);
    el.classList.toggle("found", found);
    const iconEl = el.querySelector(".stone-icon");
    if (iconEl) iconEl.style.color = found ? STONE_COLORS[id] : "";
  });
}

/* ── DOM Builders ── */
function getCleanText(text) {
  return (text || "")
    .replace(/\[CONCLAVE AWARENESS: \d+ → \d+\]/g, "")
    .replace(/\[DISSONANCE: \d+ → \d+\]/g, "")
    .replace(/\[VILLAIN AWARENESS: \d+ → \d+\]/g, "")
    .replace(/\[CURSE: \d+ → \d+\]/g, "")
    .replace(/\[STONE FOUND: [^\]]+\]/g, "")
    .replace(/\[CHARACTER \d: [A-Za-z]+ → [A-Za-z]+\]/g, "")
    .replace(/\[LOCATION: [^\]]+\]/g, "")
    .replace(/\[SCAR: [^\]]+\]/g, "")
    .replace(/\[(LYRA|FEN): [A-Za-z]+ → [A-Za-z]+\]/g, "")
    .replace(/\[ABILITY \d: used\]/gi, "")
    .replace(/\[ABILITY (FEN|LYRA): [a-z_]+\]/gi, "")
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
  const displayName = getPlayerDisplayName(player);
  const entry = document.createElement("div");
  entry.className = `log-entry player-${player}${animate ? "" : " no-anim"}`;
  entry.innerHTML = `
    <span class="entry-label">${displayName}</span>
    <div class="entry-content">${escapeHtml(text)}</div>`;
  logEntries.appendChild(entry);
}

function appendRollResult(player, stat, result) {
  const entry = document.createElement("div");
  entry.className = "roll-result-entry";
  const name = getPlayerDisplayName(player);
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

  if (isManlandiaLike()) {
    const villain = text.match(/\[VILLAIN AWARENESS: (\d+) → (\d+)\]/);
    if (villain) changes.push({ text: `👁 Villain Awareness: ${villain[1]} → ${villain[2]}`, positive: false });
    const curse = text.match(/\[CURSE: (\d+) → (\d+)\]/);
    if (curse) changes.push({ text: `🌫 World Peril: ${curse[1]} → ${curse[2]}`, positive: false });
    if (currentWorld === "manlandia") {
      for (const m of [...text.matchAll(/\[STONE FOUND: ([^\]]+)\]/g)]) {
        changes.push({ text: `✦ Stone Found: ${m[1].trim()}`, positive: true });
      }
    }
    for (const m of [...text.matchAll(/\[CHARACTER (\d): ([A-Za-z]+) → ([A-Za-z]+)\]/g)]) {
      const worsened = HARM_LEVELS.indexOf(m[3]) > HARM_LEVELS.indexOf(m[2]);
      const name = getPlayerDisplayName(`player${m[1]}`);
      changes.push({ text: `${name}: ${m[2]} → ${m[3]}`, positive: !worsened });
    }
  } else {
    const awareness = text.match(/\[CONCLAVE AWARENESS: (\d+) → (\d+)\]/);
    if (awareness) changes.push({ text: `⚡ Conclave Awareness: ${awareness[1]} → ${awareness[2]}`, positive: false });
    const dissonance = text.match(/\[DISSONANCE: (\d+) → (\d+)\]/);
    if (dissonance) changes.push({ text: `◈ Dissonance Awakening: ${dissonance[1]} → ${dissonance[2]}`, positive: true });
    for (const m of [...text.matchAll(/\[(LYRA|FEN): ([A-Za-z]+) → ([A-Za-z]+)\]/g)]) {
      const worsened = HARM_LEVELS.indexOf(m[3]) > HARM_LEVELS.indexOf(m[2]);
      changes.push({ text: `${m[1]}: ${m[2]} → ${m[3]}`, positive: !worsened });
    }
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

  if (isManlandiaLike()) {
    syncPlayerStats(chars);
    [1,2,3,4].forEach(n => {
      const p = `player${n}`;
      updateHarm(`p${n}`, chars[p]?.harm);
      const nameEl = document.getElementById(`p${n}-name`);
      if (nameEl && chars[p]?.name && chars[p].name !== `Hero ${n}`) {
        nameEl.textContent = chars[p].name.toUpperCase();
        const btn = document.getElementById(`btn-p${n}`);
        if (btn) btn.textContent = chars[p].name.toUpperCase();
      }
      renderManlandiaCard(n, chars[p]);
    });

    const badge = document.getElementById("villain-badge");
    if (badge && ws?.villain_awareness !== undefined) {
      badge.textContent = `👁 ${ws.villain_awareness}`;
      badge.className = "manlandia-only" + (ws.villain_awareness >= 8 ? " danger" : ws.villain_awareness >= 5 ? " warning" : "");
    }

    if (ws) updateManlandiaMeterUI(ws);
  } else {
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
      if (badge) {
        badge.textContent = `⚡ ${ws.conclave_awareness}`;
        badge.className = "resonance-only" + (ws.conclave_awareness >= 8 ? " danger" : ws.conclave_awareness >= 5 ? " warning" : "");
      }
    }
  }

  if (ws?.session) sessionLabel.textContent = `Session ${ws.session}`;
}

function updateHarm(id, harm) {
  if (!harm) return;
  const el = document.getElementById(`${id}-harm`);
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
