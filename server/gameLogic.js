/**
 * Game Logic Module
 * Handles division map generation, collision detection, and game mechanics.
 */

class GameLogic {
  constructor() {
    this.divisionSize = 800;
    this.divisionsPerRow = 4;
    this.divisionRows = 2;
    this.mapWidth = this.divisionSize * this.divisionsPerRow;
    this.mapHeight = this.divisionSize * this.divisionRows;
    this.gridSize = this.divisionSize;

    this.PLAYER_SPEED = 360;
    this.PLAYER_RADIUS = 18;
    this.TREE_SIZE = 190;
    this.TREE_COLLISION_INSET = this.TREE_SIZE * 0.25;
    this.MEDIKIT_LIFETIME = 30000;
    this.MEDIKIT_SIZE = this.PLAYER_RADIUS * 3;
    this.SWORD_DAMAGE = 10;
    this.FIREBALL_DAMAGE = this.SWORD_DAMAGE * 2;
    this.KATANA_MAX_DAMAGE = 42;
    this.KATANA_RADIUS = 90;
    this.KATANA_ARC = Math.PI * 0.8;

    this.territories = this.generateTerritories();
    this.mapObjects = this.generateMapObjects();
    this.projectiles = [];
    this.medikit = null;
    this.divisionCount = this.territories.length;
  }

  generateMapObjects() {
    return this.territories.map(division => ({
      id: `tree_${division.id}`,
      type: 'tree',
      collision: true,
      divisionId: division.id,
      x: division.x + division.width / 2 - this.TREE_SIZE / 2,
      y: division.y + division.height / 2 - this.TREE_SIZE / 2,
      width: this.TREE_SIZE,
      height: this.TREE_SIZE,
      collisionInset: this.TREE_COLLISION_INSET
    }));
  }

  generateTerritories() {
    const divisionNames = [
      'Dhaka',
      'Chattogram',
      'Rajshahi',
      'Khulna',
      'Barishal',
      'Sylhet',
      'Rangpur',
      'Mymensingh'
    ];

    return divisionNames.map((name, index) => {
      const col = index % this.divisionsPerRow;
      const row = Math.floor(index / this.divisionsPerRow);
      const id = `div_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

      return {
        id,
        name,
        x: col * this.divisionSize,
        y: row * this.divisionSize,
        width: this.divisionSize,
        height: this.divisionSize
      };
    });
  }

  getDivisionById(divisionId) {
    return this.territories.find(division => division.id === divisionId);
  }

  getPlayersInDivision(players, divisionId) {
    return Array.from(players.values()).filter((player) => (
      player.isAlive &&
      player.territory &&
      player.territory.divisionId === divisionId
    ));
  }

  allEnemiesDefeatedInDivision(players, divisionId, playerId) {
    return this.getPlayersInDivision(players, divisionId)
      .filter(player => player.id !== playerId)
      .length === 0;
  }

  getRandomSpawnPosition() {
    const randomDivision = this.territories[Math.floor(Math.random() * this.territories.length)];
    return this.getSpawnPoint(randomDivision);
  }

  getSpawnPositionInDivision(preferredDivisionId, players = new Map()) {
    const playerList = Array.from(players.values ? players.values() : players);
    const occupiedDivisions = new Set(
      playerList
        .filter(player => player.isAlive)
        .map(player => player.homeDivisionId || player.territory?.divisionId)
        .filter(Boolean)
    );

    let division = this.getDivisionById(preferredDivisionId) || this.territories[0];

    if (occupiedDivisions.has(division.id)) {
      const openDivision = this.territories.find(item => !occupiedDivisions.has(item.id));
      if (openDivision) {
        division = openDivision;
      }
    }

    return this.getSpawnPoint(division);
  }

  getSpawnPoint(division) {
    const safeMargin = this.divisionSize * 0.2;
    const tree = this.getTreeForDivision(division.id);

    for (let i = 0; i < 40; i++) {
      const x = division.x + safeMargin + Math.random() * (division.width - safeMargin * 2);
      const y = division.y + safeMargin + Math.random() * (division.height - safeMargin * 2);

      if (!tree || !this.circleIntersectsRect(x, y, this.PLAYER_RADIUS + 10, tree)) {
        return { x, y, division };
      }
    }

    return {
      x: division.x + division.width * 0.2,
      y: division.y + division.height * 0.2,
      division
    };
  }

  getTreeForDivision(divisionId) {
    return this.mapObjects.find(obj => obj.type === 'tree' && obj.divisionId === divisionId);
  }

  getTerritory(x, y) {
    for (const division of this.territories) {
      if (x >= division.x && x <= division.x + division.width &&
          y >= division.y && y <= division.y + division.height) {
        return {
          divisionId: division.id,
          divisionName: division.name
        };
      }
    }

    return {
      divisionId: 'unknown',
      divisionName: 'Unknown'
    };
  }

  checkCollision(x, y) {
    if (x - this.PLAYER_RADIUS < 0 ||
        x + this.PLAYER_RADIUS > this.mapWidth ||
        y - this.PLAYER_RADIUS < 0 ||
        y + this.PLAYER_RADIUS > this.mapHeight) {
      return true;
    }

    return this.mapObjects.some(obj => (
      obj.collision &&
      this.circleIntersectsRect(x, y, this.PLAYER_RADIUS, obj)
    ));
  }

  circleIntersectsRect(x, y, radius, rect) {
    const inset = rect.collisionInset || 0;
    const rectX = rect.x + inset;
    const rectY = rect.y + inset;
    const rectWidth = Math.max(0, rect.width - inset * 2);
    const rectHeight = Math.max(0, rect.height - inset * 2);
    const closestX = Math.max(rectX, Math.min(x, rectX + rectWidth));
    const closestY = Math.max(rectY, Math.min(y, rectY + rectHeight));
    const distanceX = x - closestX;
    const distanceY = y - closestY;

    return distanceX * distanceX + distanceY * distanceY < radius * radius;
  }

  checkAttackHit(attacker, allPlayers) {
    const attackRange = 48;

    for (const player of allPlayers) {
      if (player.id === attacker.id || !player.isAlive) continue;
      if (player.territory?.divisionId !== attacker.territory?.divisionId) continue;

      const dx = player.x - attacker.x;
      const dy = player.y - attacker.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < attackRange) {
        return player.id;
      }
    }

    return null;
  }

  checkProjectileHit(projectile, player) {
    const dx = player.x - projectile.x;
    const dy = player.y - projectile.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance < projectile.radius + this.PLAYER_RADIUS;
  }

  updateMedikit(now = Date.now()) {
    if (!this.medikit || now >= this.medikit.expiresAt) {
      this.medikit = this.createMedikit(now);
    }

    return this.medikit;
  }

  createMedikit(now = Date.now()) {
    const halfSize = this.MEDIKIT_SIZE / 2;

    for (let i = 0; i < 120; i++) {
      const division = this.territories[Math.floor(Math.random() * this.territories.length)];
      const x = division.x + halfSize + Math.random() * (division.width - this.MEDIKIT_SIZE);
      const y = division.y + halfSize + Math.random() * (division.height - this.MEDIKIT_SIZE);

      if (!this.checkCollision(x, y)) {
        return {
          id: `medikit_${now}_${i}`,
          x,
          y,
          size: this.MEDIKIT_SIZE,
          radius: halfSize,
          createdAt: now,
          expiresAt: now + this.MEDIKIT_LIFETIME
        };
      }
    }

    const fallbackDivision = this.territories[0];
    return {
      id: `medikit_${now}_fallback`,
      x: fallbackDivision.x + fallbackDivision.width * 0.25,
      y: fallbackDivision.y + fallbackDivision.height * 0.25,
      size: this.MEDIKIT_SIZE,
      radius: halfSize,
      createdAt: now,
      expiresAt: now + this.MEDIKIT_LIFETIME
    };
  }

  collectMedikit(player) {
    if (!this.medikit || !player || !player.isAlive) {
      return null;
    }

    const dx = player.x - this.medikit.x;
    const dy = player.y - this.medikit.y;
    const pickupDistance = this.PLAYER_RADIUS + this.medikit.radius;

    if (dx * dx + dy * dy > pickupDistance * pickupDistance) {
      return null;
    }

    const medikit = this.medikit;
    this.medikit = null;
    return medikit;
  }

  getNearestEnemy(player, allPlayers) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const enemy of allPlayers) {
      if (enemy.id === player.id || !enemy.isAlive) continue;
      if (enemy.territory?.divisionId !== player.territory?.divisionId) continue;

      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < nearestDistance) {
        nearest = enemy;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  getKatanaHits(attacker, allPlayers, angle) {
    const hits = [];

    for (const player of allPlayers) {
      if (player.id === attacker.id || !player.isAlive) continue;
      if (player.territory?.divisionId !== attacker.territory?.divisionId) continue;

      const dx = player.x - attacker.x;
      const dy = player.y - attacker.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > this.KATANA_RADIUS) continue;

      const targetAngle = Math.atan2(dy, dx);
      const angleDelta = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (angleDelta > this.KATANA_ARC / 2) continue;

      const closeness = 1 - (distance / this.KATANA_RADIUS);
      const damage = Math.max(this.SWORD_DAMAGE, Math.round(this.SWORD_DAMAGE + closeness * (this.KATANA_MAX_DAMAGE - this.SWORD_DAMAGE)));

      hits.push({
        targetId: player.id,
        damage,
        distance
      });
    }

    return hits;
  }

  addProjectile(projectile) {
    projectile.speed = projectile.speed || 360;
    this.projectiles.push(projectile);
  }

  updateProjectiles() {
    const deltaTime = 1 / 60;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];

      if (!projectile.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }

      projectile.x += projectile.vx * deltaTime;
      projectile.y += projectile.vy * deltaTime;

      if (Date.now() - projectile.createdAt > projectile.lifetime) {
        projectile.alive = false;
      }

    }
  }

  getProjectiles() {
    return this.projectiles;
  }

  getMedikit() {
    return this.medikit;
  }

  getMapData() {
    return {
      width: this.mapWidth,
      height: this.mapHeight,
      objects: this.mapObjects,
      territories: this.territories,
      playerSpeed: this.PLAYER_SPEED,
      playerRadius: this.PLAYER_RADIUS
    };
  }
}

module.exports = GameLogic;
