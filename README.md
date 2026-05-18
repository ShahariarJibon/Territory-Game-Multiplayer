# Territory Game Multiplayer


https://territory-game-multiplayer-production.up.railway.app

A browser-based real-time multiplayer territory fighting game built with Node.js, Express, Socket.IO, and HTML5 Canvas.

Players choose a Bangladesh division, spawn into a shared arena, fight opponents in the same division, collect medikits, and clear territory to become the winner.

## Features

- Real-time multiplayer synchronization with Socket.IO
- Server-authoritative movement, combat, projectile, health, and win-state handling
- Eight Bangladesh division arenas: Dhaka, Chattogram, Rajshahi, Khulna, Barishal, Sylhet, Rangpur, and Mymensingh
- Division-based spawning with occupied-division fallback
- Locked-division gameplay until enemies in the current division are defeated
- Canvas-rendered 2D map with image assets for land, trees, players, and medikits
- Melee sword attack, katana swipe, and fireball projectile abilities
- Random medikit spawns with instant heal or stored medikit behavior
- Live HUD for health, current division, medikit count, remaining players, and winner state
- Kill feed and multiplayer join/leave updates

## Tech Stack

- Node.js
- Express
- Socket.IO
- HTML5 Canvas
- Vanilla JavaScript
- CSS

## Getting Started

### Prerequisites

- Node.js 14 or newer
- npm
- A modern browser such as Chrome, Edge, Firefox, or Safari

### Installation

Clone the repository:

```bash
git clone https://github.com/ShahariarJibon/Territory-Game-Multiplayer.git
cd Territory-Game-Multiplayer
```

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Open the game:

```text
http://localhost:3000
```

To test multiplayer locally, open the same URL in multiple browser tabs or windows.

### Development Mode

Run the server with automatic restarts:

```bash
npm run dev
```

## Controls

| Control | Action |
| --- | --- |
| W/A/S/D | Move |
| Mouse move | Aim |
| Left click | Sword attack, or katana swipe while katana mode is active |
| L | Toggle katana mode |
| F | Cast fireball |

## Gameplay

1. Enter a player name.
2. Select a starting division.
3. Join the game.
4. Fight players in your current division.
5. Defeat enemies to unlock movement into other divisions.
6. Collect medikits to restore health or store them for later.
7. Win by being the last surviving player or clearing the map.

## Project Structure

```text
territory/
|-- client/
|   |-- index.html      # Game UI and canvas shell
|   |-- style.css       # Game styling and HUD layout
|   |-- game.js         # Canvas rendering, input, UI, and client game state
|   `-- socket.js       # Socket.IO client wrapper
|-- server/
|   |-- server.js       # Express server, Socket.IO events, and game loop
|   `-- gameLogic.js    # Map generation, territory logic, collision, and combat helpers
|-- ARCHITECTURE.md     # Technical notes
|-- QUICKSTART.md       # Quick local setup notes
|-- package.json        # Scripts and dependencies
|-- .gitignore
|-- land.png
|-- tree.png
|-- main char.png
|-- enemy char.png
|-- medikit.png
`-- README.md
```

## Socket Events

### Client to Server

| Event | Purpose |
| --- | --- |
| `playerJoin` | Join the game with a name and preferred division |
| `moveInput` | Send movement key state |
| `attack` | Request a sword attack |
| `katanaSwipe` | Request a katana arc attack |
| `castFireball` | Request a fireball projectile |

### Server to Client

| Event | Purpose |
| --- | --- |
| `gameInit` | Send initial player, map, and spawn data |
| `playerJoined` | Notify clients about a new player |
| `gameState` | Broadcast current players, projectiles, medikit, and winner data |
| `playerHit` | Notify clients about health changes |
| `playerDied` | Notify clients about player elimination |
| `fireballCast` | Broadcast a new fireball |
| `katanaSwipe` | Broadcast a katana visual effect |
| `gameWinner` | Announce the winner |
| `playerLeft` | Remove disconnected players |

## Configuration

The server uses port `3000` by default. You can override it with the `PORT` environment variable:

```bash
PORT=4000 npm start
```

On Windows PowerShell:

```powershell
$env:PORT=4000; npm start
```

## Notes

- Game state is currently stored in memory, so it resets when the server restarts.
- The server validates combat and movement state to keep gameplay fair.
- This is a prototype foundation for a larger multiplayer territory game.

## Future Ideas

- Persistent player accounts and stats
- Matchmaking and lobby rooms
- Team-based territory control
- Leaderboards
- More weapons and abilities
- Sound effects and improved animations
- Mobile touch controls
- Database-backed inventory and progression

## License

ISC
