const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
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

const EFFECT_DURATION_FRAMES = 36;
const HEAD_COLLISION_DISTANCE = TRAIL_WIDTH * 2.2;
const MAX_SCORE = 10;

// Powerup constants
const POWERUP_SPAWN_INTERVAL = 300; // frames between powerup spawns
const POWERUP_DURATION = 10 * FPS; // 10 seconds at 60 FPS
const POWERUP_RADIUS = 20;
const POWERUP_TYPES = {
  SPEED_BOOST: { id: 'speed_boost', name: 'Speed Boost', color: '#00FF00', effect: 'speed', multiplier: 1.5 },
  SPEED_SLOW: { id: 'speed_slow', name: 'Speed Slow', color: '#FF0000', effect: 'speed', multiplier: 0.5 }
};

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
  { left: 'ArrowLeft', right: 'ArrowRight', name: 'Arrows' },
  { left: 'a', right: 'd', name: 'A/D' },
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
  frameCount: 0,
  effects: [],
  powerups: [],
  nextPowerupId: 1
};

let nextEffectId = 1;

// Serve static files
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Send current game state to new player
  socket.emit('gameState', serializeGameState({ includeTrails: true }));

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
      gapCounter: Math.floor(Math.random() * GAP_INTERVAL),
      speed: PLAYER_SPEED,
      powerupEffect: null,
      justWrapped: false
    };

    gameState.players.push(player);
    io.emit('gameState', serializeGameState({ includeTrails: false }));
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

    io.emit('gameState', serializeGameState({ includeTrails: false }));
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

      io.emit('gameState', serializeGameState({ includeTrails: false }));
    }
  });
});

// Start countdown
function startCountdown() {
  gameState.state = 'countdown';
  gameState.countdown = COUNTDOWN_DURATION;

  const countdownInterval = setInterval(() => {
    gameState.countdown--;
    io.emit('gameState', serializeGameState({ includeTrails: false }));

    if (gameState.countdown <= 0) {
      clearInterval(countdownInterval);
      startGame();
    }
  }, 1000);
}

// Initialize player positions
function initializePlayers() {
  const padding = 40;
  const minSpawnDistance = 60;
  const maxAttemptsPerPlayer = 200;
  const placed = [];
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  const spawnRadius = 160;

  gameState.players.forEach((player) => {
    let spawn = null;

    for (let attempt = 0; attempt < maxAttemptsPerPlayer; attempt++) {
      // Bias spawns toward the center so players start closer together.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * spawnRadius;
      const x = clamp(centerX + Math.cos(angle) * radius, padding, CANVAS_WIDTH - padding);
      const y = clamp(centerY + Math.sin(angle) * radius, padding, CANVAS_HEIGHT - padding);

      let ok = true;
      for (const p of placed) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < minSpawnDistance) {
          ok = false;
          break;
        }
      }

      if (ok) {
        spawn = { x, y };
        break;
      }
    }

    // Fallback: if we couldn't find a good spot, just accept a random one.
    if (!spawn) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * spawnRadius;
      spawn = {
        x: clamp(centerX + Math.cos(angle) * radius, padding, CANVAS_WIDTH - padding),
        y: clamp(centerY + Math.sin(angle) * radius, padding, CANVAS_HEIGHT - padding)
      };
    }

    placed.push(spawn);

    player.x = spawn.x;
    player.y = spawn.y;
    player.angle = Math.random() * Math.PI * 2;
    player.alive = true;
    player.trail = [];
    player.turning = 0;
    player.gapCounter = Math.floor(Math.random() * GAP_INTERVAL);
    player.speed = PLAYER_SPEED;
    player.powerupEffect = null;
    player.justWrapped = false;
  });
}

// Start game
function startGame() {
  gameState.state = 'playing';
  gameState.frameCount = 0;
  gameState.effects = [];
  gameState.powerups = [];
  gameState.readyPlayers.clear();
  initializePlayers();
  io.emit('gameState', serializeGameState({ includeTrails: false }));
}

// Game loop
setInterval(() => {
  if (gameState.state === 'playing') {
    const { trailUpdates } = updateGame();
    io.emit('frame', serializeFrame({ trailUpdates }));
    return;
  }

  // Keep animating collision effects briefly after the round ends.
  if (gameState.state === 'round_end' && gameState.effects.length) {
    tickEffectsOnly();
    io.emit('frame', serializeFrame({ trailUpdates: [] }));
  }
}, FRAME_INTERVAL);

// Update game state
function updateGame() {
  gameState.frameCount++;
  const trailUpdates = [];

  // Tick & prune effects
  if (gameState.effects.length) {
    gameState.effects = gameState.effects.filter(effect => {
      return (gameState.frameCount - effect.createdAtFrame) < effect.durationFrames;
    });
  }

  // Spawn powerups
  if (gameState.frameCount % POWERUP_SPAWN_INTERVAL === 0 && gameState.powerups.length < 3) {
    spawnPowerup();
  }

  // Update powerup effects
  gameState.players.forEach(player => {
    if (player.powerupEffect && player.powerupEffect.endFrame <= gameState.frameCount) {
      player.speed = PLAYER_SPEED;
      player.powerupEffect = null;
    }
  });

  gameState.players.forEach(player => {
    if (!player.alive) return;

    // Update angle based on turning
    player.angle += player.turning * TURN_SPEED;

    // Update position
    player.x += Math.cos(player.angle) * player.speed;
    player.y += Math.sin(player.angle) * player.speed;

    // Wrap around edges
    if (player.x < 0 || player.x > CANVAS_WIDTH || player.y < 0 || player.y > CANVAS_HEIGHT) {
      player.justWrapped = true;
      if (player.x < 0) player.x += CANVAS_WIDTH;
      else if (player.x > CANVAS_WIDTH) player.x -= CANVAS_WIDTH;
      if (player.y < 0) player.y += CANVAS_HEIGHT;
      else if (player.y > CANVAS_HEIGHT) player.y -= CANVAS_HEIGHT;
    }

    // Check powerup collision
    checkPowerupCollision(player);

    // Gap system
    player.gapCounter++;
    const inGap = (player.gapCounter % GAP_INTERVAL) < GAP_LENGTH;

    if (!inGap) {
      // Add to trail with gap marker
      const lastPoint = player.trail[player.trail.length - 1];
      const isAfterGap = lastPoint && (player.gapCounter % GAP_INTERVAL) === GAP_LENGTH;

      const point = {
        x: player.x,
        y: player.y,
        afterGap: isAfterGap || player.justWrapped // Mark if this point is right after a gap or wrap
      };

      player.justWrapped = false;

      player.trail.push(point);
      trailUpdates.push({ playerId: player.id, point });

      // Check collision with all trails
      const collision = checkCollision(player);
      if (collision.hit) {
        player.alive = false;
        addEffect({
          x: clamp(player.x, 0, CANVAS_WIDTH),
          y: clamp(player.y, 0, CANVAS_HEIGHT),
          kind: collision.self ? 'self' : 'trail',
          colors: collision.self ? [player.color] : [player.color, collision.ownerColor]
        });
        return;
      }
    }
  });

  // Check head-on collisions (player-player)
  const alive = gameState.players.filter(p => p.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) < HEAD_COLLISION_DISTANCE) {
        a.alive = false;
        b.alive = false;
        addEffect({
          x: clamp((a.x + b.x) / 2, 0, CANVAS_WIDTH),
          y: clamp((a.y + b.y) / 2, 0, CANVAS_HEIGHT),
          kind: 'player',
          colors: [a.color, b.color]
        });
      }
    }
  }

  // Check for round end
  const alivePlayers = gameState.players.filter(p => p.alive);
  if (alivePlayers.length <= 1) {
    endRound(alivePlayers[0] || null);
  }

  return { trailUpdates };
}

function tickEffectsOnly() {
  gameState.frameCount++;
  gameState.effects = gameState.effects.filter(effect => {
    return (gameState.frameCount - effect.createdAtFrame) < effect.durationFrames;
  });
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
        return {
          hit: true,
          self: otherPlayer.id === player.id,
          ownerId: otherPlayer.id,
          ownerColor: otherPlayer.color
        };
      }
    }
  }

  return { hit: false };
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
    if (winner.score >= MAX_SCORE) {
      gameState.state = 'game_over';
      io.emit('gameState', serializeGameState({ includeTrails: false }));
      return; // Don't auto-start new round
    }
  }

  io.emit('gameState', serializeGameState({ includeTrails: false }));

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
  gameState.effects = [];
  gameState.players.forEach(player => {
    player.alive = false;
    player.trail = [];
  });
  io.emit('gameState', serializeGameState({ includeTrails: false }));
}

function addEffect({ x, y, kind, colors }) {
  gameState.effects.push({
    id: nextEffectId++,
    kind,
    x,
    y,
    colors,
    createdAtFrame: gameState.frameCount,
    durationFrames: EFFECT_DURATION_FRAMES
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function serializeGameState({ includeTrails }) {
  return {
    state: gameState.state,
    countdown: gameState.countdown,
    frameCount: gameState.frameCount,
    readyPlayers: Array.from(gameState.readyPlayers),
    effects: gameState.effects,
    players: gameState.players.map(player => serializePlayer(player, { includeTrail: includeTrails })),
    powerups: gameState.powerups
  };
}

function serializeFrame({ trailUpdates }) {
  return {
    state: gameState.state,
    countdown: gameState.countdown,
    frameCount: gameState.frameCount,
    effects: gameState.effects,
    players: gameState.players.map(player => serializePlayer(player, { includeTrail: false })),
    trailUpdates,
    powerups: gameState.powerups
  };
}

// Powerup functions
function spawnPowerup() {
  const types = Object.values(POWERUP_TYPES);
  const randomType = types[Math.floor(Math.random() * types.length)];

  const powerup = {
    id: gameState.nextPowerupId++,
    x: Math.random() * (CANVAS_WIDTH - 2 * POWERUP_RADIUS) + POWERUP_RADIUS,
    y: Math.random() * (CANVAS_HEIGHT - 2 * POWERUP_RADIUS) + POWERUP_RADIUS,
    type: randomType,
    spawnedAt: gameState.frameCount
  };

  gameState.powerups.push(powerup);
}

function checkPowerupCollision(player) {
  for (let i = gameState.powerups.length - 1; i >= 0; i--) {
    const powerup = gameState.powerups[i];
    const dx = player.x - powerup.x;
    const dy = player.y - powerup.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < POWERUP_RADIUS + TRAIL_WIDTH) {
      // Apply effect
      applyPowerupEffect(player, powerup.type);

      // Remove powerup
      gameState.powerups.splice(i, 1);

      // Add visual effect
      addEffect({
        x: powerup.x,
        y: powerup.y,
        kind: 'powerup',
        colors: [powerup.type.color]
      });
      break;
    }
  }
}

function applyPowerupEffect(player, powerupType) {
  if (powerupType.effect === 'speed') {
    player.speed = PLAYER_SPEED * powerupType.multiplier;
    player.powerupEffect = {
      type: powerupType.id,
      endFrame: gameState.frameCount + POWERUP_DURATION
    };
  }
}

function serializePlayer(player, { includeTrail }) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    controls: player.controls,
    x: player.x,
    y: player.y,
    angle: player.angle,
    alive: player.alive,
    score: player.score,
    trail: includeTrail ? player.trail : undefined,
    powerupEffect: player.powerupEffect
  };
}

// Start server
http.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Curve Fever server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Waiting for players to connect...`);
});
