/**
 * Territory Fighting Game - Backend Server
 * Handles player connections, game state, and real-time synchronization
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const GameLogic = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));

// Initialize game logic
const gameLogic = new GameLogic();

// Server configuration
const PORT = process.env.PORT || 3000;
const TICK_RATE = 60; // Updates per second
const TICK_INTERVAL = 1000 / TICK_RATE;

// Store connected players
const players = new Map();
let winnerId = null;

const assetWhitelist = new Set(['land.png', 'enemy char.png', 'main char.png', 'tree.png', 'medikit.png']);

app.get('/assets/:assetName', (req, res) => {
  const assetName = req.params.assetName;
  if (!assetWhitelist.has(assetName)) {
    res.sendStatus(404);
    return;
  }

  res.sendFile(path.join(__dirname, '..', assetName));
});

// =============================================================================
// SOCKET.IO CONNECTION HANDLERS
// =============================================================================

io.on('connection', (socket) => {
  console.log(`[Player Connected] ${socket.id}`);

  // Player joins the game
  socket.on('playerJoin', (playerData) => {
    const spawnPos = gameLogic.getSpawnPositionInDivision(playerData.divisionId, players);
    const territory = gameLogic.getTerritory(spawnPos.x, spawnPos.y);
    
    const newPlayer = {
      id: socket.id,
      name: playerData.name || `Player_${socket.id.substring(0, 5)}`,
      x: spawnPos.x,
      y: spawnPos.y,
      vx: 0,
      vy: 0,
      health: 100,
      maxHealth: 100,
      territory,
      homeDivisionId: spawnPos.division.id,
      homeDivisionName: spawnPos.division.name,
      clearedDivisionIds: [],
      winner: false,
      lastAttackTime: 0,
      lastKatanaTime: 0,
      lastFireballTime: 0,
      medikitCount: 0,
      isAlive: true
    };

    players.set(socket.id, newPlayer);
    console.log(`[Player Spawned] ${newPlayer.name} at (${newPlayer.x}, ${newPlayer.y})`);

    // Send existing players to new player
    const existingPlayers = Array.from(players.values()).filter(p => p.id !== socket.id);
    socket.emit('gameInit', {
      playerId: socket.id,
      map: gameLogic.getMapData(),
      players: existingPlayers,
      requestedDivisionId: playerData.divisionId,
      assignedDivisionId: spawnPos.division.id,
      assignedDivisionName: spawnPos.division.name
    });

    // Notify all players about new player
    io.emit('playerJoined', newPlayer);
  });

  // Player movement input
  socket.on('moveInput', (input) => {
    const player = players.get(socket.id);
    if (!player) return;

    // WASD movement logic (W=up, S=down, A=left, D=right)
    player.vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * (player.speed || gameLogic.PLAYER_SPEED);
    player.vy = ((input.down ? 1 : 0) - (input.up ? 1 : 0)) * (player.speed || gameLogic.PLAYER_SPEED);
  });

  // Player melee attack
  socket.on('attack', (data) => {
    const attacker = players.get(socket.id);
    if (!attacker || !attacker.isAlive) return;

    const now = Date.now();
    if (now - attacker.lastAttackTime < 500) return; // 500ms cooldown

    attacker.lastAttackTime = now;

    // Get players in attack range
    const targetId = gameLogic.checkAttackHit(attacker, Array.from(players.values()));
    if (targetId) {
      const target = players.get(targetId);
      if (target) {
        if (target.territory?.divisionId !== attacker.territory?.divisionId) return;

        damagePlayer(attacker, target, gameLogic.SWORD_DAMAGE, 'sword');
      }
    }
  });

  socket.on('katanaSwipe', (data) => {
    const attacker = players.get(socket.id);
    if (!attacker || !attacker.isAlive) return;

    const now = Date.now();
    if (now - attacker.lastKatanaTime < 650) return;

    attacker.lastKatanaTime = now;
    const angle = data && Number.isFinite(data.angle) ? data.angle : 0;
    const hits = gameLogic.getKatanaHits(attacker, Array.from(players.values()), angle);

    io.emit('katanaSwipe', {
      playerId: attacker.id,
      x: attacker.x,
      y: attacker.y,
      angle,
      radius: gameLogic.KATANA_RADIUS,
      createdAt: now
    });

    for (const hit of hits) {
      const target = players.get(hit.targetId);
      if (target) {
        damagePlayer(attacker, target, hit.damage, 'katana');
      }
    }
  });

  // Fireball ability
  socket.on('castFireball', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAlive) return;

    const now = Date.now();
    if (now - player.lastFireballTime < 30000) return; // 30s cooldown

    player.lastFireballTime = now;

    const angle = data && Number.isFinite(data.angle) ? data.angle : 0;
    const fireballSpeed = 430;
    const fireball = {
      id: `${socket.id}_${Date.now()}`,
      playerId: socket.id,
      divisionId: player.territory?.divisionId,
      targetId: null,
      x: player.x + Math.cos(angle) * (gameLogic.PLAYER_RADIUS + 14),
      y: player.y + Math.sin(angle) * (gameLogic.PLAYER_RADIUS + 14),
      vx: Math.cos(angle) * fireballSpeed,
      vy: Math.sin(angle) * fireballSpeed,
      speed: fireballSpeed,
      radius: 12,
      lifetime: 3500,
      createdAt: Date.now(),
      alive: true
    };

    gameLogic.addProjectile(fireball);
    io.emit('fireballCast', fireball);
  });

  // Player disconnect
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      io.emit('playerLeft', { playerId: socket.id });
      console.log(`[Player Disconnected] ${player.name}`);

      if (winnerId === socket.id || players.size === 0) {
        winnerId = null;
      }
    }
  });
});

// =============================================================================
// GAME LOOP
// =============================================================================

setInterval(() => {
  if (players.size === 0) return;

  // Update game state
  const deltaTime = TICK_INTERVAL / 1000; // Convert to seconds
  gameLogic.updateMedikit();

  // Update player positions
  for (const player of players.values()) {
    if (!player.isAlive) continue;

    // Calculate intended new position
    let newX = player.x + player.vx * deltaTime;
    let newY = player.y + player.vy * deltaTime;

    // Lock player inside their current division until all enemies there are defeated.
    const territory = gameLogic.getTerritory(player.x, player.y);
    player.territory = territory;
    updatePlayerProgress(player);

    let lockdown = false;
    if (territory && territory.divisionId) {
      lockdown = !gameLogic.allEnemiesDefeatedInDivision(players, territory.divisionId, player.id);
      player.currentDivisionClear = !lockdown;
    }

    // If lockdown, clamp newX/newY inside the current division.
    if (lockdown) {
      const division = gameLogic.getDivisionById(territory.divisionId);
      if (division) {
        newX = Math.max(division.x + gameLogic.PLAYER_RADIUS, Math.min(newX, division.x + division.width - gameLogic.PLAYER_RADIUS));
        newY = Math.max(division.y + gameLogic.PLAYER_RADIUS, Math.min(newY, division.y + division.height - gameLogic.PLAYER_RADIUS));
      }
    }

    // Collision check with map
    const collision = gameLogic.checkCollision(newX, newY, player);
    if (!collision) {
      player.x = newX;
      player.y = newY;
    }

    const medikit = gameLogic.collectMedikit(player);
    if (medikit) {
      applyMedikitPickup(player);
    }
  }

  for (const projectile of gameLogic.getProjectiles()) {
    if (!projectile.alive || !projectile.targetId) continue;

    const target = players.get(projectile.targetId);
    if (!target || !target.isAlive || target.territory?.divisionId !== projectile.divisionId) {
      projectile.alive = false;
      continue;
    }

    const dx = target.x - projectile.x;
    const dy = target.y - projectile.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = projectile.speed || 430;
    projectile.vx = (dx / distance) * speed;
    projectile.vy = (dy / distance) * speed;
  }

  // Update projectiles
  gameLogic.updateProjectiles();

  // Check projectile hits
  for (const projectile of gameLogic.getProjectiles()) {
    if (!projectile.alive) continue;

    for (const player of players.values()) {
      if (player.id === projectile.playerId || !player.isAlive) continue;
      const shooter = players.get(projectile.playerId);
      if (projectile.divisionId !== player.territory?.divisionId) continue;

      if (gameLogic.checkProjectileHit(projectile, player)) {
        projectile.alive = false;
        if (shooter) {
          damagePlayer(shooter, player, gameLogic.FIREBALL_DAMAGE, 'fireball');
        }

        break;
      }
    }
  }

  // Broadcast game state to all clients
  const alivePlayers = Array.from(players.values()).filter(p => p.isAlive).length;
  const winner = winnerId ? players.get(winnerId) : null;
  const gameState = {
    players: Array.from(players.values()),
    projectiles: gameLogic.getProjectiles().filter(p => p.alive),
    medikit: gameLogic.getMedikit(),
    alivePlayers,
    totalPlayersRemaining: alivePlayers,
    winner: winner ? { id: winner.id, name: winner.name } : null
  };

  io.emit('gameState', gameState);
}, TICK_INTERVAL);

function updatePlayerProgress(player) {
  if (!player || !player.isAlive || !player.territory?.divisionId) return;

  if (gameLogic.allEnemiesDefeatedInDivision(players, player.territory.divisionId, player.id) &&
      !player.clearedDivisionIds.includes(player.territory.divisionId)) {
    player.clearedDivisionIds.push(player.territory.divisionId);
  }

  const alivePlayers = Array.from(players.values()).filter(candidate => candidate.isAlive);
  if (!winnerId && players.size > 1 &&
      (alivePlayers.length === 1 || player.clearedDivisionIds.length >= gameLogic.divisionCount)) {
    winnerId = player.id;
    player.winner = true;
    io.emit('gameWinner', { playerId: player.id, name: player.name });
  }
}

function damagePlayer(attacker, target, damage, hitBy) {
  if (!attacker || !target || !target.isAlive) return;

  target.health = Math.max(0, target.health - damage);
  if (target.health < target.maxHealth && target.medikitCount > 0) {
    target.medikitCount -= 1;
    target.health = target.maxHealth;
  }

  if (target.health === 0) {
    target.isAlive = false;
    io.emit('playerDied', {
      playerId: target.id,
      targetId: target.id,
      killedBy: attacker.id
    });
    updatePlayerProgress(attacker);
  }

  io.emit('playerHit', {
    targetId: target.id,
    damage,
    newHealth: target.health,
    hitBy
  });
}

function applyMedikitPickup(player) {
  if (!player || !player.isAlive) return;

  if (player.health < player.maxHealth) {
    player.health = player.maxHealth;
    io.emit('playerHit', {
      targetId: player.id,
      damage: 0,
      newHealth: player.health,
      hitBy: 'medikit'
    });
    return;
  }

  player.medikitCount = (player.medikitCount || 0) + 1;
}

// =============================================================================
// START SERVER
// =============================================================================

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║  Territory Fighting Game - Server Started    ║
║  Port: ${PORT}                                       ║
║  URL: http://localhost:${PORT}                       ║
╚═══════════════════════════════════════════════╝
  `);
});
