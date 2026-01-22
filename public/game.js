// Game constants
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const TRAIL_WIDTH = 4;

// DOM Elements
const lobby = document.getElementById('lobby');
const gameScreen = document.getElementById('gameScreen');
const joinForm = document.getElementById('joinForm');
const lobbyPanel = document.getElementById('lobbyPanel');
const playerNameInput = document.getElementById('playerNameInput');
const joinButton = document.getElementById('joinButton');
const readyButton = document.getElementById('readyButton');
const playerList = document.getElementById('playerList');
const playerCount = document.getElementById('playerCount');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const countdown = document.getElementById('countdown');
const roundEnd = document.getElementById('roundEnd');
const hudPlayerList = document.getElementById('hudPlayerList');
const hudControlsList = document.getElementById('hudControlsList');

// Socket connection
const socket = io();

// Client state
let myPlayerId = null;
let currentGameState = null;
let pressedKeys = new Set();

// Setup canvas
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Socket event handlers
socket.on('connect', () => {
  console.log('Connected to server');
  myPlayerId = socket.id;
});

socket.on('gameState', (state) => {
  currentGameState = state;
  updateUI(state);

  if (state.state === 'playing') {
    renderGame(state);
  }
});

socket.on('error', (message) => {
  alert(message);
});

// Join game
joinButton.addEventListener('click', () => {
  const playerName = playerNameInput.value.trim();
  if (!playerName) {
    alert('Please enter your name');
    return;
  }

  socket.emit('joinGame', playerName);
  joinForm.style.display = 'none';
  lobbyPanel.style.display = 'block';
});

// Player ready
readyButton.addEventListener('click', () => {
  socket.emit('playerReady');
  readyButton.disabled = true;
  readyButton.textContent = 'Waiting for others...';
});

// Keyboard input
window.addEventListener('keydown', (e) => {
  if (!currentGameState || currentGameState.state !== 'playing') return;

  pressedKeys.add(e.key);
  sendInput();
});

window.addEventListener('keyup', (e) => {
  pressedKeys.delete(e.key);
  sendInput();
});

function sendInput() {
  const player = currentGameState?.players.find(p => p.id === myPlayerId);
  if (!player) return;

  const controls = player.controls;
  let turning = 0;

  if (pressedKeys.has(controls.left)) {
    turning = -1;
  } else if (pressedKeys.has(controls.right)) {
    turning = 1;
  }

  socket.emit('playerInput', { turning });
}

// Update UI based on game state
function updateUI(state) {
  switch (state.state) {
    case 'lobby':
      lobby.style.display = 'flex';
      gameScreen.style.display = 'none';
      updateLobby(state);
      break;

    case 'countdown':
      lobby.style.display = 'none';
      gameScreen.style.display = 'flex';
      countdown.style.display = 'flex';
      roundEnd.style.display = 'none';
      showCountdown(state.countdown);
      updateHUD(state);
      break;

    case 'playing':
      lobby.style.display = 'none';
      gameScreen.style.display = 'flex';
      countdown.style.display = 'none';
      roundEnd.style.display = 'none';
      updateHUD(state);
      break;

    case 'round_end':
      roundEnd.style.display = 'flex';
      showRoundEnd(state);
      break;
  }
}

// Update lobby player list
function updateLobby(state) {
  playerCount.textContent = `${state.players.length}/10`;

  playerList.innerHTML = '';
  state.players.forEach(player => {
    const isReady = state.readyPlayers.has(player.id);
    const isMe = player.id === myPlayerId;

    const item = document.createElement('div');
    item.className = 'player-item';
    item.innerHTML = `
      <div class="player-avatar" style="color: ${player.color}; border-color: ${player.color}">
        ${player.name.charAt(0).toUpperCase()}
      </div>
      <div class="player-info">
        <div class="player-name">${player.name} ${isMe ? '(You)' : ''}</div>
        <div class="player-controls">Controls: ${player.controls.name}</div>
      </div>
      <span class="player-status ${isReady ? 'ready' : 'waiting'}">
        ${isReady ? 'Ready' : 'Waiting'}
      </span>
    `;

    playerList.appendChild(item);
  });
}

// Show countdown
function showCountdown(count) {
  const numberEl = document.querySelector('.countdown-number');
  numberEl.textContent = count;

  // Trigger animation
  numberEl.style.animation = 'none';
  setTimeout(() => {
    numberEl.style.animation = '';
  }, 10);
}

// Update HUD
function updateHUD(state) {
  // Update player list
  hudPlayerList.innerHTML = '';
  state.players.forEach(player => {
    const div = document.createElement('div');
    div.className = `hud-player ${!player.alive ? 'dead' : ''}`;
    div.innerHTML = `
      <span class="hud-player-dot" style="color: ${player.color}"></span>
      <span>${player.name}</span>
      <span style="margin-left: auto; font-weight: 700;">${player.score}</span>
    `;
    hudPlayerList.appendChild(div);
  });

  // Update controls
  hudControlsList.innerHTML = '';
  state.players.forEach(player => {
    if (player.id === myPlayerId) {
      const div = document.createElement('div');
      div.className = 'hud-control';
      div.innerHTML = `
        <span style="color: ${player.color}">${player.name}</span>
        <span class="hud-control-keys">${player.controls.name}</span>
      `;
      hudControlsList.appendChild(div);
    }
  });
}

// Show round end
function showRoundEnd(state) {
  const winner = state.players.find(p => p.alive);
  const winnerText = document.getElementById('winnerText');

  if (winner) {
    winnerText.textContent = `${winner.name} Wins!`;
    winnerText.style.color = winner.color;
  } else {
    winnerText.textContent = 'Draw!';
    winnerText.style.background = 'linear-gradient(135deg, #E20074, #00D68F)';
    winnerText.style.webkitBackgroundClip = 'text';
    winnerText.style.webkitTextFillColor = 'transparent';
  }

  // Update scoreboard
  const scoreBoard = document.getElementById('scoreBoard');
  scoreBoard.innerHTML = '';

  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
  sortedPlayers.forEach(player => {
    const div = document.createElement('div');
    div.className = 'score-item';
    div.style.borderLeftColor = player.color;
    div.innerHTML = `
      <span class="score-name">${player.name}</span>
      <span class="score-points">${player.score}</span>
    `;
    scoreBoard.appendChild(div);
  });
}

// Render game
function renderGame(state) {
  // Clear canvas
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw subtle grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;

  for (let x = 0; x < CANVAS_WIDTH; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }

  for (let y = 0; y < CANVAS_HEIGHT; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  // Draw border
  ctx.strokeStyle = '#E20074';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw all player trails and heads
  state.players.forEach(player => {
    if (player.trail.length === 0) return;

    // Draw trail with glow effect
    ctx.strokeStyle = player.color;
    ctx.lineWidth = TRAIL_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = player.color;

    // Draw trail segments, breaking at gaps
    for (let i = 0; i < player.trail.length - 1; i++) {
      const p1 = player.trail[i];
      const p2 = player.trail[i + 1];

      // Skip drawing if the next point is after a gap
      if (p2.afterGap) continue;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw player head (current position)
    if (player.alive) {
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(player.x, player.y, TRAIL_WIDTH * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Draw player name above head
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.name, player.x, player.y - 15);
    }
  });
}

// Animation loop for smooth rendering
function animate() {
  if (currentGameState && currentGameState.state === 'playing') {
    renderGame(currentGameState);
  }
  requestAnimationFrame(animate);
}

// Start animation loop
animate();

// Handle window resize
window.addEventListener('resize', () => {
  // You can add responsive canvas resizing here if needed
});

console.log('🎮 Curve Fever client initialized');
