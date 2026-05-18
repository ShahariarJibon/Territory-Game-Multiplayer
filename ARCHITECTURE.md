# Territory Fighting Game - Architecture & Technical Summary

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER (Client)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ index.html (UI + Loading Screen)                    │  │
│  │ style.css (All styling)                             │  │
│  │ game.js (Canvas rendering + Game loop)              │  │
│  │ socket.js (Socket.io client manager)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↕ Socket.io                         │
│                    (Real-time events)                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    NODE.JS SERVER (Node.js)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ server.js                                           │  │
│  │ - Express app on port 3000                          │  │
│  │ - Socket.io connection handler                      │  │
│  │ - Player state management (in-memory)               │  │
│  │ - Game loop (60 ticks/second)                       │  │
│  │ - Combat validation                                │  │
│  │ - Event broadcasting                               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ gameLogic.js                                        │  │
│  │ - Map generation & territory system                 │  │
│  │ - Collision detection                              │  │
│  │ - Combat hit detection                             │  │
│  │ - Projectile physics                               │  │
│  │ - Game constants & configuration                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📡 Communication Flow (Socket.io Events)

### Client → Server Events

| Event | Payload | Purpose | Frequency |
|-------|---------|---------|-----------|
| `playerJoin` | `{name}` | Player enters game | 1x on connect |
| `moveInput` | `{up, down, left, right}` | Movement input | Every key press/release |
| `attack` | `{}` | Melee sword attack | On click (cooldown) |
| `castFireball` | `{angle}` | Fireball projectile | On F key (cooldown) |

### Server → Client Events

| Event | Payload | Purpose | Frequency |
|-------|---------|---------|-----------|
| `gameInit` | `{playerId, map, players}` | Game start data | 1x on join |
| `playerJoined` | `{...playerData}` | New player joined | Per join |
| `gameState` | `{players[], projectiles[]}` | World state | 60/sec (server tick) |
| `playerHit` | `{targetId, damage, health}` | Damage taken | On hit |
| `playerDied` | `{playerId, killedBy}` | Death event | On death |
| `fireballCast` | `{projectile}` | New fireball | On cast |
| `playerLeft` | `{playerId}` | Player disconnect | On disconnect |

---

## 🎮 Game Loop Timing

### Client Side
```javascript
requestAnimationFrame(() => {
  update(deltaTime);  // Not much - server handles logic
  render();           // Canvas rendering from game state
  gameLoop();         // Next frame
});
```

### Server Side
```javascript
setInterval(() => {
  // Every 16.67ms (60 FPS)
  updatePlayerPositions(deltaTime);
  updateProjectiles(deltaTime);
  checkCollisions();
  checkProjectileHits();
  broadcast(gameState);  // Send to all clients
}, 1000/60);
```

---

## 📊 Data Structures

### Player Object (Server)
```javascript
{
  id: "socket_id",
  name: "PlayerName",
  x: 500,           // Position
  y: 600,
  vx: 0,            // Velocity (set by server)
  vy: 0,
  health: 100,
  maxHealth: 100,
  territory: {      // Current territory
    divisionId: "div_0_0",
    divisionName: "Division_0_0",
    districtId: "dist_0_0_0_0"
  },
  lastAttackTime: timestamp,
  lastFireballTime: timestamp,
  isAlive: true,
  speed: 300        // pixels per second
}
```

### Map Object
```javascript
{
  x: 100,           // Position
  y: 200,
  width: 50,        // Size
  height: 50,
  type: "wall",     // Object type
  collision: true   // Can collide with players
}
```

### Territory (Division)
```javascript
{
  id: "div_0_0",
  name: "Division_0_0",
  x: 0,
  y: 0,
  width: 500,       // 1/4 of map (2000/4)
  height: 500,
  districts: [      // Contains 4x4 = 16 districts
    {
      id: "dist_0_0_0_0",
      x: 0,
      y: 0,
      width: 125,   // 1/4 of division
      height: 125
    },
    // ... 15 more
  ]
}
```

### Projectile (Fireball)
```javascript
{
  id: "playerid_timestamp",
  playerId: "attacker_id",
  x: 500,           // Current position
  y: 600,
  vx: 150,          // Velocity
  vy: 150,
  radius: 8,
  lifetime: 5000,   // 5 seconds max
  createdAt: timestamp,
  alive: true
}
```

---

## 🎯 Combat Validation (Server-Side)

### Why Server Validates?
- **Prevent cheating**: Client can't send fake hit data
- **Fair gameplay**: Authoritative server decides outcomes
- **Network tolerance**: Server calculates with actual positions

### Validation Process

#### Melee Attack
1. Client sends `attack` event
2. Server checks:
   - Is attacker alive?
   - Has cooldown passed? (500ms)
   - Is target within range? (40px)
3. If valid:
   - Calculate damage (10 HP)
   - Reduce target health
   - Broadcast `playerHit` to all clients
4. If invalid:
   - Ignore (prevent spam)

#### Fireball Attack
1. Client sends `castFireball` with angle
2. Server checks:
   - Is attacker alive?
   - Has cooldown passed? (30s)
3. If valid:
   - Create projectile object
   - Add to server's projectile list
   - Broadcast `fireballCast` to all clients
4. Server continues to:
   - Update projectile position
   - Check collision with obstacles
   - Check collision with players
   - Apply damage when hit
   - Remove when lifetime ends

---

## 🗺️ Map Generation Algorithm

### Step 1: Initialize Map
- Size: 2000x2000 pixels
- Grid cell: 100 pixels (for territories)

### Step 2: Add Obstacles
- **Mountains**: 15 randomly placed, 80-200px size, solid
- **Buildings**: 20 mixed types (school, college, hospital, shop), 40-100px, solid
- **Trees**: 50 scattered, 20-60px, non-solid (visual only)
- **Ponds**: 8 water areas, 60-160px, non-solid
- **Roads**: 5 horizontal/vertical paths, full map width/height, non-solid
- **Walls**: 30 destroyed walls, 30-80px, solid

### Step 3: Add Landmarks
- **Nuclear Power Plant**: 150x150px at (1400, 600), red landmark, solid
- **Boundaries**: Invisible walls at map edges

### Step 4: Create Territory Grid
- **Divisions**: 4x4 = 16 divisions, each 500x500px
- **Districts**: Each division has 4x4 = 16 districts, each 125x125px
- **Total**: 256 spawn zones across the map

---

## ⚙️ Collision Detection

### Algorithm: Circle-Rectangle Collision

For each player at position (x, y) with radius r:

```
For each solid map object (rect):
  Find closest point on rect to circle:
    closestX = max(rect.x, min(x, rect.x + rect.width))
    closestY = max(rect.y, min(y, rect.y + rect.height))
  
  Calculate distance:
    distX = x - closestX
    distY = y - closestY
    distance = sqrt(distX² + distY²)
  
  If distance < radius:
    COLLISION DETECTED
    Cancel movement
```

### Performance Optimization
- Only check collision for solid objects
- Boundaries use simple edge checks (x < 0, etc.)
- Projectiles check map boundaries instantly

---

## 🚀 Real-Time Synchronization Strategy

### Problem: Network Latency
- Players see slightly outdated positions
- Attacks might feel "delayed"

### Solution: Server Authority
- **Server decides truth**
- Client sends input (not position)
- Server calculates new position
- Server broadcasts corrected position

### Update Frequency
- **Server tick rate**: 60 Hz (16.67ms per update)
- **Network bandwidth**: ~100 bytes per player per tick
- **Latency tolerance**: Works fine up to 200ms ping

### Example: Player Movement
```
T=0ms: Client presses "W"
       Client sends moveInput {up: 1}

T=5ms: Server receives input
       Updates player.vy = 300 (PLAYER_SPEED)
       Calculates new position based on delta time

T=16.67ms: Server broadcasts gameState
           All clients update player position

T=20ms: Other clients render updated position
```

---

## 💡 Key Design Decisions

| Decision | Why |
|----------|-----|
| **Server-side validation** | Prevent cheating, ensure fair gameplay |
| **In-memory storage** | Fast, no DB latency, MVP scope |
| **Broadcast full state** | Simpler than delta sync, still efficient at 50-100 players |
| **60 Hz server tick** | Balance between responsiveness and bandwidth |
| **Grid-based territories** | Easy to extend, spawn zones, territory capture later |
| **Canvas rendering** | Simple, performant, 2D-friendly |
| **Socket.io** | Built-in reconnection, fallback transports, easy debugging |

---

## 📈 Scalability Considerations

### Current Limits
- **Players per server**: 50-100 recommended
- **Network**: ~6KB/sec per player at 60 Hz
- **CPU**: Minimal (no complex physics)
- **Memory**: ~1MB per player (rough estimate)

### To Scale Beyond 100 Players

1. **Spatial partitioning**: Only broadcast to nearby players
   - Divide map into zones
   - Only sync nearby zone players

2. **Interest management**: Clients only need nearby data
   - Load entities within camera view range
   - Unload when out of range

3. **Multiple servers**: Use load balancer
   - Map divided among servers
   - Cross-server communication for bordering players

4. **Database**: Store persistent player data
   - MongoDB for stats/inventory
   - Redis for session state
   - Replicate servers seamlessly

---

## 🐛 Common Bugs & Solutions

### Bug 1: Players stuck in walls
**Cause**: Collision detection too strict
**Fix**: Adjust PLAYER_RADIUS or map object sizes

### Bug 2: Fireball goes through walls
**Cause**: Projectile not checking map obstacles
**Fix**: Add obstacle collision in `updateProjectiles()`

### Bug 3: Attack hits enemies too far away
**Cause**: Attack range too large
**Fix**: Reduce `ATTACK_RANGE` in game config

### Bug 4: High latency = delayed movements
**Cause**: Network delays natural
**Fix**: Implement client-side prediction (future enhancement)

---

## 🎨 Rendering Optimization Tips

### Current Performance
- FPS counter top-left of screen
- Target: 60 FPS on modern browsers

### If You Experience Lag
1. Check FPS in game (top-left)
2. Reduce map object complexity
3. Disable grid drawing for zoomed-out views
4. Use RequestAnimationFrame (already done)

### Future Optimizations
- Quadtree spatial indexing (render nearby only)
- WebGL instead of Canvas2D (for 3000+ objects)
- Worker thread for physics calculations

---

## 📚 Extension Examples

### Add New Weapon Type
1. Add to server `socket.on()` handler
2. Implement hit detection in GameLogic
3. Add UI button in HTML
4. Add client-side key handler in game.js

### Add Respawn System
1. Track player death time
2. Broadcast respawn event after delay
3. Reset health and position
4. Update client render state

### Add Team System
1. Add `team` property to player
2. Filter friendly fire
3. Color code players by team
4. Add team stats tracking

---

## 🔗 Dependencies

```json
{
  "express": "^4.18.2",      // Web framework
  "socket.io": "^4.5.4"       // Real-time communication
}
```

Only 2 production dependencies! Lightweight and focused.

---

## 📖 Learning Resources

### Concepts Used
- **WebSockets**: Real-time bidirectional communication
- **Game loops**: Update → Render pattern
- **Collision detection**: Circle-rect collision math
- **Networking**: Server authority, client prediction
- **Canvas API**: 2D drawing and animation

### Further Reading
- Socket.io docs: https://socket.io/docs/
- Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- Game programming patterns: https://gameprogrammingpatterns.com/

---

## ✅ MVP Checklist

- [x] Multiplayer connection
- [x] Real-time player sync
- [x] Map with obstacles
- [x] Territory system
- [x] Player movement
- [x] Melee combat
- [x] Ranged attack (fireball)
- [x] Health system
- [x] Collision detection
- [x] Camera system
- [x] UI/HUD
- [x] Kill feed
- [x] Clean code structure
- [x] Documentation

**Phase 1: MVP ✅ COMPLETE**

Ready for Phase 2 enhancements!
