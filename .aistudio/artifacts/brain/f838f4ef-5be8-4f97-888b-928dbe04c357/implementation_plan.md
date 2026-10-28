# TelePad Arcade — Wii U-Style Second-Screen Console & GamePad Platform

TelePad Arcade transforms any desktop or TV browser into a shared living-room game console while turning smartphones into asymmetric **Wii U GamePad** controllers over low-latency WebSockets. Building directly on your `phone-pong` prototype, it introduces a **Dynamic Morphing GamePad SDK** and launches with two flagship experiences: **Phone Pong DX** and **Crypt of the Overlord** (an asymmetric 1-vs-Many / Co-op dungeon game).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Direction from Brainstorming**:
> - **Unified Phone GamePad SDK (All 4 Modes)**: The mobile controller dynamically morphs its layout per game and player role—supporting **(1) Motion Swing & Tilt Gyro Aiming**, **(2) Private Radar & Hidden Map Viewports**, **(3) Touch Slingshot & Live Path Drawing**, and **(4) Virtual Arcade D-Pad & Action Triggers**.
> - **2-Game Flagship Lineup**:
>   1. **Phone Pong DX**: Upgrades your 240Hz 3D-projected table tennis engine with 1–4 player modes (1v1, 2v2 Doubles, CPU Bots) and a live second-screen **Tactical Table Radar & Sweet-Spot Timing Meter** on the phone.
>   2. **Crypt of the Overlord**: A deep asymmetric Wii U-style dungeon game where **1 Overlord player** uses a private phone map to draw arcane walls, place hidden traps, and slingshot spectral projectiles, while **1–3 Explorer players** (with CPU bot fill) use virtual D-pads and gyro-aimed flashlights on the TV screen to survive and unlock beacons.
> - **1–4 Players + CPU Bots + Built-In Phone Simulator**: Supports 1 to 4 connected phones via 4-letter Room Code or instant QR scan, automatic CPU bot assignment for open slots, and a **Split-Screen GamePad Simulator** so you can test and play both the TV view and a Phone GamePad inside a single browser window when needed.
> - **Tactile Neo-Console Dark UI**: Deep obsidian-navy console surfaces (`#0B1020`) paired with high-contrast player slot accents (`P1` Cyan `#38BDF8`, `P2` Coral `#FB7185`, `P3` Emerald `#34D399`, `P4` Amber `#FBBF24`).

---

### 1. Overview & Core Concept

- **What It Does**:
  - **Main Screen (TV / Desktop Host)**: Acts as the living-room console hub and shared arena viewport. Displays the persistent room code, one-scan QR code, connected player/bot slots with live latency telemetry, game cartridge selector, and 60fps canvas rendering with Web Audio API synthesized sound effects.
  - **Second Screen (Phone GamePad)**: Connects via QR code or `/play?code=XXXX` and automatically reconfigures its touch and sensor interface whenever the Host launches a game or assigns a player role—eliminating static single-purpose controllers.
- **Target Audience / Persona**: Couch multiplayer groups, solo tinkerers testing against CPU bots, and players who want tactile Nintendo Land / Wii Sports Club style asymmetric gameplay without dedicated console hardware.
- **Key Value**: Bridges the gap between a blind "Wii Remote" motion stick and a true **Wii U GamePad** where private information, touch drawing, slingshot vectors, and gyro aiming create gameplay impossible on a single shared screen.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Console Lobby & Instant Pairing**:
   - Opening the Host screen immediately provisions a 4-letter Room Code (e.g., `K7M2`) and renders a scannable QR code that encodes the direct join URL (`?mode=controller&code=K7M2`).
   - Up to 4 players scan the QR code (or click **Open Twin-View Simulator** on desktop) to claim slots `P1`–`P4`. Empty slots can be toggled between **CPU Bot (Easy / Medium / Hard)** or **Open**.
   - As phones connect, they tap **Ready / Enable Sensors** (satisfying iOS `DeviceMotionEvent.requestPermission()` and acquiring `navigator.wakeLock` inside a single user gesture).
2. **Dynamic Controller Morphing**:
   - In the **Console Lobby**, Player 1's phone (or any player) can swipe through game cartridges and tap **Launch Game** directly from the phone GamePad or from the TV screen.
   - Launching **Phone Pong DX** morphs every active phone into the **Racket & Tactical Court Pad** (live ball-approach radar bar, gyro tilt crosshairs, acceleration swing meter, and precision touch-swipe pad).
   - Launching **Crypt of the Overlord** checks each player's role:
     - **Overlord Phone** morphs into the **Omniscient Architect Pad** (private fog-of-war blueprint showing hidden Explorer footsteps, draw-to-build wall runes, tap-to-arm spike traps, and pull-back slingshot for shadow orbs).
     - **Explorer Phones** morph into the **Delver Field Rig** (left-thumb 8-way virtual arcade stick, right-thumb Dash / Hack / Pulse action buttons, and live gyroscope tilt to sweep their flashlight cone across the dark TV dungeon).
3. **In-Game HUD & Post-Match Loop**:
   - Unobtrusive top console bar shows room code, player connection status, scores, and a **Switch Game / Lobby** control.
   - At match end, both the TV and Phone GamePads display match awards and a single-tap **Rematch** or **Swap Roles** button.

#### Visual Identity & Theme
- **Aesthetic Direction**: **Tactile Neo-Console Dark UI**—inspired by Nintendo Switch OS, Wii U GamePad hardware ergonomics, and Teenage Engineering telemetry precision.
- **Color Palette & Mood (60-30-10 Discipline)**:
  - **60% Dominant Arena & Console Canvas**: Deep Obsidian Navy (`#0B1020`) and Midnight Slate (`#0F172A`) for glare-free TV viewing and OLED battery efficiency on phones.
  - **30% Structural Hardware Surfaces**: Tactile Controller Matte (`#161F38`), subtle hairline borders (`rgba(255, 255, 255, 0.08)`), and primary crisp alabaster typography (`#F1F5F9`) with muted slate labels (`#94A3B8`).
  - **10% Player & Semantic Accents**:
    - `P1`: Electric Cyan (`#38BDF8`)
    - `P2`: Arcade Coral (`#FB7185`)
    - `P3`: Cyber Emerald (`#34D399`)
    - `P4`: Solar Amber (`#FBBF24`)
- **Typography & Hierarchy (2+1 Font System)**:
  - **Display / Game Titles & HUD Banners**: `Outfit` (600/700 weights, tight tracking, `text-wrap: balance`).
  - **UI Controls & Instructions**: `Plus Jakarta Sans` (400/600 weights, high legibility on small mobile viewports).
  - **Telemetry, Room Codes & Scores**: `JetBrains Mono` (`tabular-nums` for zero-jitter ping counters, countdowns, and scoreboards).
- **Ergonomic Mobile Touch Rules**:
  - Every interactive button on the Phone GamePad enforces a minimum `48px × 48px` hitbox (`touch-action: none`, `user-select: none`) to prevent accidental browser scrolling or zoom during frantic play.
  - Sticky status header on the phone is capped at `44px` (<10% of viewport height), reserving >90% of the mobile screen for active thumb and sensor controls.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Unified Single-Port Full-Stack Server (`Express + ws` on Port 3000)**
  - *Chosen Approach*: Consolidate HTTP, Vite middleware, QR SVG generation, and WebSocket upgrade handling onto a single Express + `ws` server on Port 3000, using URL/state routing (`/` for Console Host, `/?code=XXXX` or `/play` for Phone GamePad, plus an in-page **Dual-Screen Simulator** mode).
  - *Why*: Cloud Run and AI Studio expose Port 3000 over HTTPS automatically. Serving the Phone GamePad over the same HTTPS origin means **iOS and Android `DeviceMotionEvent` / `DeviceOrientationEvent` work out-of-the-box** without self-signed certificate warnings when accessed via the shared Cloud Run URL, while still supporting LAN IP detection when run locally.
- **Decision 2: High-Frequency Sensor Throttling + Event-Driven Authority**
  - *Chosen Approach*: Discrete actions (`swing`, `button:press`, `trap:place`, `wall:draw`, `slingshot:fire`) fire immediately with idempotent event IDs, while continuous sensor streams (`gyro:aim`, `joystick:move`) are quantized and throttled at `30Hz` (`~33ms`) with delta deadzones.
  - *Why*: Raw `deviceorientation` events fire at 60–120Hz and can flood mobile WebSockets. Throttling continuous vectors to 30Hz while sending discrete triggers immediately guarantees sub-20ms responsiveness with zero socket backpressure.
- **Decision 3: Retaining & Upgrading Your 240Hz Table Tennis Physics (`Phone Pong DX`)**
  - *Chosen Approach*: Preserve your deterministic 240Hz sub-stepped ball trajectory, net collision, Gaussian mishit noise, and sweet-spot timing math from `game.js`, and extend it with **Doubles (2v2) rotation / multi-paddle support**, **Shot Spin/Power Telemetry**, and a **Second-Screen Court Guide** on the phone.
  - *Why*: Your existing physics loop in `phone-pong` already feels authentic; augmenting it with second-screen visual timing feedback directly addresses the "hard to judge depth on a flat screen" problem.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   EXPRESS + WEBSOCKET SERVER (Port 3000)                     │
│  ┌──────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐  │
│  │ Room & Slot Manager  │  │ Game Mode & Role Router │  │ /api/qr & /info │  │
│  │ (4-Char Code + Token │  │ (Relays Host State &    │  │ (SVG QR Code &  │  │
│  │  Reconnect + 4 Slots)│  │  30Hz Controller Input) │  │  Join URL Gen)  │  │
│  └──────────┬───────────┘  └────────────┬────────────┘  └────────┬────────┘  │
└─────────────┼───────────────────────────┼────────────────────────┼───────────┘
              │ WebSocket (JSON Delta)    │ WebSocket (Input/View) │
      ┌───────▼───────────────────────────┴───────┐        ┌───────▼───────────┐
      │        MAIN SCREEN: TV CONSOLE HOST       │        │  BUILT-IN TWIN    │
      │  ┌─────────────────────────────────────┐  │        │  SIMULATOR DRAWER │
      │  │ Top Bar: Brand · Game Select · Room │  │        │  (Test Phone Pad  │
      │  └─────────────────┬───────────────────┘  │        │   Side-by-Side)   │
      │         ┌──────────┴──────────┐           │        └─────────┬─────────┘
      │         ▼                     ▼           │                  │
      │  ┌─────────────┐       ┌─────────────┐    │                  │
      │  │ Phone Pong  │       │ Crypt of the│    │                  │
      │  │ DX Engine   │       │ Overlord    │    │                  │
      │  │ (240Hz 3D   │       │ (Asymmetric │    │                  │
      │  │  Court +    │       │  Fog-of-War │    │                  │
      │  │  1-4P/Bots) │       │  Dungeon)   │    │                  │
      │  └─────────────┘       └─────────────┘    │                  │
      └───────────────────────────────────────────┘                  │
                                                                     │
      ┌──────────────────────────────────────────────────────────────▼─────────┐
      │              SECOND SCREEN: PHONE GAMEPAD (1–4 Devices)                │
      │  ┌──────────────────────────────────────────────────────────────────┐  │
      │  │ Hardware Abstraction Layer: Motion/Gyro + WakeLock + Haptic Buzz │  │
      │  └────────┬────────────────────┬───────────────────┬────────────────┘  │
      │           ▼                    ▼                   ▼                   │
      │  ┌────────────────┐   ┌─────────────────┐  ┌────────────────────────┐  │
      │  │ Mode A: Racket │   │ Mode B: Overlord│  │ Mode C: Delver Rig     │  │
      │  │ Swing + Tilt + │   │ Private Map +   │  │ Virtual 8-Way Stick +  │  │
      │  │ Timing Radar   │   │ Draw + Slingshot│  │ Gyro Aim + Action Pads │  │
      │  └────────────────┘   └─────────────────┘  └────────────────────────┘  │
      └────────────────────────────────────────────────────────────────────────┘
```

#### Data Model & State
- **Room Session (`RoomState`)**:
  - `code`: 4-letter uppercase room identifier (excluding ambiguous `I`/`O`).
  - `activeGame`: `'lobby' | 'pong' | 'dungeon'`.
  - `slots`: Array of 4 player slots (`slotIndex: 0..3`), each tracking `{ connected: boolean, token: string, name: string, color: string, role: 'p1' | 'p2' | 'overlord' | 'delver', botSkill: null | 'easy' | 'medium' | 'hard', latencyMs: number, ready: boolean }`.
- **Phone GamePad Input Payload (`ControllerInputEvent`)**:
  - `swing`: `{ power: 0..1, aim: -1..1, src: 'motion' | 'touch' }`
  - `stick`: `{ dx: -1..1, dy: -1..1, aimAngle: number }` (combines virtual thumbstick + gyro `gamma` tilt offset)
  - `action`: `{ button: 'A' | 'B' | 'X', state: 'down' | 'up' }`
  - `tactical`: `{ kind: 'trap' | 'wall' | 'slingshot', points: {x, y}[], vector: {vx, vy} }` (used by the Overlord's touch screen)
- **Second-Screen State Sync (`ControllerHudState`)**:
  - Lightweight 15Hz–20Hz state packet pushed from Host to Phone so the phone's private viewport stays in sync:
    - In **Phone Pong DX**: `{ phase, score, serving, ballX, ballY, sweetSpotProgress, rally }` so the phone renders a live incoming ball timing bar.
    - In **Crypt of the Overlord**: `{ mapGrid, crystals, traps, overlordPos, delverPositions, cooldowns, health }`—where the TV hides `overlordPos` and `traps` under fog-of-war, while the Overlord's phone renders the full secret tactical map.

#### Interactive Component & State Mapping
1. **Console Lobby & Slot Manager**:
   - Clicking any of the 4 Player Cards on the TV Host toggles CPU Bot difficulty (`Off` → `Easy` → `Medium` → `Hard`) or assigns asymmetric roles (`Overlord` vs `Delver`).
   - Clicking **Twin-View Phone Simulator** opens an interactive dockable phone controller right beside the TV canvas so a single user on a laptop can immediately test second-screen drawing, slingshot, and swing mechanics without needing a second physical device.
2. **Phone Pong DX (Game 1)**:
   - Supports **1v1**, **Solo vs CPU**, and **2v2 Doubles** (4 slots: P1+P3 on Left Court, P2+P4 on Right Court, alternating hits or zoned halves).
   - Phone displays a live **Timing Sweet-Spot Gauge** that fills as the ball crosses the net toward the player, giving tactile visual + haptic cues for when to swing or swipe.
3. **Crypt of the Overlord (Game 2)**:
   - **TV Main Screen**: Top-down atmospheric dungeon lit only by the Explorers' directional flashlight cones (steered by each Explorer's phone gyroscope/stick) and periodic crystal pulses. Explorers must activate 4 Arcane Beacons before the timer expires or before the Overlord captures them.
   - **Overlord Phone Screen**: Displays the full lit blueprint of the dungeon. The Overlord can:
     - **Draw Rune Walls**: Drag a finger across corridors on the phone map to erect temporary energy barriers on the TV screen.
     - **Arm Shadow Traps**: Tap floor tiles on the phone to place invisible snare runes that trigger if an Explorer walks over them without shining a flashlight first.
     - **Slingshot Spectral Orb**: Pull back and release anywhere on the phone screen to launch a bouncing dark-matter projectile across the dungeon.
   - **Explorer Phone Screen**: Features a responsive 8-way thumbstick on the left, **Tilt-to-Aim Flashlight** toggle (with touch-wheel fallback), and three tactile action buttons on the right: **Dash (A)**, **Channel Beacon / Revive (B)**, and **Sonar Flare (X)** (briefly reveals nearby hidden traps on both the TV and Explorer's mini-scanner).
