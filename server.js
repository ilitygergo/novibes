const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const PLAYER_SPEED = 2;
const TURN_SPEED = 0.05;
const TRAIL_WIDTH = 4;
const GAP_INTERVAL = 100; // frames between gaps
const GAP_LENGTH = 15; // frames of gap
const COUNTDOWN_DURATION = 3;
const FPS = 60;
const FRAME_INTERVAL = 1000 / FPS;

// Player colors (10 distinct vibrant colors)
const PLAYER_COLORS = [
  '#E20074', // Telekom Magenta
  '#00D68F', // Green
  '#FFD700', // Gold
  '#00BFFF', // Deep Sky Blue
  '#FF4444', // Red
  '#FF69B4', // Hot Pink
  '#7FFF00', // Chartreuse
  '#FF8C00', // Dark Orange
  '#9370DB', // Medium Purple
  '#00CED1'  // Dark Turquoise
];

// Control schemes for players
const CONTROL_SCHEMES = [
  { left: 'a', right: 'd', name: 'A/D' },
  { left: 'ArrowLeft', right: 'ArrowRight', name: 'Arrows' },
  { left: 'j', right: 'l', name: 'J/L' },
  { left: 'z', right: 'c', name: 'Z/C' },
  { left: '4', right: '6', name: '4/6' },
  { left: 'f', right: 'h', name: 'F/H' },
  { left: 'q', right: 'e', name: 'Q/E' },
  { left: 'u', right: 'o', name: 'U/O' },
  { left: 'v', right: 'n', name: 'V/N' },
  { left: '7', right: '9', name: '7/9' }
];

// Game state
let gameState = {
  state: 'lobby', // lobby, countdown, playing, round_end
  countdown: 0,
  players: [],
  readyPlayers: new Set(),
  frameCount: 0
};

// Serve static files
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Send current game state to new player
  socket.emit('gameState', gameState);

  // Handle player join
  socket.on('joinGame', (playerName) => {
    if (gameState.players.length >= 10) {
      socket.emit('error', 'Game is full (max 10 players)');
      return;
    }

    const playerIndex = gameState.players.length;
    const player = {
      id: socket.id,
      name: playerName || `Player ${playerIndex + 1}`,
      color: PLAYER_COLORS[playerIndex],
      controls: CONTROL_SCHEMES[playerIndex],
      x: 0,
      y: 0,
      angle: 0,
      alive: false,
      score: 0,
      trail: [],
      turning: 0, // -1 left, 0 straight, 1 right
      gapCounter: Math.floor(Math.random() * GAP_INTERVAL)
    };

    gameState.players.push(player);
    io.emit('gameState', gameState);
    console.log(`${playerName} joined (${gameState.players.length}/10)`);
  });

  // Handle player ready
  socket.on('playerReady', () => {
    gameState.readyPlayers.add(socket.id);

    // Check if all players are ready (minimum 2 players)
    if (gameState.players.length >= 2 &&
        gameState.readyPlayers.size === gameState.players.length &&
        gameState.state === 'lobby') {
      startCountdown();
    }

    io.emit('gameState', gameState);
  });

  // Handle player input
  socket.on('playerInput', (input) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && gameState.state === 'playing') {
      player.turning = input.turning; // -1, 0, or 1
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const index = gameState.players.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      const player = gameState.players[index];
      console.log(`${player.name} disconnected`);
      gameState.players.splice(index, 1);
      gameState.readyPlayers.delete(socket.id);

      // Reset game if not enough players
      if (gameState.players.length < 2 && gameState.state !== 'lobby') {
        resetToLobby();
      }

      io.emit('gameState', gameState);
    }
  });
});

// Start countdown
function startCountdown() {
  gameState.state = 'countdown';
  gameState.countdown = COUNTDOWN_DURATION;

  const countdownInterval = setInterval(() => {
    gameState.countdown--;
    io.emit('gameState', gameState);

    if (gameState.countdown <= 0) {
      clearInterval(countdownInterval);
      startGame();
    }
  }, 1000);
}

// Initialize player positions
function initializePlayers() {
  const padding = 100;
  gameState.players.forEach((player, index) => {
    // Position players around the edges
    const angle = (index / gameState.players.length) * Math.PI * 2;
    const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) / 3;

    player.x = CANVAS_WIDTH / 2 + Math.cos(angle) * radius;
    player.y = CANVAS_HEIGHT / 2 + Math.sin(angle) * radius;
    player.angle = angle + Math.PI; // Face center
    player.alive = true;
    player.trail = [];
    player.turning = 0;
    player.gapCounter = Math.floor(Math.random() * GAP_INTERVAL);
  });
}

// Start game
function startGame() {
  gameState.state = 'playing';
  gameState.frameCount = 0;
  gameState.readyPlayers.clear();
  initializePlayers();
  io.emit('gameState', gameState);
}

// Game loop
setInterval(() => {
  if (gameState.state === 'playing') {
    updateGame();
    io.emit('gameState', gameState);
  }
}, FRAME_INTERVAL);

// Update game state
function updateGame() {
  gameState.frameCount++;
  let alivePlayers = 0;
  let lastAlivePlayer = null;

  gameState.players.forEach(player => {
    if (!player.alive) return;

    alivePlayers++;
    lastAlivePlayer = player;

    // Update angle based on turning
    player.angle += player.turning * TURN_SPEED;

    // Update position
    player.x += Math.cos(player.angle) * PLAYER_SPEED;
    player.y += Math.sin(player.angle) * PLAYER_SPEED;

    // Check wall collision
    if (player.x < 0 || player.x > CANVAS_WIDTH ||
        player.y < 0 || player.y > CANVAS_HEIGHT) {
      player.alive = false;
      return;
    }

    // Gap system
    player.gapCounter++;
    const inGap = (player.gapCounter % GAP_INTERVAL) < GAP_LENGTH;

    if (!inGap) {
      // Add to trail with gap marker
      const lastPoint = player.trail[player.trail.length - 1];
      const isAfterGap = lastPoint && (player.gapCounter % GAP_INTERVAL) === GAP_LENGTH;

      player.trail.push({
        x: player.x,
        y: player.y,
        afterGap: isAfterGap // Mark if this point is right after a gap
      });

      // Check collision with all trails
      if (checkCollision(player)) {
        player.alive = false;
        return;
      }
    }
  });

  // Check for round end
  if (alivePlayers <= 1) {
    endRound(lastAlivePlayer);
  }
}

// Check collision with trails
function checkCollision(player) {
  const checkPoint = { x: player.x, y: player.y };

  for (let otherPlayer of gameState.players) {
    if (otherPlayer.trail.length < 2) continue;

    // Don't check recent trail points of self (last 10 points)
    const skipPoints = (otherPlayer.id === player.id) ? 10 : 0;

    for (let i = 0; i < otherPlayer.trail.length - skipPoints - 1; i++) {
      const p1 = otherPlayer.trail[i];
      const p2 = otherPlayer.trail[i + 1];

      // Skip segments where p2 is right after a gap (don't connect across gaps)
      if (p2.afterGap) continue;

      if (distanceToSegment(checkPoint, p1, p2) < TRAIL_WIDTH) {
        return true;
      }
    }
  }

  return false;
}

// Distance from point to line segment
function distanceToSegment(p, v, w) {
  const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
  if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));

  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));

  const projection = {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y)
  };

  return Math.sqrt(Math.pow(p.x - projection.x, 2) + Math.pow(p.y - projection.y, 2));
}

// End round
function endRound(winner) {
  gameState.state = 'round_end';

  if (winner) {
    winner.score++;
  }

  io.emit('gameState', gameState);

  // Auto-start new round after 3 seconds
  setTimeout(() => {
    if (gameState.players.length >= 2) {
      startGame();
    } else {
      resetToLobby();
    }
  }, 3000);
}

// Reset to lobby
function resetToLobby() {
  gameState.state = 'lobby';
  gameState.countdown = 0;
  gameState.readyPlayers.clear();
  gameState.players.forEach(player => {
    player.alive = false;
    player.trail = [];
  });
  io.emit('gameState', gameState);
}

// Start server
http.listen(PORT, () => {
  console.log(`🎮 Curve Fever server running on http://localhost:${PORT}`);
  console.log(`📡 Waiting for players to connect...`);
});
