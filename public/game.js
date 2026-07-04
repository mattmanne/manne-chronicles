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
let currentSuggestions = [];
let gameSecret       = null;
let continueInitDone = false;
let manlandiaTone    = localStorage.getItem("manlandia_tone") || "adventure";
let campaignList     = [];
let resumingRoll     = false;
let adultPin         = localStorage.getItem("adult_pin") || "";
// Devices that unlocked before adult worlds required an X-Adult-Pin header
// have the old flag but never stored the actual pin — treat that as "not
// really unlocked" so they get re-prompted instead of silently 403ing forever.
let adultUnlocked    = localStorage.getItem("adult_unlocked") === "true" && !!adultPin;
if (localStorage.getItem("adult_unlocked") === "true" && !adultPin) {
  localStorage.removeItem("adult_unlocked");
}

const STATS = {
  fen:  { force: 0, acuity: 1, agility: 1, will: 3, presence: 0 },
  lyra: { force: 1, acuity: 3, agility: 2, will: 2, presence: 1 },
  player1: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
  player2: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
  player3: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
  player4: { force: 0, acuity: 0, agility: 0, will: 0, presence: 0 },
};
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
const suggestionChips = document.getElementById("suggestion-chips");

/* ── URL helpers ── */
function authPost(url, body) {
  return fetch(withWorld(url), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Game-Secret": gameSecret || "", "X-Adult-Pin": adultPin || "" },
    body: JSON.stringify(body)
  });
}

function authGet(url) {
  return fetch(withWorld(url), { headers: { "X-Adult-Pin": adultPin || "" } });
}

// A 403 here means the stored pin is missing or wrong (most commonly: this
// device unlocked before X-Adult-Pin enforcement existed, so it has the old
// flag but never actually saved a pin). Clear the stale state and prompt
// again, instead of leaving the user stuck on a generic connection error.
function handleLockedResponse(status) {
  if (status !== 403) return false;
  adultUnlocked = false;
  adultPin = "";
  localStorage.removeItem("adult_unlocked");
  localStorage.removeItem("adult_pin");
  document.body.classList.remove("adult-unlocked");
  const errorEl = document.getElementById("unlock-error");
  if (errorEl) {
    errorEl.textContent = "This world needs to be unlocked again — please re-enter the PIN.";
    errorEl.classList.remove("hidden");
  }
  document.getElementById("unlock-overlay")?.classList.add("active");
  setTimeout(() => document.getElementById("unlock-pin-input")?.focus(), 100);
  return true;
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
  const isCustom = currentWorld.startsWith("c_");
  document.body.classList.remove("world-resonance", "world-manlandia", "world-custom");
  document.body.classList.add(isML ? "world-manlandia" : "world-resonance");
  if (isCustom) document.body.classList.add("world-custom");

  // Reset player cards/buttons, then immediately hide beyond playerCount for custom campaigns
  const immediatePC = currentWorld.startsWith("c_")
    ? (campaignList.find(c => c.id === currentWorld)?.playerCount || 4)
    : 4;
  [1,2,3,4].forEach(n => {
    const visible = n <= immediatePC;
    const card = document.getElementById(`p${n}-card`);
    if (card) card.style.display = visible ? "" : "none";
    const btn = document.getElementById(`btn-p${n}`);
    if (btn) { btn.style.display = visible ? "" : "none"; btn.textContent = `HERO ${n}`; }
    const nameEl = document.getElementById(`p${n}-name`);
    if (nameEl) nameEl.textContent = `HERO ${n}`;
  });

  let title;
  if (currentWorld === "manlandia") title = "MANLANDIA";
  else if (currentWorld.startsWith("c_")) {
    const camp = campaignList.find(c => c.id === currentWorld);
    title = (camp?.name || localStorage.getItem("currentWorldName") || "MY WORLD").toUpperCase();
  } else {
    title = "RESONANCE";
  }
  document.title = title.charAt(0) + title.slice(1).toLowerCase();
  const gtEl = document.getElementById("game-title");
  if (gtEl) gtEl.textContent = title;

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

// Campaigns created before this feature shipped have no `status` field at
// all — treat missing as active rather than requiring a data migration.
let showArchived = false;

function renderCampaignList() {
  const container = document.getElementById("custom-campaigns-list");
  const toggle    = document.getElementById("show-archived-toggle");
  if (!container) return;

  const archivedCount = campaignList.filter(c => c.status === "archived").length;
  if (toggle) {
    toggle.classList.toggle("hidden", archivedCount === 0);
    toggle.textContent = showArchived ? "▲ Hide archived worlds" : `▼ Show ${archivedCount} archived world${archivedCount === 1 ? "" : "s"}`;
  }

  const visible = campaignList.filter(c => showArchived || c.status !== "archived");
  if (!visible.length) { container.innerHTML = ""; return; }

  container.innerHTML = visible.map(c => {
    const archived = c.status === "archived";
    return `
    <div class="world-btn custom-campaign-card${c.adult ? " adult-only" : ""}${archived ? " archived" : ""}" data-world="${c.id}">
      <div class="custom-campaign-info">
        <span class="world-btn-name">${c.name.toUpperCase()}${c.adult ? ' <span class="adult-badge">18+</span>' : ""}${archived ? ' <span class="archived-badge">Archived</span>' : ""}</span>
        <span class="world-btn-sub">${c.playerCount} hero${c.playerCount > 1 ? "es" : ""} · ${c.subtitle || "Custom world"}</span>
      </div>
      <div class="campaign-actions">
        <button class="campaign-edit-btn" data-id="${c.id}" title="Edit this world" aria-label="Edit ${c.name}">✏️</button>
        ${archived
          ? `<button class="campaign-unarchive-btn" data-id="${c.id}" title="Restore this world" aria-label="Restore ${c.name}">↩</button>`
          : `<button class="campaign-archive-btn" data-id="${c.id}" title="Archive this world" aria-label="Archive ${c.name}">🗄</button>`}
        <button class="campaign-delete-btn" data-id="${c.id}" title="Delete this world" aria-label="Delete ${c.name}">🗑</button>
      </div>
    </div>
  `;
  }).join("");
}

function setupWorldSelector() {
  // Fixed world buttons
  document.querySelectorAll(".world-btn[data-world]").forEach(btn => {
    if (!btn.closest("#custom-campaigns-list")) {
      btn.addEventListener("click", () => switchWorld(btn.dataset.world));
    }
  });

  // Delegated: custom campaigns + edit + delete
  const ccl = document.getElementById("custom-campaigns-list");
  if (ccl) ccl.addEventListener("click", e => {
    const editBtn = e.target.closest(".campaign-edit-btn");
    if (editBtn) {
      e.stopPropagation();
      openWorldCreatorForEdit(editBtn.dataset.id);
      return;
    }
    const archiveBtn = e.target.closest(".campaign-archive-btn, .campaign-unarchive-btn");
    if (archiveBtn) {
      e.stopPropagation();
      setCampaignArchived(archiveBtn.dataset.id, archiveBtn.classList.contains("campaign-archive-btn"));
      return;
    }
    const delBtn = e.target.closest(".campaign-delete-btn");
    if (delBtn) {
      e.stopPropagation();
      deleteCampaign(delBtn.dataset.id);
      return;
    }
    const card = e.target.closest(".custom-campaign-card[data-world]");
    if (card) switchWorld(card.dataset.world);
  });

  document.getElementById("show-archived-toggle")?.addEventListener("click", () => {
    showArchived = !showArchived;
    renderCampaignList();
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

let pendingDeleteId = null;

function deleteCampaign(id) {
  const camp = campaignList.find(c => c.id === id);
  const nameEl = document.getElementById("delete-confirm-name");
  if (nameEl) nameEl.textContent = camp?.name || id;
  pendingDeleteId = id;
  document.getElementById("delete-confirm-overlay").classList.add("active");
}

async function doDeleteCampaign(id) {
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

// Reversible alternative to delete — hides a finished/abandoned campaign
// from the default world-selector view without losing anything.
async function setCampaignArchived(id, archived) {
  try {
    const res = await authPost("/api/campaigns", { action: archived ? "archive" : "unarchive", payload: { id } });
    const data = await res.json();
    if (data.ok) {
      campaignList = campaignList.map(c => c.id === id ? data.campaign : c);
      renderCampaignList();
    }
  } catch(_) {}
}

function setupDeleteConfirm() {
  document.getElementById("delete-confirm-cancel")?.addEventListener("click", () => {
    document.getElementById("delete-confirm-overlay").classList.remove("active");
    pendingDeleteId = null;
  });
  document.getElementById("delete-confirm-ok")?.addEventListener("click", async () => {
    const id = pendingDeleteId;
    pendingDeleteId = null;
    document.getElementById("delete-confirm-overlay").classList.remove("active");
    if (id) await doDeleteCampaign(id);
  });
}

let editingCampaignId = null;

function setupWorldCreator() {
  // Player count buttons
  document.querySelectorAll(".wc-count-btn").forEach(btn => {
    btn.addEventListener("click", () => {
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

    if (editingCampaignId) {
      btn.textContent = "Saving…";
      const id = editingCampaignId;
      try {
        const res  = await authPost("/api/campaigns", { action: "update", payload: { id, name, theme } });
        const data = await res.json();
        if (!data.ok) { btn.textContent = "Save Changes →"; btn.disabled = false; return; }
        campaignList = campaignList.map(c => c.id === id ? data.campaign : c);
        renderCampaignList();
        closeWorldCreator();
      } catch(_) {
        btn.textContent = "Save Changes →";
        btn.disabled = false;
      }
      return;
    }

    const playerCount = parseInt(document.querySelector(".wc-count-btn.active")?.dataset.count || "2");
    const adult       = document.getElementById("wc-adult-checkbox")?.checked === true;
    btn.textContent = "Creating…";
    try {
      const res  = await authPost("/api/campaigns", { action: "create", payload: { name, theme, playerCount, adult } });
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

// Reuses the world-creator overlay in a locked-down "edit" mode: name and
// theme stay editable, but playerCount/adult are intentionally permanent
// after creation (changing playerCount risks orphaning an existing hero's
// data, and adult is a content-safety boundary, not a typo to fix).
// The campaign's *full* theme text only lives in its own gamestate
// (campaigns:index only stores a truncated subtitle for the world-selector
// list) — fetch it directly rather than editing the truncated version,
// which would otherwise silently replace a long theme with an ellipsis on save.
async function openWorldCreatorForEdit(id) {
  const camp = campaignList.find(c => c.id === id);
  if (!camp) return;

  let fullTheme = camp.subtitle || "";
  try {
    const res = await fetch(`/api/state?world=${id}`, { headers: { "X-Adult-Pin": adultPin || "" } });
    if (res.ok) {
      const state = await res.json();
      if (typeof state.worldConfig?.theme === "string") fullTheme = state.worldConfig.theme;
    }
  } catch(_) { /* fall back to the truncated subtitle rather than blocking the edit entirely */ }

  editingCampaignId = id;
  document.getElementById("wc-title").textContent = "✏️ Edit Your World";
  document.getElementById("wc-create-btn").textContent = "Save Changes →";
  document.getElementById("wc-name").value = camp.name;
  document.getElementById("wc-theme").value = fullTheme;

  document.querySelectorAll(".wc-count-btn").forEach(b => {
    b.classList.toggle("active", parseInt(b.dataset.count) === camp.playerCount);
    b.disabled = true;
  });
  document.getElementById("wc-count-field").classList.add("wc-locked");
  document.getElementById("wc-locked-hint").classList.remove("hidden");
  const adultCb = document.getElementById("wc-adult-checkbox");
  if (adultCb) { adultCb.checked = camp.adult === true; adultCb.disabled = true; }

  document.getElementById("world-creator").classList.add("active");
}

function closeWorldCreator() {
  document.getElementById("world-creator").classList.remove("active");
  document.getElementById("wc-name").value = "";
  document.getElementById("wc-theme").value = "";
  document.querySelectorAll(".wc-count-btn").forEach(b => { b.classList.toggle("active", b.dataset.count === "2"); b.disabled = false; });
  document.getElementById("wc-count-field").classList.remove("wc-locked");
  document.getElementById("wc-locked-hint").classList.add("hidden");
  const adultCb = document.getElementById("wc-adult-checkbox");
  if (adultCb) { adultCb.checked = false; adultCb.disabled = false; }

  editingCampaignId = null;
  document.getElementById("wc-title").textContent = "✨ Create Your World";
  document.getElementById("wc-create-btn").textContent = "Create World →";
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
  if (adultUnlocked) document.body.classList.add("adult-unlocked");
  await loadCampaigns();
  setupWorldSelector();
  setupWorldCreator();
  setupUnlockOverlay();
  setupDeleteConfirm();
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
  setupPushNotifications();
  setupExport();
  setupAuthorNote();
  setupRecap();
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

/* ── Push notifications ── */
async function setupPushNotifications() {
  const btn = document.getElementById("notify-btn");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return; // stays hidden

  let registration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
  } catch (_) {
    return; // stays hidden if registration fails for any reason
  }

  btn.classList.remove("hidden");
  updateNotifyButton(!!(await registration.pushManager.getSubscription()));

  btn.addEventListener("click", async () => {
    const current = await registration.pushManager.getSubscription();
    if (current) await unsubscribePush(current);
    else await subscribePush(registration);
  });
}

function updateNotifyButton(subscribed) {
  const btn = document.getElementById("notify-btn");
  btn.classList.toggle("active", subscribed);
  btn.title = subscribed ? "Notifications ON — tap to turn off" : "Notify me when someone else takes a turn";
}

async function subscribePush(registration) {
  if (Notification.permission === "denied") {
    alert("Notifications are blocked for this site in your browser settings.");
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const res = await fetch("/api/vapid-public-key");
    const data = await res.json();
    if (!data.publicKey) { alert("Notifications aren't set up yet — ask Matt to configure them."); return; }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
    await authPost("/api/push", { action: "subscribe", payload: { player: currentPlayer, subscription: subscription.toJSON() } });
    updateNotifyButton(true);
  } catch (_) {
    alert("Could not turn on notifications — try again.");
  }
}

async function unsubscribePush(subscription) {
  try {
    await authPost("/api/push", { action: "unsubscribe", payload: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  } catch (_) {
    // fall through — still reflect it as off locally even if the server call failed
  }
  updateNotifyButton(false);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
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
    const res = await authGet("/api/poll?since=0");
    if (handleLockedResponse(res.status)) return;
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
    resumePendingRollIfAny(data.pendingRoll);
  } catch(_) {
    appendSystemMessage("Could not load story — check your connection and reload the page.");
  }
}

/* ── Polling ── */
function startPolling() {
  pollTimer = setInterval(async () => {
    if (isLoading) return;
    try {
      const res = await authGet(`/api/poll?since=${lastTimestamp}`);
      if (res.status === 403) { clearInterval(pollTimer); pollTimer = null; handleLockedResponse(403); return; }
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
      resumePendingRollIfAny(data.pendingRoll);
    } catch(_) {}
  }, 8000);
}

/* ── Opening narration ── */
async function triggerOpeningIfNeeded() {
  try {
    const res = await authGet("/api/poll?since=0");
    if (handleLockedResponse(res.status)) return;
    const data = await res.json();
    if (data.entries.length === 0) await sendToGM(currentPlayer, "[SESSION BEGINS]", "begin");
  } catch(_) {}
}

/* ── Submit Action ── */
async function submitAction() {
  const text = actionInput.value.trim();
  if (!text || isLoading) return;
  // A player who types a bare number (e.g. "3") after being shown suggestion
  // chips means "the 3rd chip" — send that chip's actual text instead of the
  // ambiguous digit, which the GM has no reliable way to interpret on its own.
  const message = resolveSuggestionSelection(text, currentSuggestions) || text;
  actionInput.value = "";
  setLoading(true);
  hideSuggestionChips();
  appendPlayerEntry(currentPlayer, message, true);
  scrollToBottom();
  const ok = await sendToGM(currentPlayer, message, "action");
  // On failure (rate limit, server error, dropped connection), put the
  // player's own words back in the box so they can just hit send again
  // instead of retyping the whole thing.
  if (!ok) actionInput.value = text;
}

/* ── Suggestion chips ── */
function hideSuggestionChips() {
  suggestionChips.classList.add("hidden");
  suggestionChips.innerHTML = "";
  currentSuggestions = [];
}

function renderSuggestionChips(suggestions) {
  currentSuggestions = suggestions || [];
  if (!suggestions || !suggestions.length) { hideSuggestionChips(); return; }

  suggestionChips.innerHTML = "";
  suggestions.forEach((text) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "suggestion-chip";
    chip.textContent = text;
    chip.addEventListener("click", () => {
      actionInput.value = text;
      actionInput.focus();
    });
    suggestionChips.appendChild(chip);
  });

  const other = document.createElement("button");
  other.type = "button";
  other.className = "suggestion-chip other";
  other.textContent = "Other…";
  other.addEventListener("click", () => {
    actionInput.value = "";
    actionInput.focus();
  });
  suggestionChips.appendChild(other);

  suggestionChips.classList.remove("hidden");
}

// Returns true on success, false on any failure — callers use this to decide
// whether to put the player's original message back in the input box.
async function sendToGM(player, message, type) {
  setLoading(true);
  try {
    const res = await authPost("/api/gm", { player, message, type, ...(isManlandiaLike() && { tone: manlandiaTone }) });
    if (handleLockedResponse(res.status)) return false;
    const data = await res.json();
    if (data.error) { appendSystemMessage("Error: " + data.error); return false; }

    if (data.needsRoll) {
      hideSuggestionChips();
      const rollResult = await animateRoll(player, data.rollStat, data.rollAdvantage);
      appendRollResult(player, data.rollStat, rollResult);
      return await sendToGM(player, formatRollMessage(player, data.rollStat, rollResult), "roll_result");
    } else {
      const entry = appendGMEntry(data.response, true);
      if (autoRead && entry) speakText(getCleanText(data.response), entry.querySelector(".speak-btn"));
      renderSuggestionChips(data.suggestions);
      if (data.gameState) {
        cachedGameState = data.gameState;
        updateCharacterUI(data.gameState);
        lastTimestamp = data.serverTimestamp || Math.max(lastTimestamp, Date.now());
        if (document.getElementById("tab-map").classList.contains("active")) renderMap(cachedGameState);
      }
      scrollToBottom();
      return true;
    }
  } catch(_) {
    // A dropped connection (spotty mobile signal — realistic for a phone-first,
    // async game) is different from a server error response above: nothing
    // came back at all. Offer a one-tap retry of the exact same call rather
    // than just an alert, but no *automatic* retry — if the original request
    // actually reached the server and only the response was lost, silently
    // resending risks a duplicate turn in the shared story log.
    appendSystemMessage("Connection error. Check your internet and try again.", () => sendToGM(player, message, type));
    return false;
  } finally {
    setLoading(false);
  }
}

// A roll normally resolves automatically in the same call chain as sendToGM
// (see needsRoll above) — there's no manual "roll" button. If that chain
// gets interrupted (tab closed, app backgrounded, network drop) mid-animation,
// nothing else would ever retry it, so both the initial log load and every
// poll tick check for a pendingRoll left over from an earlier session and
// resume it here. `resumingRoll` guards against the animation's own delay
// (isLoading isn't set until sendToGM's roll_result call at the very end)
// letting a second poll tick start the same roll twice.
async function resumePendingRollIfAny(pending) {
  if (!pending || pending.player !== currentPlayer || isLoading || resumingRoll) return;
  resumingRoll = true;
  try {
    hideSuggestionChips();
    const rollResult = await animateRoll(pending.player, pending.stat, pending.advantage);
    appendRollResult(pending.player, pending.stat, rollResult);
    await sendToGM(pending.player, formatRollMessage(pending.player, pending.stat, rollResult), "roll_result");
  } finally {
    resumingRoll = false;
  }
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

/* ── Author's Note ── */
let authorNoteLoaded = false;

function setupAuthorNote() {
  const toggle = document.getElementById("author-note-toggle");
  const panel  = document.getElementById("author-note-panel");
  const input  = document.getElementById("author-note-input");
  const status = document.getElementById("author-note-status");

  toggle.addEventListener("click", async () => {
    const opening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden");
    toggle.setAttribute("aria-expanded", String(opening));
    if (opening && !authorNoteLoaded) {
      try {
        const res = await authGet("/api/state");
        if (handleLockedResponse(res.status)) return;
        const state = await res.json();
        input.value = state.worldState?.author_note || "";
        authorNoteLoaded = true;
      } catch(_) { /* leave the field blank — save still works, just without a prefilled value */ }
    }
  });

  document.getElementById("author-note-save").addEventListener("click", async () => {
    status.textContent = "Saving…";
    try {
      const res = await authPost("/api/state", { action: "set_author_note", payload: { note: input.value } });
      const data = await res.json();
      status.textContent = data.ok ? "Saved!" : "Save failed";
    } catch(_) { status.textContent = "Save failed"; }
    setTimeout(() => { status.textContent = ""; }, 2000);
  });
}

/* ── Export ── */
function setupExport() {
  document.getElementById("export-btn").addEventListener("click", async () => {
    try {
      const res = await authGet("/api/state");
      if (handleLockedResponse(res.status)) return;
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

/* ── Recap ── */
function setupRecap() {
  document.getElementById("recap-btn").addEventListener("click", loadRecap);
  document.getElementById("recap-close-btn").addEventListener("click", () => {
    document.getElementById("recap-overlay").classList.remove("active");
  });
  document.getElementById("recap-share-btn").addEventListener("click", shareRecap);
}

async function loadRecap() {
  const overlay = document.getElementById("recap-overlay");
  const textEl  = document.getElementById("recap-text");
  textEl.textContent = "Loading recap…";
  overlay.classList.add("active");
  try {
    const res  = await authGet("/api/recap");
    const data = await res.json();
    textEl.textContent = data.recap || data.error || "Could not load a recap right now.";
  } catch(_) {
    textEl.textContent = "Connection error. Check your internet and try again.";
  }
}

// Lets a parent send the recap to someone outside the app (grandparents,
// e.g.) as a highlights digest. Tries the native share sheet first (nicer
// on phones — this app is phone-first), falls back to a clipboard copy
// everywhere else (desktop browsers, or any browser without Web Share).
async function shareRecap() {
  const text   = document.getElementById("recap-text").textContent;
  const status = document.getElementById("recap-share-status");
  if (!text || text === "Loading recap…") return;

  const title = `${defaultGameTitle() || "Our Adventure"} — Session Recap`;
  const shareText = `${title}\n\n${text}`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text: shareText });
      return;
    } catch(_) {
      // User cancelled the share sheet, or the platform rejected it — fall
      // through to the clipboard so the button still does something useful.
    }
  }

  try {
    await navigator.clipboard.writeText(shareText);
    status.textContent = "Copied to clipboard!";
  } catch(_) {
    status.textContent = "Couldn't share or copy — try selecting the text above.";
  }
  setTimeout(() => { status.textContent = ""; }, 3000);
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
    // Editing an already-created hero: archetype/ability are already known
    // (see openWizard) — jump straight to the backstory step so fixing a
    // typo doesn't force re-picking both and risking an accidental change.
    wizSetStep(wizardData.archetype && wizardData.ability_id ? 4 : 2);
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
      return;
    }

    const choiceBtn = e.target.closest(".growth-choice-btn");
    if (choiceBtn) {
      const res = await authPost("/api/state", { action: "choose_ability", payload: { character: choiceBtn.dataset.player, ability_id: choiceBtn.dataset.ability } });
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
  if (existing?.photo) {
    document.getElementById("wiz-photo-preview").innerHTML = `<img src="${existing.photo}" alt="hero photo" />`;
  }
  if (existing?.archetype) {
    wizardData.archetype = existing.archetype;
    wizardData.ability_id = existing.ability_id;
    document.querySelector(`[data-archetype="${existing.archetype}"]`)?.classList.add("selected");
    document.querySelector(`[data-ability="${existing.ability_id}"]`)?.classList.add("selected");
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
      // Only sent when a new photo was actually picked this session — the
      // server preserves whatever's already saved otherwise. Stored on the
      // character record itself (not localStorage) so it syncs across every
      // family member's device instead of only the phone it was uploaded from.
      ...(wizardData.photo && { photo: wizardData.photo }),
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
      headers: { "Content-Type": "application/json", "X-Adult-Pin": adultPin || "" },
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

  // Avatar (photo from the character record, synced across devices, or initial letter)
  const avatarEl = document.getElementById(`p${n}-avatar`);
  if (avatarEl) {
    if (char?.photo) {
      avatarEl.innerHTML = `<img src="${char.photo}" alt="${char?.name || "Hero"}" />`;
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

  // Growth: XP, earned badges, and (if crossed a bigger milestone) a choice
  // of new power to unlock. See lib/growth.js — this only ever applies to
  // Manlandia/custom heroes, never Resonance's Lyra/Fen.
  const growthEl = document.getElementById(`p${n}-growth`);
  if (growthEl) {
    if (!isSetup) {
      growthEl.innerHTML = "";
    } else if (char.pending_choice?.options?.length) {
      growthEl.innerHTML = `
        <div class="growth-choice">
          <div class="growth-choice-label">🎉 New power unlocked! Choose one:</div>
          <div class="growth-choice-options">
            ${char.pending_choice.options.map(a => `<button class="growth-choice-btn" data-player="${p}" data-ability="${a}">${ABILITY_DISPLAY[a] || a}</button>`).join("")}
          </div>
        </div>`;
    } else {
      const xp = char.xp || 0;
      const badges = (char.milestones || []).map(m => `<span class="growth-badge" title="${m}">🏅</span>`).join("");
      growthEl.innerHTML = xp ? `<div class="growth-summary">XP: ${xp}${badges ? ` ${badges}` : ""}</div>` : "";
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

  // Per-character inventory — only ever populated for adult-flagged custom
  // campaigns (Manlandia and kid custom worlds use the shared party
  // inventory instead, see renderInventory), so this stays hidden otherwise.
  renderCharInventory(`p${n}`, char?.inventory);
}

/* ── Archive ── */
async function loadArchive() {
  try {
    const res = await authGet("/api/state");
    if (handleLockedResponse(res.status)) return;
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
  renderObjectives(state);
  renderLorebook(state);
  renderInventory(state);
}

// NPC lorebook — shared across all world types, populated via [NPC: ...].
function renderLorebook(state) {
  const panel = document.getElementById("lorebook-panel");
  const list  = document.getElementById("lorebook-list");
  if (!panel || !list) return;

  const npcs = state?.worldState?.npcs || [];
  if (!npcs.length) { panel.classList.add("hidden"); list.innerHTML = ""; return; }

  panel.classList.remove("hidden");
  list.innerHTML = npcs.map(n => `
    <li class="objective-item">
      <span><strong>${escapeHtml(n.name)}</strong> — ${escapeHtml(n.description)}</span>
    </li>
  `).join("");
}

// Shared party inventory — kid-friendly worlds only ([ITEM FOUND: ...]).
// Adult games track items per-character instead — see renderCharInventory.
function renderInventory(state) {
  const panel = document.getElementById("inventory-panel");
  const list  = document.getElementById("inventory-list");
  if (!panel || !list) return;

  const items = state?.worldState?.inventory || [];
  if (!items.length) { panel.classList.add("hidden"); list.innerHTML = ""; return; }

  panel.classList.remove("hidden");
  list.innerHTML = items.map(item => `<li class="objective-item"><span>${escapeHtml(item)}</span></li>`).join("");
}

// Per-character carried items — adult games only ([ITEM N: ...] / [ITEM
// FEN|LYRA: ...]). Shared by both the Resonance cards and the Manlandia/
// custom playerN cards; harmlessly stays hidden wherever inventory is empty
// (which is always, for worlds using the shared party inventory instead).
function renderCharInventory(idPrefix, items) {
  const el = document.getElementById(`${idPrefix}-inventory`);
  if (!el) return;
  const list = items || [];
  if (!list.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  el.innerHTML = `🎒 ${list.map(escapeHtml).join(", ")}`;
}

// Shared across all world types — generalizes Manlandia's stone tracker
// (a fixed checklist) to arbitrary free-text quest goals the GM can add via
// [OBJECTIVE: ...] / [OBJECTIVE COMPLETE: ...] for any world.
function renderObjectives(state) {
  const panel = document.getElementById("objectives-panel");
  const list  = document.getElementById("objectives-list");
  if (!panel || !list) return;

  const objectives = state?.worldState?.objectives || [];
  if (!objectives.length) { panel.classList.add("hidden"); list.innerHTML = ""; return; }

  panel.classList.remove("hidden");
  list.innerHTML = objectives.map(o => `
    <li class="objective-item${o.done ? " done" : ""}">
      <span class="objective-check">${o.done ? "✓" : "○"}</span>
      <span>${escapeHtml(o.text)}</span>
    </li>
  `).join("");
}

function renderCustomMap(state) {
  const ws   = state?.worldState || {};
  const camp = campaignList.find(c => c.id === currentWorld) || {};
  const el   = document.getElementById("map-container-custom");
  if (!el) return;
  el.style.display = "block";
  el.innerHTML = `
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
      ${renderJourneyTrail(ws)}
    </div>
  `;
}

// Custom worlds have no fixed geography to pin onto a curated map graphic
// (the GM invents arbitrary locations per campaign) — so instead of a literal
// map, this renders the places visited as a chronological scrapbook trail,
// with any scars that happened there shown inline. Data comes from
// worldState.visited_locations / location_scars, which for custom worlds
// are keyed by the location's own text rather than a fixed ID (see
// matchCustomLocationId() in api/gm.js).
function renderJourneyTrail(ws) {
  const visited = ws.visited_locations || [];
  if (!visited.length) return "";

  const scarsByLocation = {};
  (ws.location_scars || []).forEach(s => {
    if (!scarsByLocation[s.id]) scarsByLocation[s.id] = [];
    scarsByLocation[s.id].push(s.label);
  });

  return `
    <div class="journey-trail">
      <div class="journey-trail-label">YOUR JOURNEY</div>
      <ul class="journey-trail-list">
        ${visited.map(loc => {
          const isCurrent = loc === ws.location;
          const scars = scarsByLocation[loc] || [];
          return `
            <li class="journey-stop${isCurrent ? " current" : ""}">
              <span class="journey-marker">${isCurrent ? "📍" : "○"}</span>
              <div class="journey-content">
                <span class="journey-name">${escapeHtml(loc)}</span>
                ${scars.length ? `<div class="journey-scars">${scars.map(s => `<span class="journey-scar">✕ ${escapeHtml(s)}</span>`).join("")}</div>` : ""}
              </div>
            </li>`;
        }).join("")}
      </ul>
    </div>
  `;
}

function renderResonanceMap(state) {
  const customEl = document.getElementById("map-container-custom");
  if (customEl) customEl.style.display = "none";
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
  const customEl = document.getElementById("map-container-custom");
  if (customEl) customEl.style.display = "none";
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
function appendGMEntry(text, animate) {
  const cleanText    = getCleanText(text);
  const stateChanges = extractStateChanges(text);

  const entry = document.createElement("div");
  entry.className = `log-entry gm${animate ? "" : " no-anim"}`;
  entry.innerHTML = `
    <div class="entry-header">
      <span class="entry-label">The Story</span>
      <button class="speak-btn" title="Read aloud" aria-label="Read aloud">🔊</button>
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

function appendSystemMessage(msg, onRetry) {
  const entry = document.createElement("div");
  entry.className = "system-message";
  entry.textContent = msg;
  if (onRetry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "system-message-retry";
    btn.textContent = "↻ Retry";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "Retrying…";
      onRetry();
    }, { once: true });
    entry.appendChild(document.createElement("br"));
    entry.appendChild(btn);
  }
  logEntries.appendChild(entry);
  scrollToBottom();
}

/* ── Update Character UI ── */
function updateCharacterUI(data) {
  const chars = data.characters || data.gameState?.characters;
  const ws    = data.worldState  || data.gameState?.worldState;
  if (!chars) return;

  if (isManlandiaLike()) {
    syncPlayerStats(chars);
    const playerCount = currentWorld.startsWith("c_")
      ? (cachedGameState?.worldConfig?.playerCount
         || campaignList.find(c => c.id === currentWorld)?.playerCount
         || 4)
      : 4;
    [1,2,3,4].forEach(n => {
      const visible = n <= playerCount;
      const card = document.getElementById(`p${n}-card`);
      if (card) card.style.display = visible ? "" : "none";
      const btn = document.getElementById(`btn-p${n}`);
      if (btn) btn.style.display = visible ? "" : "none";
      if (!visible) return;

      const p = `player${n}`;
      updateHarm(`p${n}`, chars[p]?.harm);
      const nameEl = document.getElementById(`p${n}-name`);
      if (nameEl && chars[p]?.name) {
        const displayName = chars[p].name !== `Hero ${n}` ? chars[p].name.toUpperCase() : `HERO ${n}`;
        nameEl.textContent = displayName;
        if (btn) btn.textContent = displayName;
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

    renderCharInventory("fen",  chars.fen?.inventory);
    renderCharInventory("lyra", chars.lyra?.inventory);

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

/* ── Adult Unlock Overlay ── */
function setupUnlockOverlay() {
  const overlayEl = document.getElementById("unlock-overlay");
  const pinInput  = document.getElementById("unlock-pin-input");
  const errorEl   = document.getElementById("unlock-error");
  if (!overlayEl) return;

  document.getElementById("unlock-adult-btn")?.addEventListener("click", () => {
    pinInput.value = "";
    errorEl.classList.add("hidden");
    overlayEl.classList.add("active");
    setTimeout(() => pinInput.focus(), 100);
  });

  document.getElementById("unlock-cancel-btn")?.addEventListener("click", () => {
    overlayEl.classList.remove("active");
  });

  async function tryUnlock() {
    const pin = pinInput.value.trim();
    if (!pin) { pinInput.focus(); return; }
    const submitBtn = document.getElementById("unlock-submit-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Checking…";
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        adultUnlocked = true;
        adultPin = pin;
        localStorage.setItem("adult_unlocked", "true");
        localStorage.setItem("adult_pin", pin);
        document.body.classList.add("adult-unlocked");
        overlayEl.classList.remove("active");
        renderCampaignList();
        // If polling had been stopped by a locked-response (see handleLockedResponse),
        // this picks it back up now that the pin is valid again.
        if (continueInitDone && !pollTimer) startPolling();
      } else if (res.status === 500) {
        errorEl.textContent = "Not configured — ask Matt to set ADULT_PIN in Vercel";
        errorEl.classList.remove("hidden");
      } else {
        errorEl.textContent = "Wrong PIN — try again";
        errorEl.classList.remove("hidden");
        pinInput.value = "";
        pinInput.focus();
      }
    } catch(_) {
      errorEl.textContent = "Connection error — try again";
      errorEl.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Unlock →";
    }
  }

  document.getElementById("unlock-submit-btn")?.addEventListener("click", tryUnlock);
  pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
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
