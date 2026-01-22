// Game constants
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const TRAIL_WIDTH = 4;

// DOM Elements
const lobby = document.getElementById("lobby");
const gameScreen = document.getElementById("gameScreen");
const joinForm = document.getElementById("joinForm");
const lobbyPanel = document.getElementById("lobbyPanel");
const playerNameInput = document.getElementById("playerNameInput");
const joinButton = document.getElementById("joinButton");
const readyButton = document.getElementById("readyButton");
const playerList = document.getElementById("playerList");
const playerCount = document.getElementById("playerCount");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const countdown = document.getElementById("countdown");
const roundEnd = document.getElementById("roundEnd");
const hudPlayerList = document.getElementById("hudPlayerList");
const hudControlsList = document.getElementById("hudControlsList");

// Socket connection - change this URL to your deployed server
const SERVER_URL = "https://gregdoes.dev";
const socket = io(SERVER_URL);

// Client state
let myPlayerId = null;
let currentGameState = null;
let pressedKeys = new Set();
let explosions = [];

const ROUND_END_OVERLAY_DELAY_MS = 700;
let roundEndOverlayVisible = true;
let roundEndOverlayTimer = null;

const HUD_UPDATE_INTERVAL_MS = 250;
let lastHudUpdateMs = 0;

// Cached render layers
const backgroundCanvas = document.createElement("canvas");
const backgroundCtx = backgroundCanvas.getContext("2d");
const trailCanvas = document.createElement("canvas");
const trailCtx = trailCanvas.getContext("2d");

backgroundCanvas.width = CANVAS_WIDTH;
backgroundCanvas.height = CANVAS_HEIGHT;
trailCanvas.width = CANVAS_WIDTH;
trailCanvas.height = CANVAS_HEIGHT;

const lastTrailPointByPlayerId = new Map();

// Setup canvas
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

buildBackgroundLayer();
resetTrailLayer();

// Socket event handlers
socket.on("connect", () => {
  console.log("Connected to server");
  myPlayerId = socket.id;
});

socket.on("gameState", (state) => {
  const previousState = currentGameState?.state;
  currentGameState = normalizeGameStateSnapshot(currentGameState, state);

  if (state.state !== previousState) {
    // Clear trails when transitioning into/out of gameplay unless we received a full trail snapshot.
    const hasTrailSnapshot = state.players?.some(
      (p) => Array.isArray(p.trail) && p.trail.length,
    );
    if (
      !hasTrailSnapshot &&
      (state.state === "playing" || previousState === "playing")
    ) {
      resetTrailLayer();
    }

    if (state.state === "lobby") {
      resetTrailLayer();
    }
  }

  // If the server sent a trail snapshot (e.g., joining mid-round), rebuild once.
  if (state.players?.some((p) => Array.isArray(p.trail))) {
    rebuildTrailLayerFromState(state);
  }

  if (state.state === "round_end" && previousState !== "round_end") {
    roundEndOverlayVisible = false;
    if (roundEndOverlayTimer) clearTimeout(roundEndOverlayTimer);
    roundEndOverlayTimer = setTimeout(() => {
      roundEndOverlayVisible = true;
      updateUI(currentGameState);
    }, ROUND_END_OVERLAY_DELAY_MS);
  } else if (state.state !== "round_end") {
    roundEndOverlayVisible = true;
    if (roundEndOverlayTimer) {
      clearTimeout(roundEndOverlayTimer);
      roundEndOverlayTimer = null;
    }
  }

  updateUI(state);
});

socket.on("frame", (frame) => {
  if (!currentGameState) {
    currentGameState = normalizeGameStateSnapshot(null, frame);
    updateUI(currentGameState);
    return;
  }

  // If state changes (rare for frame packets), update screen layout.
  const previousState = currentGameState.state;
  currentGameState = {
    ...currentGameState,
    ...frame,
    players: mergePlayers(currentGameState.players, frame.players),
  };

  if (currentGameState.state !== previousState) {
    updateUI(currentGameState);
  }

  // Apply incremental trail updates to the cached trail layer.
  if (Array.isArray(frame.trailUpdates) && frame.trailUpdates.length) {
    const playersById = new Map(currentGameState.players.map((p) => [p.id, p]));
    for (const update of frame.trailUpdates) {
      const player = playersById.get(update.playerId);
      if (!player) continue;
      applyTrailPoint(player, update.point);
    }
  }

  // Throttle DOM-heavy HUD updates.
  if (
    currentGameState.state === "playing" ||
    currentGameState.state === "round_end"
  ) {
    const now = performance.now();
    if (now - lastHudUpdateMs >= HUD_UPDATE_INTERVAL_MS) {
      lastHudUpdateMs = now;
      updateHUD(currentGameState);
    }
  }
});

socket.on("error", (message) => {
  alert(message);
});

// Join game
joinButton.addEventListener("click", () => {
  const playerName = playerNameInput.value.trim();
  if (!playerName) {
    alert("Please enter your name");
    return;
  }

  socket.emit("joinGame", playerName);
  joinForm.style.display = "none";
  lobbyPanel.style.display = "block";
});

// Player ready
readyButton.addEventListener("click", () => {
  socket.emit("playerReady");
  readyButton.disabled = true;
  readyButton.textContent = "Waiting for others...";
});

// Keyboard input
window.addEventListener("keydown", (e) => {
  if (!currentGameState || currentGameState.state !== "playing") return;

  pressedKeys.add(e.key);
  sendInput();
});

window.addEventListener("keyup", (e) => {
  pressedKeys.delete(e.key);
  sendInput();
});

function sendInput() {
  const player = currentGameState?.players.find((p) => p.id === myPlayerId);
  if (!player) return;

  let turning = 0;

  if (pressedKeys.has("ArrowLeft")) {
    turning = -1;
  } else if (pressedKeys.has("ArrowRight")) {
    turning = 1;
  }

  socket.emit("playerInput", { turning });
}

// Update UI based on game state
function updateUI(state) {
  switch (state.state) {
    case "lobby":
      lobby.style.display = "flex";
      gameScreen.style.display = "none";
      updateLobby(state);
      break;

    case "countdown":
      lobby.style.display = "none";
      gameScreen.style.display = "flex";
      countdown.style.display = "flex";
      roundEnd.style.display = "none";
      showCountdown(state.countdown);
      updateHUD(state);
      break;

    case "playing":
      lobby.style.display = "none";
      gameScreen.style.display = "flex";
      countdown.style.display = "none";
      roundEnd.style.display = "none";
      updateHUD(state);
      break;

    case "round_end":
      lobby.style.display = "none";
      gameScreen.style.display = "flex";
      countdown.style.display = "none";

      if (roundEndOverlayVisible) {
        roundEnd.style.display = "flex";
        showRoundEnd(state);
      } else {
        roundEnd.style.display = "none";
        updateHUD(state);
      }
      break;

    case "game_over":
      lobby.style.display = "none";
      gameScreen.style.display = "flex";
      countdown.style.display = "none";
      roundEnd.style.display = "flex";
      showGameOver(state);
      break;
  }
}

// Update lobby player list
function updateLobby(state) {
  playerCount.textContent = `${state.players.length}/10`;
  const readySet = new Set(state.readyPlayers || []);

  playerList.innerHTML = "";
  state.players.forEach((player) => {
    const isReady = readySet.has(player.id);
    const isMe = player.id === myPlayerId;

    const item = document.createElement("div");
    item.className = "player-item";
    item.innerHTML = `
      <div class="player-avatar" style="color: ${player.color}; border-color: ${player.color}">
        ${player.name.charAt(0).toUpperCase()}
      </div>
      <div class="player-info">
        <div class="player-name">${player.name} ${isMe ? "(You)" : ""}</div>
        <div class="player-controls">Controls ← / →</div>
      </div>
      <span class="player-status ${isReady ? "ready" : "waiting"}">
        ${isReady ? "Ready" : "Waiting"}
      </span>
    `;

    playerList.appendChild(item);
  });
}

// Show countdown
function showCountdown(count) {
  const numberEl = document.querySelector(".countdown-number");
  numberEl.textContent = count;

  // Trigger animation
  numberEl.style.animation = "none";
  setTimeout(() => {
    numberEl.style.animation = "";
  }, 10);
}

// Update HUD
function updateHUD(state) {
  // Update player list
  hudPlayerList.innerHTML = "";
  state.players.forEach((player) => {
    const div = document.createElement("div");
    div.className = `hud-player ${!player.alive ? "dead" : ""}`;
    div.innerHTML = `
      <span class="hud-player-dot" style="color: ${player.color}"></span>
      <span>${player.name}</span>
      <span style="margin-left: auto; font-weight: 700;">${player.score}</span>
    `;
    hudPlayerList.appendChild(div);
  });

  // Update controls
  hudControlsList.innerHTML = "";
  state.players.forEach((player) => {
    if (player.id === myPlayerId) {
      const div = document.createElement("div");
      div.className = "hud-control";
      let powerupText = "";
      if (player.powerupEffects && player.powerupEffects.length > 0) {
        // Show the effect with the longest remaining time
        let maxEffect = player.powerupEffects[0];
        let maxRemaining = maxEffect.endFrame - state.frameCount;
        for (const effect of player.powerupEffects) {
          const remaining = effect.endFrame - state.frameCount;
          if (remaining > maxRemaining) {
            maxRemaining = remaining;
            maxEffect = effect;
          }
        }
        const remaining = Math.ceil(maxRemaining / 60);
        powerupText = ` (${maxEffect.type === "speed_boost" ? "Speed+" : "Speed-"} ${remaining}s)`;
      }
      div.innerHTML = `
        <span style="color: ${player.color}">${player.name}${powerupText}</span>
        <span class="hud-control-keys">${player.controls.name}</span>
      `;
      hudControlsList.appendChild(div);
    }
  });
}

// Show round end
function showRoundEnd(state) {
  const winner = state.players.find((p) => p.alive);
  const winnerText = document.getElementById("winnerText");

  if (winner) {
    winnerText.textContent = `${winner.name} Wins!`;
    winnerText.style.color = winner.color;
  } else {
    winnerText.textContent = "Draw!";
    winnerText.style.background = "linear-gradient(135deg, #E20074, #00D68F)";
    winnerText.style.webkitBackgroundClip = "text";
    winnerText.style.webkitTextFillColor = "transparent";
  }

  // Update scoreboard
  const scoreBoard = document.getElementById("scoreBoard");
  scoreBoard.innerHTML = "";

  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
  sortedPlayers.forEach((player) => {
    const div = document.createElement("div");
    div.className = "score-item";
    div.style.borderLeftColor = player.color;
    div.innerHTML = `
      <span class="score-name">${player.name}</span>
      <span class="score-points">${player.score}</span>
    `;
    scoreBoard.appendChild(div);
  });
}

// Show game over
function showGameOver(state) {
  const winnerText = document.getElementById("winnerText");

  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sortedPlayers[0];

  winnerText.textContent = `Game Over! ${winner.name} Wins the Match!`;
  winnerText.style.color = winner.color;

  // Update final scoreboard
  const scoreBoard = document.getElementById("scoreBoard");
  scoreBoard.innerHTML = "";

  sortedPlayers.forEach((player) => {
    const div = document.createElement("div");
    div.className = "score-item";
    div.style.borderLeftColor = player.color;
    div.innerHTML = `
      <span class="score-name">${player.name}</span>
      <span class="score-points">${player.score}</span>
    `;
    scoreBoard.appendChild(div);
  });
}

// Create explosion effect
function createExplosion(x, y, color) {
  const particles = [];
  const numParticles = 20;
  for (let i = 0; i < numParticles; i++) {
    const angle = (Math.PI * 2 * i) / numParticles;
    const speed = Math.random() * 5 + 2;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 60, // frames
      maxLife: 60,
      color: color,
    });
  }
  explosions.push({ particles });
}

// Render game
function renderGame(state) {
  ctx.drawImage(backgroundCanvas, 0, 0);
  ctx.drawImage(trailCanvas, 0, 0);

  // Draw player heads + names (cheap; trails are cached)
  state.players.forEach((player) => {
    if (!player.alive) return;

    // Draw powerup aura if active
    if (player.powerupEffects && player.powerupEffects.length > 0) {
      // Find the effect with the most remaining time for aura
      let maxRemaining = 0;
      let auraColor = "#FFFFFF";
      for (const effect of player.powerupEffects) {
        const remaining = effect.endFrame - state.frameCount;
        if (remaining > maxRemaining) {
          maxRemaining = remaining;
          auraColor = effect.type === "speed_boost" ? "#00FF00" : "#FF0000";
        }
      }
      const progress = maxRemaining / (10 * 60); // 10 seconds at 60 FPS
      const radius = TRAIL_WIDTH * 1.5 + progress * 10;

      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, TRAIL_WIDTH * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(player.name, player.x, player.y - 15);
  });

  // Draw powerups
  if (state.powerups) {
    state.powerups.forEach((powerup) => {
      ctx.save();
      ctx.fillStyle = powerup.type.color;
      ctx.beginPath();
      ctx.arc(powerup.x, powerup.y, 20, 0, Math.PI * 2);
      ctx.fill();

      // Inner circle for contrast
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(powerup.x, powerup.y, 14, 0, Math.PI * 2);
      ctx.fill();

      // Icon (simple shape)
      ctx.fillStyle = powerup.type.color;
      if (powerup.type.id === "speed_boost") {
        // Arrow up
        ctx.beginPath();
        ctx.moveTo(powerup.x, powerup.y - 8);
        ctx.lineTo(powerup.x - 5, powerup.y + 3);
        ctx.lineTo(powerup.x + 5, powerup.y + 3);
        ctx.closePath();
        ctx.fill();
      } else if (powerup.type.id === "speed_slow") {
        // Arrow down
        ctx.beginPath();
        ctx.moveTo(powerup.x, powerup.y + 8);
        ctx.lineTo(powerup.x - 5, powerup.y - 3);
        ctx.lineTo(powerup.x + 5, powerup.y - 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // Draw collision VFX on top
  drawEffects(state);
}

function drawEffects(state) {
  if (!state.effects || state.effects.length === 0) return;

  const currentFrame = state.frameCount ?? 0;

  for (const effect of state.effects) {
    const progressRaw =
      (currentFrame - effect.createdAtFrame) / effect.durationFrames;
    const progress = Math.max(0, Math.min(1, progressRaw));
    const fade = 1 - progress;

    const radius = 6 + progress * 34;
    const lineWidth = 2 + fade * 3;
    const alpha = 0.75 * fade;

    // Outer ring(s)
    const colors =
      Array.isArray(effect.colors) && effect.colors.length
        ? effect.colors
        : ["#FFFFFF"];
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.shadowBlur = 12 * fade;
      ctx.shadowColor = color;

      // Slightly offset multi-color rings so both are visible
      const r = radius + i * 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Sparks (deterministic per effect.id)
    const sparkCount = effect.kind === "player" ? 14 : 10;
    for (let s = 0; s < sparkCount; s++) {
      const seed = (effect.id ?? 1) * 997 + s * 101;
      const angle = seeded01(seed) * Math.PI * 2;
      const len = (8 + seeded01(seed + 7) * 14) * fade;
      const inner = radius * (0.6 + seeded01(seed + 13) * 0.4);

      const x1 = effect.x + Math.cos(angle) * inner;
      const y1 = effect.y + Math.sin(angle) * inner;
      const x2 = effect.x + Math.cos(angle) * (inner + len);
      const y2 = effect.y + Math.sin(angle) * (inner + len);

      const color = colors[s % colors.length];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.shadowBlur = 8 * fade;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function seeded01(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildBackgroundLayer() {
  // Background fill
  backgroundCtx.fillStyle = "#1A1A1A";
  backgroundCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Subtle grid
  backgroundCtx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  backgroundCtx.lineWidth = 1;

  for (let x = 0; x < CANVAS_WIDTH; x += 50) {
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(x, 0);
    backgroundCtx.lineTo(x, CANVAS_HEIGHT);
    backgroundCtx.stroke();
  }

  for (let y = 0; y < CANVAS_HEIGHT; y += 50) {
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(0, y);
    backgroundCtx.lineTo(CANVAS_WIDTH, y);
    backgroundCtx.stroke();
  }

  // Border
  backgroundCtx.strokeStyle = "#E20074";
  backgroundCtx.lineWidth = 3;
  backgroundCtx.strokeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function resetTrailLayer() {
  trailCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  lastTrailPointByPlayerId.clear();
}

function rebuildTrailLayerFromState(state) {
  resetTrailLayer();

  if (!state.players) return;
  for (const player of state.players) {
    if (!Array.isArray(player.trail) || player.trail.length < 2) continue;
    let prev = null;
    for (const point of player.trail) {
      if (prev && !point.afterGap) {
        drawTrailSegment(player.color, prev, point);
      }
      prev = point;
    }
    if (prev) lastTrailPointByPlayerId.set(player.id, prev);
  }
}

function applyTrailPoint(player, point) {
  const prev = lastTrailPointByPlayerId.get(player.id);
  if (prev && point && !point.afterGap) {
    drawTrailSegment(player.color, prev, point);
  }
  if (point) lastTrailPointByPlayerId.set(player.id, point);
}

function drawTrailSegment(color, p1, p2) {
  trailCtx.save();
  trailCtx.strokeStyle = color;
  trailCtx.lineWidth = TRAIL_WIDTH;
  trailCtx.lineCap = "round";
  trailCtx.lineJoin = "round";
  trailCtx.shadowBlur = 10;
  trailCtx.shadowColor = color;
  trailCtx.beginPath();
  trailCtx.moveTo(p1.x, p1.y);
  trailCtx.lineTo(p2.x, p2.y);
  trailCtx.stroke();
  trailCtx.restore();
}

function mergePlayers(previousPlayers = [], nextPlayers = []) {
  const prevById = new Map(previousPlayers.map((p) => [p.id, p]));
  return nextPlayers.map((player) => {
    const previous = prevById.get(player.id) || {};
    return { ...previous, ...player };
  });
}

function normalizeGameStateSnapshot(previous, next) {
  const readyPlayers = Array.isArray(next?.readyPlayers)
    ? next.readyPlayers
    : previous?.readyPlayers || [];
  const players = mergePlayers(previous?.players, next?.players || []);
  return { ...(previous || {}), ...(next || {}), readyPlayers, players };
}

// Animation loop for smooth rendering
function animate() {
  if (
    currentGameState &&
    (currentGameState.state === "playing" ||
      currentGameState.state === "round_end")
  ) {
    renderGame(currentGameState);
  }
  requestAnimationFrame(animate);
}

// Start animation loop
animate();

// Handle window resize
window.addEventListener("resize", () => {
  // You can add responsive canvas resizing here if needed
});

console.log("🎮 Curve Fever client initialized");
