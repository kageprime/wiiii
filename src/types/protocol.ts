export type GameId = 'pong' | 'dungeon';

export type BotDifficulty = 'off' | 'easy' | 'medium' | 'hard';

export type PlayerRole = 'standard' | 'explorer' | 'overlord';

export interface PlayerSlot {
  slot: 1 | 2 | 3 | 4;
  connected: boolean;
  name: string;
  role: PlayerRole;
  botDifficulty: BotDifficulty;
  latencyMs: number;
  lastActivity: number;
}

export interface RoomStatePayload {
  roomCode: string;
  activeGame: GameId;
  players: Record<1 | 2 | 3 | 4, PlayerSlot>;
}

export interface PongHudPayload {
  scores: [number, number];
  servingSide: 0 | 1;
  ballApproachingSide: 0 | 1 | null;
  ballNormalizedProgress: number; // 0 (net) -> 1 (baseline sweet spot)
  ballX: number; // -1 to 1
  lastQuality: 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE' | null;
  rallyCount: number;
  statusText: string;
}

export interface DungeonBeaconInfo {
  id: number;
  x: number;
  y: number;
  progress: number; // 0 to 1
  completed: boolean;
}

export interface DungeonTrapInfo {
  id: number;
  x: number;
  y: number;
  triggered: boolean;
}

export interface DungeonWallInfo {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DungeonExplorerInfo {
  slot: 1 | 2 | 3 | 4;
  x: number;
  y: number;
  hp: number;
  flareCooldown: number;
  dashCooldown: number;
}

export interface DungeonHudPayload {
  overlordMana: number; // 0 to 100
  beaconsCompleted: number;
  totalBeacons: number;
  timerSeconds: number;
  beacons: DungeonBeaconInfo[];
  explorers: DungeonExplorerInfo[];
  traps: DungeonTrapInfo[];
  walls: DungeonWallInfo[];
  statusText: string;
}

export interface ControllerHudPayload {
  activeGame: GameId;
  pong?: PongHudPayload;
  dungeon?: DungeonHudPayload;
}

export type ControllerInputMessage =
  | {
      type: 'input';
      slot?: 1 | 2 | 3 | 4;
      subType: 'aim';
      aim: number; // -1 to 1
      tiltBeta?: number;
      tiltGamma?: number;
    }
  | {
      type: 'input';
      slot?: 1 | 2 | 3 | 4;
      subType: 'swing';
      power: number; // 0 to 1
      aim?: number;
      spin?: number; // -1 to 1
    }
  | {
      type: 'input';
      slot?: 1 | 2 | 3 | 4;
      subType: 'move';
      moveX: number; // -1 to 1
      moveY: number; // -1 to 1
      aimAngle?: number;
    }
  | {
      type: 'input';
      slot?: 1 | 2 | 3 | 4;
      subType: 'action';
      action: 'dash' | 'flare' | 'interact';
    }
  | {
      type: 'input';
      slot?: 1 | 2 | 3 | 4;
      subType: 'drawWall';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      type: 'input';
      slot?: 1 | 2 | 3 | 4;
      subType: 'placeTrap';
      x: number;
      y: number;
    }
  | {
      type: 'input';
      slot?: 1 | 2 | 3 | 4;
      subType: 'slingshot';
      x: number;
      y: number;
      vx: number;
      vy: number;
    }
  | {
      type: 'input';
      slot?: 1 | 2 | 3 | 4;
      subType: 'blackout';
    };

export const PLAYER_ACCENTS: Record<
  1 | 2 | 3 | 4,
  { name: string; hex: string; bg: string; border: string; text: string }
> = {
  1: {
    name: 'P1 Cyan',
    hex: '#38BDF8',
    bg: 'bg-sky-500/15',
    border: 'border-sky-400/40',
    text: 'text-sky-400',
  },
  2: {
    name: 'P2 Coral',
    hex: '#FB7185',
    bg: 'bg-rose-500/15',
    border: 'border-rose-400/40',
    text: 'text-rose-400',
  },
  3: {
    name: 'P3 Emerald',
    hex: '#34D399',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-400/40',
    text: 'text-emerald-400',
  },
  4: {
    name: 'P4 Amber',
    hex: '#FBBF24',
    bg: 'bg-amber-500/15',
    border: 'border-amber-400/40',
    text: 'text-amber-400',
  },
};
