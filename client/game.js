/**
 * Territory Fighting Game - Client
 * Main game engine with Canvas rendering and real-time multiplayer
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const GAME_CONFIG = {
  CANVAS_WIDTH: window.innerWidth,
  CANVAS_HEIGHT: window.innerHeight,
  PLAYER_RADIUS: 18,
  PLAYER_SPEED: 300,
  ATTACK_RANGE: 40,
  ATTACK_COOLDOWN: 500,
  KATANA_COOLDOWN: 650,
  KATANA_EFFECT_MS: 260,
  FIREBALL_COOLDOWN: 30000,
  COLOR: {
    SELF: '#00ff00',
    OTHER: '#ff6b6b',
    DEAD: '#666666',
    HEALTH_BAR_BG: '#333',
    HEALTH_BAR_FILL: '#4ade80',
    UI_TEXT: '#ffffff',
    GRID: 'rgba(100, 100, 100, 0.1)',
    BUILDING: '#8b7355',
    TREE: '#2d5016',
    POND: '#4a90e2',
    ROAD: '#999999',
    WALL: '#555555',
    MOUNTAIN: '#666666',
    POWER_PLANT: '#ff0000',
    FIREBALL: '#ffa500'
  }
};

// =============================================================================
// GAME STATE
// =============================================================================

class Game {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.running = false;
    this.gameStarted = false;

    // Player data
    this.playerId = null;
    this.localPlayer = null;
    this.players = new Map();
    this.projectiles = [];
    this.medikit = null;

    // Map data
    this.mapData = null;
    this.mapObjects = [];
    this.territories = [];
    this.totalPlayersRemaining = 0;
    this.winner = null;
    this.katanaMode = false;
    this.katanaEffects = [];
    this.aimAngle = Math.PI;
    this.assets = {
      land: this.createImage('/assets/land.png'),
      tree: this.createImage('/assets/tree.png'),
      medikit: this.createImage('/assets/medikit.png'),
      self: this.createImage('/assets/enemy%20char.png'),
      enemy: this.createImage('/assets/main%20char.png')
    };

    // Input state
    this.inputState = {
      up: false,
      down: false,
      left: false,
      right: false,
      mouseX: 0,
      mouseY: 0,
      mousePressed: false
    };

    // Game timing
    this.lastTime = Date.now();
    this.fps = 0;
    this.fpsCounter = 0;

    // Ability tracking
    this.lastAttackTime = 0;
    this.lastKatanaTime = 0;
    this.lastFireballTime = 0;

    this.setupEventListeners();
  }

  createImage(src) {
    const image = new Image();
    image.src = src;
    return image;
  }

  /**
   * Initialize game
   */
  init() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Set canvas size
    this.canvas.width = GAME_CONFIG.CANVAS_WIDTH;
    this.canvas.height = GAME_CONFIG.CANVAS_HEIGHT;
    this.canvas.tabIndex = 0;
    this.canvas.focus();

    // Setup socket events
    this.setupSocketEvents();

    this.running = true;
    this.gameLoop();
  }

  /**
   * Setup keyboard and mouse input listeners
   */
  setupEventListeners() {
    // Keyboard input
    document.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    document.addEventListener('keyup', (e) => {
      this.handleKeyUp(e);
    });

    // Mouse input
    document.addEventListener('mousemove', (e) => {
      this.inputState.mouseX = e.clientX;
      this.inputState.mouseY = e.clientY;
      this.updateAimAngle();
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.inputState.mousePressed = true;
        if (this.gameStarted) {
          if (this.katanaMode) {
            this.katanaSwipe();
          } else {
            this.attack();
          }
        }
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.inputState.mousePressed = false;
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });

    window.addEventListener('blur', () => {
      this.inputState.up = false;
      this.inputState.down = false;
      this.inputState.left = false;
      this.inputState.right = false;
      this.sendMoveInput();
    });

    setInterval(() => {
      if (this.gameStarted) {
        this.sendMoveInput();
      }
    }, 1000 / 30);
  }

  /**
   * Handle key down events
   */
  handleKeyDown(e) {
    const key = e.key.toLowerCase();
    const movementKeys = ['w', 'a', 's', 'd'];
    const actionKeys = ['f', 'l'];

    if (movementKeys.includes(key) || actionKeys.includes(key)) {
      e.preventDefault();
    }
    
    switch (key) {
      case 'w':
        this.inputState.up = true;
        break;
      case 's':
        this.inputState.down = true;
        break;
      case 'a':
        this.inputState.left = true;
        break;
      case 'd':
        this.inputState.right = true;
        break;
      case 'f':
        if (this.gameStarted) {
          this.castFireball();
        }
        break;
      case 'l':
        if (this.gameStarted && !e.repeat) {
          this.toggleKatanaMode();
        }
        break;
    }

    this.sendMoveInput();
  }

  /**
   * Handle key up events
   */
  handleKeyUp(e) {
    const key = e.key.toLowerCase();
    const movementKeys = ['w', 'a', 's', 'd'];

    if (movementKeys.includes(key)) {
      e.preventDefault();
    }
    
    switch (key) {
      case 'w':
        this.inputState.up = false;
        break;
      case 's':
        this.inputState.down = false;
        break;
      case 'a':
        this.inputState.left = false;
        break;
      case 'd':
        this.inputState.right = false;
        break;
    }

    this.sendMoveInput();
  }

  /**
   * Send movement input to server
   */
  sendMoveInput() {
    socketManager.sendMoveInput({
      up: this.inputState.up ? 1 : 0,
      down: this.inputState.down ? 1 : 0,
      left: this.inputState.left ? 1 : 0,
      right: this.inputState.right ? 1 : 0
    });
  }

  updateAimAngle() {
    if (!this.canvas) return;

    const dx = this.inputState.mouseX - (this.canvas.width / 2);
    const dy = this.inputState.mouseY - (this.canvas.height / 2);

    if (dx !== 0 || dy !== 0) {
      this.aimAngle = Math.atan2(dy, dx);
    }
  }

  /**
   * Send attack to server
   */
  attack() {
    const now = Date.now();
    if (now - this.lastAttackTime < GAME_CONFIG.ATTACK_COOLDOWN) return;

    this.lastAttackTime = now;
    socketManager.sendAttack();
  }

  toggleKatanaMode() {
    this.katanaMode = !this.katanaMode;
    document.body.classList.toggle('katana-cursor-hidden', this.katanaMode);
    this.addKillFeedMessage(this.katanaMode ? 'Air katana ready' : 'Air katana off');
  }

  katanaSwipe() {
    const now = Date.now();
    if (now - this.lastKatanaTime < GAME_CONFIG.KATANA_COOLDOWN) return;
    if (!this.localPlayer) return;

    this.updateAimAngle();
    const angle = this.aimAngle;

    this.lastKatanaTime = now;
    socketManager.sendKatanaSwipe(angle);
  }

  /**
   * Cast fireball ability
   */
  castFireball() {
    const now = Date.now();
    if (now - this.lastFireballTime < GAME_CONFIG.FIREBALL_COOLDOWN) return;

    if (!this.localPlayer) return;

    this.updateAimAngle();
    this.lastFireballTime = now;
    socketManager.sendFireball(this.aimAngle);
    this.updateFireballUI();
  }

  /**
   * Setup socket event listeners
   */
  setupSocketEvents() {
    socketManager.on('gameInit', (data) => {
      this.playerId = data.playerId;
      this.mapData = data.map;
      this.mapObjects = data.map.objects;
      this.territories = data.map.territories;

      // Add existing players
      data.players.forEach(player => {
        this.players.set(player.id, player);
      });

      this.gameStarted = true;
      if (data.assignedDivisionId !== data.requestedDivisionId) {
        this.addKillFeedMessage(`Spawned in ${data.assignedDivisionName} because your selected division was occupied`);
      }
      console.log('Game initialized');
    });

    socketManager.on('playerJoined', (player) => {
      if (player.id !== this.playerId) {
        this.players.set(player.id, player);
        console.log(`Player joined: ${player.name}`);
      } else {
        this.localPlayer = player;
        document.getElementById('playerName').textContent = player.name;
        this.updateHealthBar();
        this.updateMedikitPocketUI();
      }
    });

    socketManager.on('gameState', (state) => {
      this.totalPlayersRemaining = state.totalPlayersRemaining || state.alivePlayers || 0;
      this.winner = state.winner || null;
      this.updateRemainingPlayersUI();
      this.updateWinnerUI();

      // Update players
      state.players.forEach(player => {
        if (player.id === this.playerId) {
          this.localPlayer = player;
          this.updateHealthBar();
          this.updateTerritoryInfo();
        } else {
          this.players.set(player.id, player);
        }
      });

      // Update projectiles
      this.projectiles = state.projectiles || [];
      this.medikit = state.medikit || null;
      this.updateMedikitPocketUI();
    });

    socketManager.on('playerHit', (data) => {
      if (data.targetId === this.playerId) {
        this.localPlayer.health = data.newHealth;
        this.updateHealthBar();
        this.updateMedikitPocketUI();
      } else {
        const target = this.players.get(data.targetId);
        if (target) {
          target.health = data.newHealth;
        }
      }
    });

    socketManager.on('playerDied', (data) => {
      const deadPlayerId = data.targetId || data.playerId;
      const player = this.players.get(deadPlayerId);
      if (player) {
        player.isAlive = false;
      }

      if (deadPlayerId === this.playerId) {
        this.localPlayer.isAlive = false;
      }

      this.addKillFeedMessage(`${this.players.get(data.killedBy)?.name || 'Player'} killed ${player?.name || 'Player'}`);
    });

    socketManager.on('fireballCast', (fireball) => {
      this.projectiles.push(fireball);
    });

    socketManager.on('katanaSwipe', (effect) => {
      this.katanaEffects.push({
        ...effect,
        createdAt: performance.now()
      });
    });

    socketManager.on('playerLeft', (data) => {
      this.players.delete(data.playerId);
      console.log('Player left');
    });

    socketManager.on('gameWinner', (winner) => {
      this.winner = { id: winner.playerId, name: winner.name };
      this.updateWinnerUI();
      this.addKillFeedMessage(`${winner.name} wins the map`);
    });
  }

  /**
   * Update health bar UI
   */
  updateHealthBar() {
    if (!this.localPlayer) return;

    const healthPercent = (this.localPlayer.health / this.localPlayer.maxHealth) * 100;
    document.getElementById('healthFill').style.width = healthPercent + '%';
    document.getElementById('healthText').textContent = `${Math.floor(this.localPlayer.health)}/${this.localPlayer.maxHealth}`;
  }

  /**
   * Update territory info
   */
  updateTerritoryInfo() {
    if (!this.localPlayer) return;
    const territory = this.localPlayer.territory;
    const clearText = this.localPlayer.currentDivisionClear ? 'Open' : 'Locked';
    document.getElementById('territoryInfo').textContent = `${territory.divisionName} (${clearText})`;
  }

  updateRemainingPlayersUI() {
    const remainingPlayers = document.getElementById('remainingPlayers');
    if (!remainingPlayers) return;
    remainingPlayers.textContent = `Players Remaining: ${this.totalPlayersRemaining}`;
  }

  updateMedikitPocketUI() {
    const medikitPocket = document.getElementById('medikitPocket');
    if (!medikitPocket || !this.localPlayer) return;

    medikitPocket.textContent = `Medikits: ${this.localPlayer.medikitCount || 0}`;
  }

  updateWinnerUI() {
    const winnerBanner = document.getElementById('winnerBanner');
    if (!winnerBanner) return;

    if (!this.winner) {
      winnerBanner.classList.add('hidden');
      winnerBanner.textContent = '';
      return;
    }

    winnerBanner.classList.remove('hidden');
    winnerBanner.textContent = `${this.winner.name} wins`;
  }

  /**
   * Update fireball cooldown UI
   */
  updateFireballUI() {
    const fireballDiv = document.getElementById('fireball');
    const fireballText = document.getElementById('fireballText');
    
    fireballDiv.classList.remove('ready');
    fireballText.textContent = 'Fireball (Cooldown)';

    let elapsed = 0;
    const cooldownInterval = setInterval(() => {
      elapsed += 100;
      const remaining = Math.max(0, GAME_CONFIG.FIREBALL_COOLDOWN - elapsed);
      const seconds = Math.ceil(remaining / 1000);

      if (remaining === 0) {
        clearInterval(cooldownInterval);
        fireballDiv.classList.add('ready');
        fireballText.textContent = 'Fireball (Ready)';
      }
    }, 100);
  }

  /**
   * Add message to kill feed
   */
  addKillFeedMessage(message) {
    const killFeed = document.getElementById('killFeed');
    const msg = document.createElement('div');
    msg.className = 'kill-message';
    msg.textContent = message;
    killFeed.appendChild(msg);

    setTimeout(() => {
      msg.remove();
    }, 3000);
  }

  /**
   * Main game loop
   */
  gameLoop() {
    const now = Date.now();
    const deltaTime = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Update FPS
    this.fpsCounter++;
    if (this.fpsCounter % 60 === 0) {
      this.fps = Math.round(1 / deltaTime);
    }

    // Update
    this.update(deltaTime);

    // Render
    this.render();

    requestAnimationFrame(() => this.gameLoop());
  }

  /**
   * Update game logic
   */
  update(deltaTime) {
    if (!this.localPlayer) return;
    const now = performance.now();
    this.katanaEffects = this.katanaEffects.filter(effect => (
      now - effect.createdAt < GAME_CONFIG.KATANA_EFFECT_MS
    ));
  }

  /**
   * Render game
   */
  render() {
    // Clear canvas
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.localPlayer) {
      return;
    }

    // Save context
    this.ctx.save();

    // Calculate camera position (follows player)
    const cameraX = this.localPlayer.x - this.canvas.width / 2;
    const cameraY = this.localPlayer.y - this.canvas.height / 2;

    // Translate to camera
    this.ctx.translate(-cameraX, -cameraY);

    // Draw land backgrounds and grid
    this.drawLandBlocks();
    this.drawGrid(cameraX, cameraY);

    // Draw territory borders
    this.drawTerritories();

    // Draw tree obstacles
    this.drawMapObjects();

    this.drawMedikit();

    // Draw projectiles
    this.drawProjectiles();

    // Draw all players
    this.drawPlayers();

    this.drawAimArrow();
    this.drawKatanaEffects();

    // Restore context
    this.ctx.restore();

    // Draw UI (always on screen)
    this.drawUI();
  }

  drawLandBlocks() {
    if (!this.mapData) return;

    this.ctx.fillStyle = '#2f6f3f';
    this.ctx.fillRect(0, 0, this.mapData.width, this.mapData.height);

    for (const division of this.territories) {
      if (this.assets.land.complete && this.assets.land.naturalWidth > 0) {
        this.drawDivisionLand(this.assets.land, division);
      } else {
        this.ctx.fillStyle = '#527d46';
        this.ctx.fillRect(division.x, division.y, division.width, division.height);
      }

      this.ctx.fillStyle = 'rgba(13, 34, 20, 0.18)';
      this.ctx.fillRect(division.x, division.y, division.width, division.height);
    }
  }

  drawDivisionLand(image, division) {
    const rotation = this.getDivisionLandRotation(division);
    const centerX = division.x + division.width / 2;
    const centerY = division.y + division.height / 2;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(division.x, division.y, division.width, division.height);
    this.ctx.clip();
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate(rotation);
    this.ctx.drawImage(
      image,
      -division.width / 2,
      -division.height / 2,
      division.width,
      division.height
    );
    this.ctx.restore();
  }

  getDivisionLandRotation(division) {
    const index = this.territories.findIndex(item => item.id === division.id);
    const quarterTurns = [1, -1, 2, -2, -1, 1, -2, 2];
    return quarterTurns[Math.max(0, index) % quarterTurns.length] * (Math.PI / 2);
  }

  /**
   * Draw grid
   */
  drawGrid(cameraX, cameraY) {
    const gridSize = 100;
    const startX = Math.floor(cameraX / gridSize) * gridSize;
    const startY = Math.floor(cameraY / gridSize) * gridSize;

    this.ctx.strokeStyle = GAME_CONFIG.COLOR.GRID;
    this.ctx.lineWidth = 1;

    for (let x = startX; x < startX + this.canvas.width + gridSize; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, cameraY);
      this.ctx.lineTo(x, cameraY + this.canvas.height);
      this.ctx.stroke();
    }

    for (let y = startY; y < startY + this.canvas.height + gridSize; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(cameraX, y);
      this.ctx.lineTo(cameraX + this.canvas.width, y);
      this.ctx.stroke();
    }
  }

  /**
   * Draw map objects
   */
  drawMapObjects() {
    for (const obj of this.mapObjects) {
      if (obj.type !== 'tree') {
        continue;
      }

      this.drawTreeShadow(obj);

      if (this.assets.tree.complete && this.assets.tree.naturalWidth > 0) {
        this.drawDryTree(this.assets.tree, obj);
      } else {
        this.ctx.fillStyle = '#a58f64';
        this.ctx.beginPath();
        this.ctx.arc(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  drawDryTree(image, obj) {
    this.ctx.save();
    this.ctx.globalAlpha = 0.78;
    this.ctx.filter = 'grayscale(70%) sepia(80%) saturate(65%) brightness(1.12) contrast(0.82)';
    this.ctx.drawImage(image, obj.x, obj.y, obj.width, obj.height);
    this.ctx.restore();
  }

  drawTreeShadow(obj) {
    const centerX = obj.x + obj.width / 2;
    const centerY = obj.y + obj.height * 0.88;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    this.ctx.beginPath();
    this.ctx.ellipse(centerX, centerY, obj.width * 0.36, obj.height * 0.12, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  drawMedikit() {
    if (!this.medikit) return;

    const size = this.medikit.size || GAME_CONFIG.PLAYER_RADIUS * 3;
    const x = this.medikit.x - size / 2;
    const y = this.medikit.y - size / 2;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    this.ctx.beginPath();
    this.ctx.ellipse(this.medikit.x, this.medikit.y + size * 0.35, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
    this.ctx.fill();

    if (this.assets.medikit.complete && this.assets.medikit.naturalWidth > 0) {
      this.ctx.drawImage(this.assets.medikit, x, y, size, size);
    } else {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x, y, size, size);
      this.ctx.fillStyle = '#ef4444';
      this.ctx.fillRect(this.medikit.x - size * 0.08, y + size * 0.18, size * 0.16, size * 0.64);
      this.ctx.fillRect(x + size * 0.18, this.medikit.y - size * 0.08, size * 0.64, size * 0.16);
    }

    this.ctx.restore();
  }

  /**
   * Draw territory borders
   */
  drawTerritories() {
    for (const division of this.territories) {
      this.ctx.strokeStyle = 'rgba(255, 230, 80, 0.92)';
      this.ctx.lineWidth = 4;
      this.ctx.strokeRect(division.x, division.y, division.width, division.height);

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.ctx.fillRect(division.x + 16, division.y + 16, 190, 40);
      this.ctx.fillStyle = '#ffff00';
      this.ctx.font = 'bold 24px Arial';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(division.name, division.x + 28, division.y + 36);
    }

    this.ctx.setLineDash([]);
  }

  /**
   * Draw projectiles
   */
  drawProjectiles() {
    for (const projectile of this.projectiles) {
      if (!projectile.alive) continue;

      this.drawFireballProjectile(projectile);
      continue;

      // Draw fireball
      this.ctx.fillStyle = GAME_CONFIG.COLOR.FIREBALL;
      this.ctx.beginPath();
      this.ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Glow effect
      this.ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(projectile.x, projectile.y, projectile.radius + 5, 0, Math.PI * 2);
      this.ctx.stroke();

      // Flame symbol
      this.ctx.fillStyle = '#ffff00';
      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('🔥', projectile.x, projectile.y);
    }
  }

  drawFireballProjectile(projectile) {
    const angle = Math.atan2(projectile.vy || 0, projectile.vx || 1);
    const radius = projectile.radius || 10;
    const tailX = projectile.x - Math.cos(angle) * radius * 1.5;
    const tailY = projectile.y - Math.sin(angle) * radius * 1.5;
    const gradient = this.ctx.createRadialGradient(
      projectile.x - radius * 0.25,
      projectile.y - radius * 0.25,
      radius * 0.1,
      projectile.x,
      projectile.y,
      radius * 1.8
    );

    gradient.addColorStop(0, '#fff7a8');
    gradient.addColorStop(0.35, '#ffb347');
    gradient.addColorStop(0.72, '#ff5f1f');
    gradient.addColorStop(1, 'rgba(255, 70, 0, 0)');

    this.ctx.save();
    this.ctx.shadowColor = 'rgba(255, 112, 20, 0.75)';
    this.ctx.shadowBlur = 18;
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(projectile.x, projectile.y, radius * 1.45, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = 'rgba(255, 210, 80, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(tailX, tailY);
    this.ctx.quadraticCurveTo(
      projectile.x - Math.sin(angle) * radius * 0.7,
      projectile.y + Math.cos(angle) * radius * 0.7,
      projectile.x + Math.cos(angle) * radius,
      projectile.y + Math.sin(angle) * radius
    );
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawAimArrow() {
    if (!this.katanaMode || !this.localPlayer || !this.localPlayer.isAlive) return;

    const radius = GAME_CONFIG.PLAYER_RADIUS;
    const start = radius * 1.65;
    const length = 46;
    const baseX = this.localPlayer.x + Math.cos(this.aimAngle) * start;
    const baseY = this.localPlayer.y + Math.sin(this.aimAngle) * start;
    const tipX = this.localPlayer.x + Math.cos(this.aimAngle) * (start + length);
    const tipY = this.localPlayer.y + Math.sin(this.aimAngle) * (start + length);
    const wing = 10;

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = 'rgba(255, 245, 120, 0.96)';
    this.ctx.fillStyle = 'rgba(255, 245, 120, 0.96)';
    this.ctx.lineWidth = 5;
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    this.ctx.shadowBlur = 6;

    this.ctx.beginPath();
    this.ctx.moveTo(baseX, baseY);
    this.ctx.lineTo(tipX, tipY);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(tipX, tipY);
    this.ctx.lineTo(
      tipX - Math.cos(this.aimAngle - Math.PI / 6) * wing,
      tipY - Math.sin(this.aimAngle - Math.PI / 6) * wing
    );
    this.ctx.lineTo(
      tipX - Math.cos(this.aimAngle + Math.PI / 6) * wing,
      tipY - Math.sin(this.aimAngle + Math.PI / 6) * wing
    );
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  drawKatanaEffects() {
    const now = performance.now();

    for (const effect of this.katanaEffects) {
      const progress = Math.min(1, (now - effect.createdAt) / GAME_CONFIG.KATANA_EFFECT_MS);
      const alpha = 1 - progress;
      const radius = effect.radius || 90;
      const startAngle = effect.angle - Math.PI * 0.4;
      const endAngle = effect.angle + Math.PI * 0.4;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.lineCap = 'round';
      this.ctx.strokeStyle = 'rgba(190, 245, 255, 0.9)';
      this.ctx.lineWidth = 16 * (1 - progress) + 4;
      this.ctx.beginPath();
      this.ctx.arc(effect.x, effect.y, radius * (0.6 + progress * 0.4), startAngle, endAngle);
      this.ctx.stroke();

      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.arc(effect.x, effect.y, radius * (0.5 + progress * 0.45), startAngle, endAngle);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  /**
   * Draw all players
   */
  drawPlayers() {
    // Draw other players first
    for (const player of this.players.values()) {
      this.drawPlayer(player, false);
    }

    // Draw local player on top
    if (this.localPlayer) {
      this.drawPlayer(this.localPlayer, true);
    }
  }

  /**
   * Draw a single player
   */
  drawPlayer(player, isLocal) {
    if (!player || !player.isAlive) {
      return;
    }

    const radius = GAME_CONFIG.PLAYER_RADIUS;
    const image = isLocal ? this.assets.self : this.assets.enemy;
    const spriteSize = radius * 3;
    const flipHorizontally = isLocal && player.vx > 0;

    if (image.complete && image.naturalWidth > 0) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(player.x, player.y, radius * 1.35, 0, Math.PI * 2);
      this.ctx.clip();
      if (flipHorizontally) {
        this.ctx.translate(player.x, player.y);
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(image, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
      } else {
        this.ctx.drawImage(image, player.x - spriteSize / 2, player.y - spriteSize / 2, spriteSize, spriteSize);
      }
      this.ctx.restore();
    } else {
      const color = isLocal ? GAME_CONFIG.COLOR.SELF : GAME_CONFIG.COLOR.OTHER;
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.strokeStyle = isLocal ? '#00ff00' : '#ff6666';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(player.x, player.y, radius * 1.35, 0, Math.PI * 2);
    this.ctx.stroke();

    // Draw health bar above player
    this.drawHealthBar(player.x, player.y - radius - 15, player.health, player.maxHealth);

    // Draw player name
    this.ctx.fillStyle = GAME_CONFIG.COLOR.UI_TEXT;
    this.ctx.font = '12px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(player.name, player.x, player.y - radius - 35);
  }

  /**
   * Draw health bar
   */
  drawHealthBar(x, y, health, maxHealth) {
    const width = 30;
    const height = 4;

    this.ctx.fillStyle = GAME_CONFIG.COLOR.HEALTH_BAR_BG;
    this.ctx.fillRect(x - width / 2, y, width, height);

    const healthPercent = health / maxHealth;
    this.ctx.fillStyle = GAME_CONFIG.COLOR.HEALTH_BAR_FILL;
    this.ctx.fillRect(x - width / 2, y, width * healthPercent, height);

    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x - width / 2, y, width, height);
  }

  /**
   * Draw UI elements (always on screen)
   */
  drawUI() {
    const padding = 10;

    // Draw FPS
    this.ctx.fillStyle = GAME_CONFIG.COLOR.UI_TEXT;
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(`FPS: ${this.fps}`, padding, padding);

    if (this.localPlayer) {
      this.ctx.fillText(`Position: (${Math.round(this.localPlayer.x)}, ${Math.round(this.localPlayer.y)})`, padding, padding + 20);
    }
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

let gameInstance = null;

document.getElementById('joinButton').addEventListener('click', () => {
  const playerName = document.getElementById('playerNameInput').value.trim();
  const divisionId = document.getElementById('divisionSelect').value;
  
  if (!playerName) {
    alert('Please enter a name');
    return;
  }

  // Hide loading screen
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');

  // Initialize game
  gameInstance = new Game();
  gameInstance.init();

  // Join game
  socketManager.join(playerName, divisionId);
});

// Allow Enter to join
document.getElementById('playerNameInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('joinButton').click();
  }
});
