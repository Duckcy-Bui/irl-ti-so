const STORAGE_KEY = "notoc-nkfc-2026-08-07-scoreboard";
const MATCH_ID = "notoc-nkfc-2026-08-07";
const FIREBASE_SDK_VERSION = "12.15.0";

const firebaseConfig = {
  apiKey: "AIzaSyCQdg87geu7Wr4KjLyCqxOPpq2eE-V_eqw",
  authDomain: "irl-ti-so.firebaseapp.com",
  projectId: "irl-ti-so",
  storageBucket: "irl-ti-so.firebasestorage.app",
  messagingSenderId: "294759777911",
  appId: "1:294759777911:web:c11692590e7f9defc56872",
  measurementId: "G-M5Y4T0DQGV",
  databaseURL: "https://irl-ti-so-default-rtdb.firebaseio.com"
};

const routeParams = new URLSearchParams(window.location.search);
const isOverlayMode = routeParams.has("overlay") || routeParams.get("view") === "overlay";
const isRemoteConfigured = Boolean(firebaseConfig.databaseURL);

const defaultState = {
  half: 1,
  swapped: false,
  matchSeconds: 0,
  clockRunning: false,
  clockStartedAt: null,
  teams: [
    {
      id: "no-toc",
      name: "FC NỢ TỘC",
      score: 0,
      color: "#e4222f"
    },
    {
      id: "nk-fc",
      name: "NK FC",
      score: 0,
      color: "#38bdf8"
    }
  ]
};

let state = loadState();
let remoteRef = null;
let writeRemoteState = null;
let writeRemotePatch = null;
let isApplyingRemoteState = false;

const elements = {
  scoreboard: document.querySelector(".scoreboard"),
  halfLabel: document.querySelector("#halfLabel"),
  leftTeam: document.querySelector("#leftTeam"),
  rightTeam: document.querySelector("#rightTeam"),
  leftName: document.querySelector("#leftName"),
  rightName: document.querySelector("#rightName"),
  leftScore: document.querySelector("#leftScore"),
  rightScore: document.querySelector("#rightScore"),
  clockLabel: document.querySelector("#clockLabel"),
  panelClock: document.querySelector("#panelClock"),
  summaryText: document.querySelector("#summaryText"),
  sideText: document.querySelector("#sideText"),
  syncText: document.querySelector("#syncText"),
  teamControls: document.querySelector("#teamControls"),
  clockToggleButton: document.querySelector("#clockToggleButton"),
  clockMinusButton: document.querySelector("#clockMinusButton"),
  clockPlusButton: document.querySelector("#clockPlusButton"),
  clockResetButton: document.querySelector("#clockResetButton"),
  swapButton: document.querySelector("#swapButton"),
  halfButton: document.querySelector("#halfButton"),
  resetButton: document.querySelector("#resetButton")
};

document.body.classList.toggle("overlay-mode", isOverlayMode);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!saved || !Array.isArray(saved.teams) || saved.teams.length !== 2) {
      return structuredClone(defaultState);
    }

    return mergeSavedState(saved);
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeSavedState(saved) {
  return {
    half: saved.half === 2 ? 2 : 1,
    swapped: Boolean(saved.swapped),
    matchSeconds: normalizeClockSeconds(saved.matchSeconds),
    clockRunning: Boolean(saved.clockRunning),
    clockStartedAt: Number.isFinite(Number(saved.clockStartedAt)) ? Number(saved.clockStartedAt) : null,
    teams: defaultState.teams.map((team) => {
      const savedTeam = Array.isArray(saved.teams)
        ? saved.teams.find((item) => item.id === team.id)
        : null;

      return {
        ...team,
        score: normalizeScore(savedTeam?.score)
      };
    })
  };
}

function saveState({ syncRemote = true, syncClock = true } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (syncRemote && writeRemoteState && !isApplyingRemoteState) {
    const writeOperation = syncClock || !writeRemotePatch
      ? writeRemoteState(toStoredState(state))
      : writeRemotePatch(toScorePatch(state));

    writeOperation.catch((error) => {
      updateSyncStatus(`Lỗi sync: ${error.code || error.message}`, false);
    });
  }
}

function toStoredState(currentState) {
  const currentClockSeconds = getCurrentClockSeconds();
  const syncedAt = Date.now();

  return {
    half: currentState.half,
    swapped: currentState.swapped,
    matchSeconds: currentClockSeconds,
    clockRunning: currentState.clockRunning,
    clockStartedAt: currentState.clockRunning ? syncedAt : null,
    teams: currentState.teams.map((team) => ({
      id: team.id,
      name: team.name,
      score: normalizeScore(team.score),
      color: team.color
    })),
    updatedAt: syncedAt
  };
}

function toScorePatch(currentState) {
  return {
    teams: currentState.teams.map((team) => ({
      id: team.id,
      name: team.name,
      score: normalizeScore(team.score),
      color: team.color
    })),
    scoreUpdatedAt: Date.now()
  };
}

function normalizeScore(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeClockSeconds(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getCurrentClockSeconds() {
  if (!state.clockRunning || !state.clockStartedAt) {
    return state.matchSeconds;
  }

  const elapsed = Math.floor((Date.now() - state.clockStartedAt) / 1000);
  return Math.max(0, state.matchSeconds + elapsed);
}

function formatClock(seconds) {
  const safeSeconds = normalizeClockSeconds(seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getDisplayTeams() {
  return state.swapped ? [...state.teams].reverse() : state.teams;
}

function getTeamById(teamId) {
  return state.teams.find((team) => team.id === teamId);
}

function renderScoreboard() {
  const [left, right] = getDisplayTeams();
  const clockText = formatClock(getCurrentClockSeconds());

  elements.halfLabel.textContent = `H${state.half}`;
  elements.leftName.textContent = left.name;
  elements.rightName.textContent = right.name;
  elements.leftScore.textContent = left.score;
  elements.rightScore.textContent = right.score;
  elements.clockLabel.textContent = clockText;
  elements.panelClock.textContent = clockText;

  applyTeamAccent(elements.leftTeam, left.color);
  applyTeamAccent(elements.rightTeam, right.color);

  elements.summaryText.textContent = `${left.name} ${left.score} - ${right.score} ${right.name}`;
  elements.sideText.textContent = state.swapped ? "Đã đổi bên" : "Vị trí gốc";

  if (elements.clockToggleButton) {
    elements.clockToggleButton.innerHTML = state.clockRunning
      ? '<span aria-hidden="true">II</span> Tạm dừng'
      : '<span aria-hidden="true">▶</span> Bắt đầu';
  }
}

function applyTeamAccent(teamElement, color) {
  teamElement.style.setProperty("--team-color", color);
  const accent = teamElement.querySelector(".team-accent");
  accent.style.background = color;
  accent.style.color = color;
}

function renderControls() {
  if (isOverlayMode) {
    return;
  }

  elements.teamControls.replaceChildren(
    ...state.teams.map((team) => {
      const card = document.createElement("article");
      card.className = "team-card";
      card.style.setProperty("--team-color", team.color);

      const label = document.createElement("div");
      label.className = "team-card-name";

      const chip = document.createElement("span");
      chip.className = "color-chip";
      chip.setAttribute("aria-hidden", "true");

      const name = document.createElement("span");
      name.textContent = team.name;

      label.append(chip, name);

      const editor = document.createElement("div");
      editor.className = "score-editor";

      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "score-stepper";
      minus.textContent = "−";
      minus.setAttribute("aria-label", `Giảm tỉ số ${team.name}`);
      minus.addEventListener("click", () => updateScore(team.id, team.score - 1));

      const input = document.createElement("input");
      input.className = "score-input";
      input.type = "number";
      input.min = "0";
      input.inputMode = "numeric";
      input.value = team.score;
      input.setAttribute("aria-label", `Tỉ số ${team.name}`);
      input.addEventListener("input", () => updateScore(team.id, input.value, false));

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "score-stepper";
      plus.textContent = "+";
      plus.setAttribute("aria-label", `Tăng tỉ số ${team.name}`);
      plus.addEventListener("click", () => updateScore(team.id, team.score + 1));

      editor.append(minus, input, plus);
      card.append(label, editor);

      return card;
    })
  );
}

function render() {
  renderScoreboard();
  renderControls();
}

function updateScore(teamId, score, shouldRenderControls = true) {
  const team = getTeamById(teamId);
  if (!team) {
    return;
  }

  team.score = normalizeScore(score);
  saveState({ syncClock: false });
  renderScoreboard();

  if (shouldRenderControls && !isOverlayMode) {
    renderControls();
  }

  flashScore();
}

function flashScore() {
  elements.scoreboard.classList.remove("score-flash");
  void elements.scoreboard.offsetWidth;
  elements.scoreboard.classList.add("score-flash");
}

function flashSwap() {
  elements.scoreboard.classList.remove("swap-flash");
  void elements.scoreboard.offsetWidth;
  elements.scoreboard.classList.add("swap-flash");
}

function bindControls() {
  if (isOverlayMode) {
    return;
  }

  elements.swapButton.addEventListener("click", () => {
    state.swapped = !state.swapped;
    saveState();
    render();
    flashSwap();
  });

  elements.halfButton.addEventListener("click", () => {
    state.half = state.half === 1 ? 2 : 1;
    saveState();
    render();
  });

  elements.clockToggleButton.addEventListener("click", () => {
    if (state.clockRunning) {
      state.matchSeconds = getCurrentClockSeconds();
      state.clockRunning = false;
      state.clockStartedAt = null;
    } else {
      state.clockRunning = true;
      state.clockStartedAt = Date.now();
    }

    saveState();
    renderScoreboard();
  });

  elements.clockMinusButton.addEventListener("click", () => {
    state.matchSeconds = Math.max(0, getCurrentClockSeconds() - 60);
    state.clockStartedAt = state.clockRunning ? Date.now() : null;
    saveState();
    renderScoreboard();
  });

  elements.clockPlusButton.addEventListener("click", () => {
    state.matchSeconds = getCurrentClockSeconds() + 60;
    state.clockStartedAt = state.clockRunning ? Date.now() : null;
    saveState();
    renderScoreboard();
  });

  elements.clockResetButton.addEventListener("click", () => {
    state.matchSeconds = 0;
    state.clockRunning = false;
    state.clockStartedAt = null;
    saveState();
    renderScoreboard();
  });

  elements.resetButton.addEventListener("click", () => {
    state = structuredClone(defaultState);
    saveState();
    render();
    flashScore();
  });
}

async function setupFirebaseSync() {
  if (!isRemoteConfigured) {
    updateSyncStatus("Local, chưa có databaseURL", false);
    return;
  }

  try {
    const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
    const databaseModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`);
    const app = appModule.initializeApp(firebaseConfig);
    const database = databaseModule.getDatabase(app);
    remoteRef = databaseModule.ref(database, `matches/${MATCH_ID}`);
    writeRemoteState = (nextState) => databaseModule.set(remoteRef, nextState);
    writeRemotePatch = (nextPatch) => databaseModule.update(remoteRef, nextPatch);

    databaseModule.onValue(remoteRef, (snapshot) => {
      const remoteState = snapshot.val();

      if (!remoteState) {
        if (!isOverlayMode) {
          saveState();
        }

        updateSyncStatus("Đã kết nối", true);
        return;
      }

      isApplyingRemoteState = true;
      state = mergeSavedState(remoteState);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      isApplyingRemoteState = false;
      renderScoreboard();

      if (!isOverlayMode && !document.activeElement?.classList?.contains("score-input")) {
        renderControls();
      }

      updateSyncStatus("Đã đồng bộ", true);
    }, (error) => {
      updateSyncStatus(`Lỗi sync: ${error.code || error.message}`, false);
    });
  } catch (error) {
    updateSyncStatus("Không tải được Firebase", false);
    console.error(error);
  }
}

function updateSyncStatus(message, isOnline) {
  if (!elements.syncText) {
    return;
  }

  elements.syncText.textContent = message;
  elements.syncText.classList.toggle("sync-online", isOnline);
  elements.syncText.classList.toggle("sync-offline", !isOnline);
}

bindControls();
render();
setupFirebaseSync();

setInterval(() => {
  if (state.clockRunning) {
    renderScoreboard();
  }
}, 250);
