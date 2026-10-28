import { BotDifficulty } from '../types/protocol';

export const PONG_CFG = {
  TABLE_L: 2.74,
  TABLE_W: 1.525,
  HALF_L: 1.37,
  HALF_W: 0.7625,
  NET_H: 0.1525,
  BALL_R: 0.02,
  GRAVITY: 9.8,
  RESTITUTION: 0.85,
  HIT_ZONE_MIN: 0.35,
  HIT_ZONE_MAX: 1.95,
  SWEET_Y: 1.15,
  SWEET_HALF: 0.45,
  BASE_VY: 4.5,
  POWER_VY: 2.0,
  BASE_VZ: 2.2,
  POWER_VZ: 0.4,
  AIM_SPREAD: 0.52,
  WIN_SCORE: 11,
  SERVE_SWAP: 2,
  STEP: 1 / 240,
};

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface PongTrailPoint {
  x: number;
  y: number;
  z: number;
}

export interface PongHitFeedback {
  side: 0 | 1;
  slot: 1 | 2 | 3 | 4;
  quality: 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE';
  time: number;
}

export interface PongPointBanner {
  text: string;
  scorer: 0 | 1;
  time: number;
}

export interface PongGameInstance {
  state: 'waiting' | 'serving' | 'playing' | 'point' | 'gameover';
  scores: [number, number];
  servingSide: 0 | 1;
  status: string;
  winner: 0 | 1 | null;
  simTime: number;
  rallyCount: number;
  lastHitFeedback: PongHitFeedback | null;
  pointBanner: PongPointBanner | null;
  ball: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    spin: number;
    inPlay: boolean;
    lastHitter: 0 | 1 | null;
    bouncesOnSide: number;
    trail: PongTrailPoint[];
  };
  resetGame: () => void;
  swing: (
    side: 0 | 1,
    power: number,
    aim?: number,
    spin?: number,
    slot?: 1 | 2 | 3 | 4
  ) => boolean;
  step: (dt: number) => void;
}

export function createPongGame(): PongGameInstance {
  let trailTick = 0;

  const g: PongGameInstance = {
    state: 'serving',
    scores: [0, 0],
    servingSide: 0,
    status: 'Team 1 (P1/P3) to serve — swing phone or press Space!',
    winner: null,
    simTime: 0,
    rallyCount: 0,
    lastHitFeedback: null,
    pointBanner: null,
    ball: {
      x: 0,
      y: 1.2,
      z: 0.25,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      inPlay: false,
      lastHitter: null,
      bouncesOnSide: 0,
      trail: [],
    },
    resetGame,
    swing,
    step,
  };

  function placeBallForServe() {
    const dir = g.servingSide === 0 ? 1 : -1;
    g.ball.x = 0;
    g.ball.y = dir * 1.2;
    g.ball.z = 0.25;
    g.ball.vx = 0;
    g.ball.vy = 0;
    g.ball.vz = 0;
    g.ball.spin = 0;
    g.ball.inPlay = false;
    g.ball.lastHitter = null;
    g.ball.bouncesOnSide = 0;
    g.ball.trail = [];
    g.rallyCount = 0;
  }

  function resetGame() {
    g.scores = [0, 0];
    g.servingSide = 0;
    g.winner = null;
    g.state = 'serving';
    g.pointBanner = null;
    g.lastHitFeedback = null;
    g.status = 'Team 1 to serve — swing!',
    placeBallForServe();
  }

  function nextServer(): 0 | 1 {
    const total = g.scores[0] + g.scores[1];
    if (g.scores[0] >= 10 && g.scores[1] >= 10) {
      return (total % 2) as 0 | 1;
    }
    return (Math.floor(total / PONG_CFG.SERVE_SWAP) % 2) as 0 | 1;
  }

  function awardPoint(winnerSide: 0 | 1, reason: string) {
    if (g.state !== 'playing') return;
    g.scores[winnerSide]++;
    g.ball.inPlay = false;

    const s0 = g.scores[0];
    const s1 = g.scores[1];
    const lead = Math.abs(s0 - s1);
    const teamLabel = winnerSide === 0 ? 'Team Blue' : 'Team Coral';

    if ((s0 >= PONG_CFG.WIN_SCORE || s1 >= PONG_CFG.WIN_SCORE) && lead >= 2) {
      g.winner = winnerSide;
      g.state = 'gameover';
      g.status = `${teamLabel} wins ${s0}–${s1}! (${reason})`;
      g.pointBanner = { text: `${teamLabel} Wins!`, scorer: winnerSide, time: g.simTime };
      return;
    }

    g.servingSide = nextServer();
    g.state = 'serving';
    const nextLabel = g.servingSide === 0 ? 'Team Blue' : 'Team Coral';
    g.status = `Point ${teamLabel} (${reason}) • ${nextLabel} to serve`;
    g.pointBanner = {
      text: `Point ${teamLabel}! (${reason})`,
      scorer: winnerSide,
      time: g.simTime,
    };
    placeBallForServe();
  }

  function launchShot(
    side: 0 | 1,
    power: number,
    aim: number,
    timingQuality: number,
    spin = 0
  ) {
    const b = g.ball;
    const toOpponent = side === 0 ? -1 : 1;
    const p = Math.max(0.1, Math.min(1, power));
    const clampedAim = Math.max(-1, Math.min(1, aim || 0));
    const clampedSpin = Math.max(-1, Math.min(1, spin || 0));

    const errScale = 1 - 0.85 * Math.max(0, timingQuality);
    const vyNoise = randn() * 0.28 * errScale;
    const vxNoise = randn() * 0.22 * errScale;

    const targetX = clampedAim * PONG_CFG.HALF_W * 0.78 + vxNoise;
    const targetY =
      toOpponent * (0.65 + p * 0.55) + toOpponent * vyNoise * 0.18;

    const vyMag = PONG_CFG.BASE_VY + p * PONG_CFG.POWER_VY;
    b.vy = toOpponent * vyMag;

    const dy = targetY - b.y;
    const flightT = Math.max(0.18, Math.abs(dy / b.vy));

    b.vx = (targetX - b.x) / flightT;
    b.spin = clampedSpin;

    const zStart = Math.max(0.08, b.z);
    b.z = zStart;
    b.vz = 0.5 * PONG_CFG.GRAVITY * flightT - zStart / flightT;

    const zMid = zStart + b.vz * (flightT * 0.5) - 0.5 * PONG_CFG.GRAVITY * Math.pow(flightT * 0.5, 2);
    if (zMid < PONG_CFG.NET_H + 0.06) {
      b.vz += (PONG_CFG.NET_H + 0.08 - zMid) / (flightT * 0.5);
    }

    b.inPlay = true;
    b.lastHitter = side;
    b.bouncesOnSide = 0;
    g.rallyCount++;
  }

  function swing(
    side: 0 | 1,
    power: number,
    aim = 0,
    spin = 0,
    slot?: 1 | 2 | 3 | 4
  ): boolean {
    const activeSlot: 1 | 2 | 3 | 4 = slot || (side === 0 ? 1 : 2);
    if (g.state === 'gameover') {
      resetGame();
      return false;
    }

    if (g.state === 'serving') {
      if (side !== g.servingSide) return false;
      g.state = 'playing';
      g.status = 'Rally in play!';
      launchShot(side, power, aim, 1.0, spin);
      g.lastHitFeedback = {
        side,
        slot: activeSlot,
        quality: 'GOOD',
        time: g.simTime,
      };
      return true;
    }

    if (g.state === 'playing') {
      const b = g.ball;
      const onMySide = side === 0 ? b.y > 0 : b.y < 0;
      const movingTowardMe = side === 0 ? b.vy > 0 : b.vy < 0;
      const distY = Math.abs(b.y);

      if (
        onMySide &&
        movingTowardMe &&
        b.bouncesOnSide >= 1 &&
        distY >= PONG_CFG.HIT_ZONE_MIN &&
        distY <= PONG_CFG.HIT_ZONE_MAX
      ) {
        const offset = distY - PONG_CFG.SWEET_Y;
        const normErr = Math.min(1, Math.abs(offset) / PONG_CFG.SWEET_HALF);
        const timingQuality = 1 - normErr;

        let label: 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE' = 'GOOD';
        if (normErr < 0.26) label = 'PERFECT';
        else if ( normErr < 0.62) label = 'GOOD';
        else label = offset < 0 ? 'EARLY' : 'LATE';

        g.lastHitFeedback = {
          side,
          slot: activeSlot,
          quality: label,
          time: g.simTime,
        };
        launchShot(side, power, aim, timingQuality, spin);
        return true;
      }
    }
    return false;
  }

  function stepOne(dt: number) {
    g.simTime += dt;
    if (g.state !== 'playing' || !g.ball.inPlay) return;

    const b = g.ball;
    const prevY = b.y;
    const prevZ = b.z;

    // Magnus curve spin acceleration on X
    b.vx += b.spin * 1.65 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vz -= PONG_CFG.GRAVITY * dt;
    b.z += b.vz * dt;

    trailTick++;
    if (trailTick % 4 === 0) {
      b.trail.push({ x: b.x, y: b.y, z: b.z });
      if (b.trail.length > 26) b.trail.shift();
    }

    // Net crossing check
    if ((prevY > 0 && b.y <= 0) || (prevY < 0 && b.y >= 0)) {
      if (b.z < PONG_CFG.NET_H) {
        const winner: 0 | 1 = b.lastHitter === 0 ? 1 : 0;
        awardPoint(winner, 'Net');
        return;
      }
      b.bouncesOnSide = 0;
    }

    // Table bounce check
    if (b.z <= PONG_CFG.BALL_R && prevZ > PONG_CFG.BALL_R && b.vz < 0) {
      const onTableX = Math.abs(b.x) <= PONG_CFG.HALF_W + PONG_CFG.BALL_R;
      const onTableY = Math.abs(b.y) <= PONG_CFG.HALF_L + PONG_CFG.BALL_R;

      if (onTableX && onTableY) {
        const bounceSide: 0 | 1 = b.y > 0 ? 0 : 1;
        if (bounceSide === b.lastHitter) {
          awardPoint(bounceSide === 0 ? 1 : 0, 'Short bounce');
          return;
        }
        b.z = PONG_CFG.BALL_R;
        b.vz = -b.vz * PONG_CFG.RESTITUTION;
        b.vx += b.spin * 0.45;
        b.bouncesOnSide++;

        if (b.bouncesOnSide >= 2) {
          awardPoint(b.lastHitter as 0 | 1, 'Double bounce');
          return;
        }
      }
    }

    // Floor or past baseline check
    if (b.z < -0.35 || Math.abs(b.y) > PONG_CFG.HALF_L + 0.85) {
      if (b.bouncesOnSide === 0) {
        const winner: 0 | 1 = b.lastHitter === 0 ? 1 : 0;
        awardPoint(winner, 'Out');
      } else {
        awardPoint(b.lastHitter as 0 | 1, 'Winner');
      }
    }
  }

  function step(dt: number) {
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-6) {
      const h = Math.min(PONG_CFG.STEP, remaining);
      stepOne(h);
      remaining -= h;
    }
  }

  placeBallForServe();
  return g;
}

export const BOT_PRESETS: Record<
  Exclude<BotDifficulty, 'off'>,
  {
    name: string;
    targetBias: number;
    timingJitter: number;
    aimSpread: number;
    powerMin: number;
    powerMax: number;
    missChance: number;
    serveDelay: number;
  }
> = {
  easy: {
    name: 'Easy Bot',
    targetBias: -0.15,
    timingJitter: 0.25,
    aimSpread: 0.35,
    powerMin: 0.3,
    powerMax: 0.55,
    missChance: 0.16,
    serveDelay: 1.0,
  },
  medium: {
    name: 'Medium Bot',
    targetBias: 0.0,
    timingJitter: 0.12,
    aimSpread: 0.65,
    powerMin: 0.48,
    powerMax: 0.78,
    missChance: 0.05,
    serveDelay: 0.75,
  },
  hard: {
    name: 'Hard Bot',
    targetBias: 0.02,
    timingJitter: 0.04,
    aimSpread: 0.9,
    powerMin: 0.65,
    powerMax: 0.96,
    missChance: 0.01,
    serveDelay: 0.55,
  },
};

export function createPongBot(initialDifficulty: Exclude<BotDifficulty, 'off'> = 'medium') {
  let difficulty = initialDifficulty;
  let serveTimer = 0;
  let plannedHitDist: number | null = null;
  let plannedWillMiss = false;
  let currentAim = 0;

  function setDifficulty(d: Exclude<BotDifficulty, 'off'>) {
    if (BOT_PRESETS[d]) difficulty = d;
  }

  function update(
    dt: number,
    game: PongGameInstance,
    side: 0 | 1
  ): { power: number; aim: number; spin: number } | null {
    const p = BOT_PRESETS[difficulty];

    if (game.state === 'serving' && game.servingSide === side) {
      serveTimer += dt;
      if (serveTimer >= p.serveDelay) {
        serveTimer = 0;
        const aim = (Math.random() * 2 - 1) * p.aimSpread * 0.6;
        const power = p.powerMin + Math.random() * (p.powerMax - p.powerMin);
        currentAim = aim;
        return { power, aim, spin: (Math.random() - 0.5) * 0.5 };
      }
      return null;
    }
    serveTimer = 0;

    if (game.state !== 'playing') {
      plannedHitDist = null;
      return null;
    }

    const b = game.ball;
    const onMySide = side === 0 ? b.y > 0 : b.y < 0;
    const movingTowardMe = side === 0 ? b.vy > 0 : b.vy < 0;

    if (!onMySide || !movingTowardMe || b.bouncesOnSide < 1) {
      plannedHitDist = null;
      return null;
    }

    if (plannedHitDist === null) {
      plannedWillMiss = Math.random() < p.missChance;
      const jitter = (Math.random() * 2 - 1) * p.timingJitter;
      plannedHitDist = Math.max(
        PONG_CFG.HIT_ZONE_MIN + 0.05,
        Math.min(
          PONG_CFG.HIT_ZONE_MAX - 0.05,
          PONG_CFG.SWEET_Y + p.targetBias + jitter
        )
      );
      currentAim = (Math.random() * 2 - 1) * p.aimSpread;
    }

    const distY = Math.abs(b.y);
    if (!plannedWillMiss && distY >= plannedHitDist) {
      const power = p.powerMin + Math.random() * (p.powerMax - p.powerMin);
      const aim = currentAim;
      const spin = (Math.random() - 0.5) * 0.7;
      plannedHitDist = null;
      return { power, aim, spin };
    }

    return null;
  }

  return {
    setDifficulty,
    update,
    get aim() {
      return currentAim;
    },
  };
}
