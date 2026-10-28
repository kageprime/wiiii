import { PlayerSlot } from '../types/protocol';

export interface ExplorerEntity {
  slot: 1 | 2 | 3 | 4;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  hp: number;
  maxHp: number;
  dashTimer: number;
  dashCooldown: number;
  flareTimer: number;
  flareCooldown: number;
  flareActiveTimer: number;
  snareTimer: number;
  isInteracting: boolean;
}

export interface ArcaneBeacon {
  id: number;
  x: number;
  y: number;
  progress: number; // 0 to 1
  completed: boolean;
  label: string;
}

export interface DungeonWall {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ttl: number;
  maxTtl: number;
}

export interface DungeonTrap {
  id: number;
  x: number;
  y: number;
  triggered: boolean;
  ttl: number;
  revealedTimer: number;
}

export interface PhantomOrb {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  ttl: number;
}

export interface DungeonPillar {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DungeonGameState {
  status: 'playing' | 'explorers_win' | 'overlord_wins';
  statusText: string;
  timer: number;
  overlordMana: number;
  overlordSlot: 1 | 2 | 3 | 4;
  lightningTimer: number;
  explorers: ExplorerEntity[];
  beacons: ArcaneBeacon[];
  walls: DungeonWall[];
  traps: DungeonTrap[];
  orbs: PhantomOrb[];
  pillars: DungeonPillar[];
  winner: 'explorers' | 'overlord' | null;
}

export const DUNGEON_PILLARS: DungeonPillar[] = [
  { x: 0.26, y: 0.26, w: 0.08, h: 0.12 },
  { x: 0.66, y: 0.26, w: 0.08, h: 0.12 },
  { x: 0.26, y: 0.62, w: 0.08, h: 0.12 },
  { x: 0.66, y: 0.62, w: 0.08, h: 0.12 },
  { x: 0.45, y: 0.44, w: 0.1, h: 0.12 },
];

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

export function createDungeonGame() {
  let nextEntityId = 1;
  let botOverlordCooldown = 2.0;

  const state: DungeonGameState = {
    status: 'playing',
    statusText: 'Explorers: Charge all 4 Arcane Beacons! Overlord: Stop them from your tablet!',
    timer: 150,
    overlordMana: 80,
    overlordSlot: 4,
    lightningTimer: 0,
    explorers: [],
    beacons: [],
    walls: [],
    traps: [],
    orbs: [],
    pillars: DUNGEON_PILLARS,
    winner: null,
  };

  function resetGame(players?: Record<1 | 2 | 3 | 4, PlayerSlot>) {
    state.status = 'playing';
    state.winner = null;
    state.timer = 150;
    state.overlordMana = 85;
    state.lightningTimer = 0;
    state.walls = [];
    state.traps = [];
    state.orbs = [];

    // Determine which slot is Overlord (default to whoever chose 'overlord', else Slot 4 or Slot 2)
    let chosenOverlord: 1 | 2 | 3 | 4 = 4;
    if (players) {
      const explicit = ([1, 2, 3, 4] as const).find(
        (s) => players[s].role === 'overlord'
      );
      if (explicit) {
        chosenOverlord = explicit;
      } else if (players[2]?.connected && !players[4]?.connected) {
        chosenOverlord = 2;
      }
    }
    state.overlordSlot = chosenOverlord;

    const spawnPositions: Record<1 | 2 | 3 | 4, [number, number]> = {
      1: [0.12, 0.5],
      2: [0.88, 0.5],
      3: [0.5, 0.86],
      4: [0.5, 0.14],
    };

    state.explorers = ([1, 2, 3, 4] as const)
      .filter((s) => s !== state.overlordSlot)
      .map((s) => ({
        slot: s,
        x: spawnPositions[s][0],
        y: spawnPositions[s][1],
        vx: 0,
        vy: 0,
        aimAngle: s === 2 ? Math.PI : 0,
        hp: 3,
        maxHp: 3,
        dashTimer: 0,
        dashCooldown: 0,
        flareTimer: 0,
        flareCooldown: 0,
        flareActiveTimer: 0,
        snareTimer: 0,
        isInteracting: false,
      }));

    state.beacons = [
      { id: 1, x: 0.16, y: 0.18, progress: 0, completed: false, label: 'North-West Relic' },
      { id: 2, x: 0.84, y: 0.18, progress: 0, completed: false, label: 'North-East Relic' },
      { id: 3, x: 0.16, y: 0.82, progress: 0, completed: false, label: 'South-West Relic' },
      { id: 4, x: 0.84, y: 0.82, progress: 0, completed: false, label: 'South-East Relic' },
    ];

    // Seed 2 initial hidden traps near center corridors
    state.traps.push(
      { id: nextEntityId++, x: 0.42, y: 0.28, triggered: false, ttl: 40, revealedTimer: 0 },
      { id: nextEntityId++, x: 0.58, y: 0.72, triggered: false, ttl: 40, revealedTimer: 0 }
    );

    state.statusText = `P${state.overlordSlot} is the Crypt Overlord! Explorers: Activate all 4 Arcane Beacons!`;
  }

  function applyExplorerInput(
    slot: 1 | 2 | 3 | 4,
    moveX: number,
    moveY: number,
    aimAngle?: number
  ) {
    const ex = state.explorers.find((e) => e.slot === slot);
    if (!ex || ex.hp <= 0) return;
    const mag = Math.hypot(moveX, moveY);
    const norm = mag > 1 ? 1 / mag : 1;
    ex.vx = moveX * norm;
    ex.vy = moveY * norm;
    if (aimAngle !== undefined && !Number.isNaN(aimAngle)) {
      ex.aimAngle = aimAngle;
    } else if (mag > 0.15) {
      ex.aimAngle = Math.atan2(moveY, moveX);
    }
  }

  function triggerExplorerAction(
    slot: 1 | 2 | 3 | 4,
    action: 'dash' | 'flare' | 'interact'
  ) {
    const ex = state.explorers.find((e) => e.slot === slot);
    if (!ex || ex.hp <= 0) return;
    if (action === 'dash' && ex.dashCooldown <= 0) {
      ex.dashTimer = 0.24;
      ex.dashCooldown = 3.2;
      ex.snareTimer = 0; // Dash breaks snares
    } else if (action === 'flare' && ex.flareCooldown <= 0) {
      ex.flareActiveTimer = 4.5;
      ex.flareCooldown = 9.0;
      // Reveal nearby traps
      for (const trap of state.traps) {
        if (Math.hypot(trap.x - ex.x, trap.y - ex.y) < 0.28) {
          trap.revealedTimer = 5.0;
        }
      }
    } else if (action === 'interact') {
      ex.isInteracting = true;
    }
  }

  function setExplorerInteracting(slot: 1 | 2 | 3 | 4, active: boolean) {
    const ex = state.explorers.find((e) => e.slot === slot);
    if (ex) ex.isInteracting = active;
  }

  function spawnWall(x1: number, y1: number, x2: number, y2: number): boolean {
    if (state.status !== 'playing' || state.overlordMana < 22) return false;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.03) return false;
    const maxLen = 0.26;
    const scale = len > maxLen ? maxLen / len : 1;
    state.overlordMana = Math.max(0, state.overlordMana - 22);
    state.walls.push({
      id: nextEntityId++,
      x1: Math.max(0.04, Math.min(0.96, x1)),
      y1: Math.max(0.04, Math.min(0.96, y1)),
      x2: Math.max(0.04, Math.min(0.96, x1 + (x2 - x1) * scale)),
      y2: Math.max(0.04, Math.min(0.96, y1 + (y2 - y1) * scale)),
      ttl: 8.5,
      maxTtl: 8.5,
    });
    return true;
  }

  function spawnTrap(x: number, y: number): boolean {
    if (state.status !== 'playing' || state.overlordMana < 28) return false;
    state.overlordMana = Math.max(0, state.overlordMana - 28);
    state.traps.push({
      id: nextEntityId++,
      x: Math.max(0.05, Math.min(0.95, x)),
      y: Math.max(0.05, Math.min(0.95, y)),
      triggered: false,
      ttl: 28,
      revealedTimer: 0,
    });
    return true;
  }

  function spawnPhantomOrb(x: number, y: number, vx: number, vy: number): boolean {
    if (state.status !== 'playing' || state.overlordMana < 18) return false;
    const mag = Math.hypot(vx, vy);
    if (mag < 0.02) return false;
    state.overlordMana = Math.max(0, state.overlordMana - 18);
    const speed = 0.36;
    state.orbs.push({
      id: nextEntityId++,
      x: Math.max(0.04, Math.min(0.96, x)),
      y: Math.max(0.04, Math.min(0.96, y)),
      vx: (vx / mag) * speed,
      vy: (vy / mag) * speed,
      radius: 0.024,
      ttl: 4.2,
    });
    return true;
  }

  function triggerLightning(): boolean {
    if (state.status !== 'playing' || state.overlordMana < 45) return false;
    state.overlordMana = Math.max(0, state.overlordMana - 45);
    state.lightningTimer = 2.5;
    return true;
  }

  function stepBots(dt: number, players: Record<1 | 2 | 3 | 4, PlayerSlot>) {
    // Explorer CPU Bots
    for (const ex of state.explorers) {
      const slotInfo = players[ex.slot];
      if (!slotInfo || slotInfo.connected || slotInfo.botDifficulty === 'off') continue;
      if (ex.hp <= 0) continue;

      // Find nearest incomplete beacon
      let nearest: ArcaneBeacon | null = null;
      let bestDist = Infinity;
      for (const b of state.beacons) {
        if (b.completed) continue;
        const d = Math.hypot(b.x - ex.x, b.y - ex.y);
        if (d < bestDist) {
          bestDist = d;
          nearest = b;
        }
      }

      if (nearest) {
        if (bestDist > 0.045) {
          const dx = nearest.x - ex.x;
          const dy = nearest.y - ex.y;
          const angle = Math.atan2(dy, dx);
          ex.vx = Math.cos(angle) * 0.85;
          ex.vy = Math.sin(angle) * 0.85;
          ex.aimAngle = angle + Math.sin(state.timer * 3 + ex.slot) * 0.4;
          ex.isInteracting = false;
        } else {
          ex.vx = 0;
          ex.vy = 0;
          ex.isInteracting = true;
          ex.aimAngle += dt * 1.8;
        }
      }
    }

    // Overlord CPU Bot if Overlord slot is not connected to a human phone
    const overlordPlayer = players[state.overlordSlot];
    if (
      overlordPlayer &&
      !overlordPlayer.connected &&
      overlordPlayer.botDifficulty !== 'off'
    ) {
      botOverlordCooldown -= dt;
      if (botOverlordCooldown <= 0 && state.explorers.length > 0) {
        botOverlordCooldown =
          overlordPlayer.botDifficulty === 'hard'
            ? 2.2
            : overlordPlayer.botDifficulty === 'medium'
            ? 3.4
            : 4.8;
        const alive = state.explorers.filter((e) => e.hp > 0);
        if (alive.length > 0) {
          const target = alive[Math.floor(Math.random() * alive.length)];
          const roll = Math.random();
          if (roll < 0.42 && state.overlordMana >= 28) {
            spawnTrap(
              target.x + (Math.random() - 0.5) * 0.14,
              target.y + (Math.random() - 0.5) * 0.14
            );
          } else if (roll < 0.78 && state.overlordMana >= 18) {
            const ox = Math.max(0.08, Math.min(0.92, target.x + (Math.random() - 0.5) * 0.35));
            const oy = Math.max(0.08, Math.min(0.92, target.y + (Math.random() - 0.5) * 0.35));
            spawnPhantomOrb(ox, oy, target.x - ox, target.y - oy);
          } else if (state.overlordMana >= 22) {
            const wx = target.x + Math.cos(target.aimAngle) * 0.09;
            const wy = target.y + Math.sin(target.aimAngle) * 0.09;
            const perp = target.aimAngle + Math.PI / 2;
            spawnWall(
              wx - Math.cos(perp) * 0.08,
              wy - Math.sin(perp) * 0.08,
              wx + Math.cos(perp) * 0.08,
              wy + Math.sin(perp) * 0.08
            );
          }
        }
      }
    }
  }

  function step(dt: number, players?: Record<1 | 2 | 3 | 4, PlayerSlot>) {
    if (state.status !== 'playing') return;

    state.timer = Math.max(0, state.timer - dt);
    state.overlordMana = Math.min(100, state.overlordMana + dt * 9.5);
    if (state.lightningTimer > 0) state.lightningTimer = Math.max(0, state.lightningTimer - dt);

    if (players) {
      stepBots(dt, players);
    }

    // Update Walls
    state.walls = state.walls.filter((w) => {
      w.ttl -= dt;
      return w.ttl > 0;
    });

    // Update Traps
    state.traps = state.traps.filter((t) => {
      t.ttl -= dt;
      if (t.revealedTimer > 0) t.revealedTimer -= dt;
      return t.ttl > 0;
    });

    // Update Phantom Orbs
    state.orbs = state.orbs.filter((orb) => {
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.ttl -= dt;

      for (const ex of state.explorers) {
        if (ex.hp <= 0) continue;
        if (Math.hypot(ex.x - orb.x, ex.y - orb.y) < orb.radius + 0.024) {
          ex.hp = Math.max(0, ex.hp - 1);
          ex.snareTimer = 0.8;
          orb.ttl = 0;
        }
      }
      return (
        orb.ttl > 0 &&
        orb.x > 0.01 &&
        orb.x < 0.99 &&
        orb.y > 0.01 &&
        orb.y < 0.99
      );
    });

    // Update Explorers
    for (const ex of state.explorers) {
      if (ex.dashTimer > 0) ex.dashTimer = Math.max(0, ex.dashTimer - dt);
      if (ex.dashCooldown > 0) ex.dashCooldown = Math.max(0, ex.dashCooldown - dt);
      if (ex.flareActiveTimer > 0) ex.flareActiveTimer = Math.max(0, ex.flareActiveTimer - dt);
      if (ex.flareCooldown > 0) ex.flareCooldown = Math.max(0, ex.flareCooldown - dt);
      if (ex.snareTimer > 0) ex.snareTimer = Math.max(0, ex.snareTimer - dt);

      if (ex.hp <= 0) {
        // Auto-revive slowly when teammate stands near
        for (const ally of state.explorers) {
          if (ally.slot !== ex.slot && ally.hp > 0) {
            if (Math.hypot(ally.x - ex.x, ally.y - ex.y) < 0.06) {
              ex.hp = 2;
            }
          }
        }
        continue;
      }

      const baseSpeed = ex.snareTimer > 0 ? 0.06 : ex.dashTimer > 0 ? 0.42 : 0.19;
      let nextX = Math.max(0.04, Math.min(0.96, ex.x + ex.vx * baseSpeed * dt));
      let nextY = Math.max(0.04, Math.min(0.96, ex.y + ex.vy * baseSpeed * dt));

      // Collide with Dungeon Pillars
      for (const pil of state.pillars) {
        if (
          nextX > pil.x - 0.02 &&
          nextX < pil.x + pil.w + 0.02 &&
          nextY > pil.y - 0.02 &&
          nextY < pil.y + pil.h + 0.02
        ) {
          nextX = ex.x;
          nextY = ex.y;
        }
      }

      // Collide with Overlord Barrier Walls
      for (const w of state.walls) {
        if (distToSegment(nextX, nextY, w.x1, w.y1, w.x2, w.y2) < 0.026) {
          nextX = ex.x;
          nextY = ex.y;
        }
      }

      ex.x = nextX;
      ex.y = nextY;

      // Check Trap triggers
      for (const trap of state.traps) {
        if (!trap.triggered && Math.hypot(ex.x - trap.x, ex.y - trap.y) < 0.038) {
          trap.triggered = true;
          trap.ttl = 2.0;
          trap.revealedTimer = 2.0;
          ex.snareTimer = 2.4;
          ex.hp = Math.max(0, ex.hp - 1);
        }
      }

      // Charge nearby Arcane Beacons automatically or faster when holding Interact
      for (const beacon of state.beacons) {
        if (beacon.completed) continue;
        if (Math.hypot(ex.x - beacon.x, ex.y - beacon.y) < 0.075) {
          const rate = ex.isInteracting ? 0.26 : 0.14;
          beacon.progress = Math.min(1, beacon.progress + rate * dt);
          if (beacon.progress >= 1) {
            beacon.completed = true;
          }
        }
      }
    }

    // Check Win / Loss conditions
    const completedCount = state.beacons.filter((b) => b.completed).length;
    if (completedCount === state.beacons.length) {
      state.status = 'explorers_win';
      state.winner = 'explorers';
      state.statusText = 'All 4 Arcane Beacons Activated — Explorers Conquer the Crypt!';
      return;
    }

    const anyAlive = state.explorers.some((e) => e.hp > 0);
    if (!anyAlive || state.timer <= 0) {
      state.status = 'overlord_wins';
      state.winner = 'overlord';
      state.statusText =
        state.timer <= 0
          ? `Time Expired — Overlord (P${state.overlordSlot}) Claims the Crypt!`
          : `All Explorers Fallen — Overlord (P${state.overlordSlot}) Reigns Supreme!`;
    }
  }

  resetGame();

  return {
    state,
    resetGame,
    applyExplorerInput,
    triggerExplorerAction,
    setExplorerInteracting,
    spawnWall,
    spawnTrap,
    spawnPhantomOrb,
    triggerLightning,
    step,
  };
}
