# Curve Fever - Multiplayer Game

A browser-based multiplayer Curve Fever (Achtung die Kurve) game with real-time support for up to 10 players. Built with Node.js, Socket.io, and HTML5 Canvas.

## Features

- **Real-time Multiplayer**: Support for 2-10 players simultaneously
- **Modern UI**: Clean, card-based design with Telekom Magenta theme
- **Smooth Gameplay**: 60 FPS server-authoritative game loop
- **Responsive Controls**: Multiple keyboard layouts for different players
- **Score Tracking**: Round-based scoring with persistent leaderboard
- **Visual Polish**: Glow effects, smooth animations, and glassmorphism UI

## Game Mechanics

- Each player controls a continuously moving line that leaves a trail
- Players can only turn left or right using their assigned keys
- Periodic gaps appear in the trails
- Power-ups spawn randomly on the map, providing temporary effects like speed boosts or slowdowns
- Collision with any trail (including your own) or arena walls eliminates you
- Last player surviving wins the round
- Scores persist across rounds

## Technology Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript, HTML5 Canvas, CSS3
- **Real-time Communication**: WebSockets via Socket.io

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## How to Play

### Joining a Game

1. Open `http://localhost:3000` in your browser
2. Enter your player name
3. Click "Join Lobby"
4. Wait for other players to join (minimum 2 players required)
5. Click "Ready to Play" when you're ready
6. Game starts when all players are ready

### Playing with Multiple Players

To test with multiple players on the same computer:
- Open multiple browser windows or tabs
- Navigate to `http://localhost:3000` in each
- Join with different names in each window

### Controls

Each player is assigned a unique control scheme:

- **Player 1**: ← (left) / → (right)
- **Player 2**: A (left) / D (right)
- **Player 3**: J (left) / L (right)
- **Player 4**: Z (left) / C (right)
- **Player 5**: 4 (left) / 6 (right)
- **Player 6**: F (left) / H (right)
- **Player 7**: Q (left) / E (right)
- **Player 8**: U (left) / O (right)
- **Player 9**: V (left) / N (right)
- **Player 10**: 7 (left) / 9 (right)

Your assigned controls are displayed in the lobby and in the game HUD.

## Game Rules

1. **Movement**: Your line moves continuously forward
2. **Turning**: Use your left/right keys to turn
3. **Trails**: Your line leaves a colored trail behind it
4. **Gaps**: Periodic gaps appear in your trail (safe to pass through)
5. **Power-ups**: Collect power-ups for temporary effects (e.g., speed changes)
6. **Collision**: Hitting any trail or wall eliminates you
7. **Winning**: Be the last player alive to win the round
8. **Scoring**: Winner gets 1 point per round

## Server Configuration

You can modify these constants in `server.js`:

```javascript
const PORT = 3000;                    // Server port
const CANVAS_WIDTH = 1200;            // Game arena width
const CANVAS_HEIGHT = 700;            // Game arena height
const PLAYER_SPEED = 2;               // Player movement speed
const TURN_SPEED = 0.05;              // Turning speed
const TRAIL_WIDTH = 4;                // Trail thickness
const GAP_INTERVAL = 100;             // Frames between gaps
const GAP_LENGTH = 15;                // Frames of gap duration
const FPS = 60;                       // Server tick rate
```

## Project Structure

```
/
├── server.js              # Node.js server with game logic
├── package.json           # Dependencies and scripts
├── README.md              # This file
└── public/
    ├── index.html         # Game UI structure
    ├── styles.css         # Telekom Magenta theme styling
    └── game.js            # Client-side rendering and input
```

## Architecture

### Client-Server Model

- **Authoritative Server**: All game logic runs on the server to prevent cheating
- **Client Rendering**: Clients receive game state and render it locally
- **Input Handling**: Clients send input commands, server validates and processes
- **State Synchronization**: Server broadcasts game state at 60 FPS

### Game Flow

1. **Lobby**: Players join and ready up
2. **Countdown**: 3-second countdown with animation
3. **Playing**: Active gameplay until one player remains
4. **Round End**: Winner announcement and score update
5. **Auto-restart**: New round begins after 3 seconds

## Design System

### Color Palette (Telekom Magenta)

- **Primary**: #E20074 (Telekom Magenta)
- **Primary Dark**: #A4005C
- **Secondary**: #9E9E9E
- **Background**: #1A1A1A
- **Surface**: #2A2A2A
- **Success**: #00D68F
- **Error**: #FF4444

### UI Principles

- Modern, minimal design with ample whitespace
- Card-based layouts with soft shadows
- Glassmorphism effects (backdrop blur)
- Smooth transitions and animations
- Responsive design for different screen sizes

## Development

### Running in Development Mode

```bash
npm run dev
```

### Testing with Multiple Players

1. Start the server with `npm start`
2. Open multiple browser windows
3. Navigate each to `http://localhost:3000`
4. Join with different player names
5. Test gameplay, collision detection, and scoring

## Troubleshooting

**Players can't connect:**
- Ensure the server is running (`npm start`)
- Check that port 3000 is not in use
- Try accessing via `http://localhost:3000`

**Game won't start:**
- Ensure at least 2 players have joined
- All players must click "Ready to Play"

**Lag or stuttering:**
- Close other applications
- Ensure stable network connection
- Try reducing FPS in server.js (not recommended below 30)

**Controls not working:**
- Make sure the game window has focus
- Check that you're using the correct keys for your player slot
- Verify controls in the HUD during gameplay

## Future Enhancements

Potential features to add:
- Power-ups (speed boost, invincibility, etc.)
- Multiple game modes (team mode, time attack, etc.)
- Customizable arena sizes
- Player statistics and rankings
- Sound effects and background music
- Mobile touch controls
- Replay system
- Tournament mode

## License

MIT License - Feel free to use and modify this project.

## Credits

Inspired by the classic Curve Fever (Achtung die Kurve) game.

Built with modern web technologies and the Telekom Magenta design system.
