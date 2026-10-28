import React, { useEffect, useRef } from 'react';
import { createPongBot, createPongGame } from '../engine/pongEngine';
import {
  ControllerHudPayload,
  ControllerInputMessage,
  PLAYER_ACCENTS,
  PlayerSlot,
} from '../types/protocol';
import { sound } from '../utils/sound';

interface PongHostViewProps {
  players: Record<1 | 2 | 3 | 4, PlayerSlot>;
  splitScreen: boolean;
  doublesMode: boolean;
  onBroadcastHud: (payload: Omit<ControllerHudPayload, 'activeGame'>) => void;
  inputSubscribe: (handler: (msg: ControllerInputMessage) => void) => () => void;
  onScoreChange: (scores: [number, number], status: string) => void;
  resetSignal: number;
}

export const PongHostView: React.FC<PongHostViewProps> = ({
  players,
  splitScreen,
  doublesMode,
  onBroadcastHud,
  inputSubscribe,
  onScoreChange,
  resetSignal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef(createPongGame());
  const botsRef = useRef({
    1: createPongBot('medium'),
    2: createPongBot('medium'),
    3: createPongBot('medium'),
    4: createPongBot('medium'),
  });

  const aimsRef = useRef<Record<1 | 2 | 3 | 4, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const paddlePosRef = useRef<Record<1 | 2 | 3 | 4, { x: number; y: number }>>({
    1: { x: -0.25, y: 1.52 },
    2: { x: 0.25, y: -1.52 },
    3: { x: 0.25, y: 1.52 },
    4: { x: -0.25, y: -1.52 },
  });
  const swingsRef = useRef<
    Record<1 | 2 | 3 | 4, { time: number; power: number; aim: number; spin: number }>
  >({
    1: { time: -10, power: 0.5, aim: 0, spin: 0 },
    2: { time: -10, power: 0.5, aim: 0, spin: 0 },
    3: { time: -10, power: 0.5, aim: 0, spin: 0 },
    4: { time: -10, power: 0.5, aim: 0, spin: 0 },
  });

  useEffect(() => {
    gameRef.current.resetGame();
  }, [resetSignal]);

  // Subscribe to live Phone Controller inputs
  useEffect(() => {
    return inputSubscribe((msg) => {
      const slot = msg.slot;
      if (!slot || slot < 1 || slot > 4) return;
      const g = gameRef.current;

      if (msg.subType === 'aim') {
        aimsRef.current[slot] = Math.max(-1, Math.min(1, Number(msg.aim) || 0));
      } else if (msg.subType === 'swing') {
        const power = Math.max(0.05, Math.min(1, Number(msg.power) || 0.55));
        const aim =
          msg.aim !== undefined
            ? Math.max(-1, Math.min(1, Number(msg.aim)))
            : aimsRef.current[slot];
        const spin = Math.max(-1, Math.min(1, Number(msg.spin) || 0));

        swingsRef.current[slot] = {
          time: g.simTime,
          power,
          aim,
          spin,
        };

        const teamSide: 0 | 1 = slot === 1 || slot === 3 ? 0 : 1;
        const didHit = g.swing(teamSide, power, aim, spin, slot);
        if (didHit) {
          sound.playPaddleHit(power, Math.abs(spin) > 0.3);
        }
      }
    });
  }, [inputSubscribe]);

  // Keyboard shortcuts for desktop testing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (e.code === 'KeyA') aimsRef.current[1] = Math.max(-1, aimsRef.current[1] - 0.3);
      if (e.code === 'KeyD') aimsRef.current[1] = Math.min(1, aimsRef.current[1] + 0.3);
      if (e.code === 'KeyW' || e.code === 'Space') {
        swingsRef.current[1] = { time: g.simTime, power: 0.72, aim: aimsRef.current[1], spin: 0.2 };
        if (g.swing(0, 0.72, aimsRef.current[1], 0.2, 1)) {
          sound.playPaddleHit(0.72, false);
        }
      }
      if (e.code === 'ArrowLeft') aimsRef.current[2] = Math.max(-1, aimsRef.current[2] - 0.3);
      if (e.code === 'ArrowRight') aimsRef.current[2] = Math.min(1, aimsRef.current[2] + 0.3);
      if (e.code === 'ArrowUp' || e.code === 'Enter') {
        swingsRef.current[2] = { time: g.simTime, power: 0.72, aim: aimsRef.current[2], spin: -0.2 };
        if (g.swing(1, 0.72, aimsRef.current[2], -0.2, 2)) {
          sound.playPaddleHit(0.72, false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Main 60fps render & 240Hz physics loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastHudBroadcast = 0;
    let prevScore0 = -1;
    let prevScore1 = -1;
    let prevStatus = '';

    const renderScene = (
      ctx: CanvasRenderingContext2D,
      viewW: number,
      viewH: number,
      flip: boolean
    ) => {
      const g = gameRef.current;

      const bg = ctx.createRadialGradient(
        viewW * 0.5,
        viewH * 0.28,
        20,
        viewW * 0.5,
        viewH * 0.5,
        Math.max(viewW, viewH) * 0.8
      );
      bg.addColorStop(0, '#162238');
      bg.addColorStop(0.55, '#0F172A');
      bg.addColorStop(1, '#080D1A');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, viewW, viewH);

      // Subtle arena floor grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < viewW; gx += 48) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, viewH);
        ctx.stroke();
      }

      const scale = Math.min(viewW / 900, viewH / 680);
      const cx = viewW * 0.5;

      const nearY = viewH * 0.84;
      const farY = viewH * 0.17;
      const nearHW = 315 * scale;
      const farHW = 148 * scale;
      const perspPow = 0.76;

      const tablePt = (tx: number, ty: number, tz = 0) => {
        const rx = flip ? -tx : tx;
        const ry = flip ? -ty : ty;
        const rawT = (1.37 - ry) / 2.74;
        const t =
          rawT >= 0 && rawT <= 1
            ? Math.pow(rawT, perspPow)
            : rawT < 0
            ? rawT * perspPow
            : 1 + (rawT - 1) * perspPow;
        const hw = nearHW + (farHW - nearHW) * t;
        const sy = nearY + (farY - nearY) * t;
        const zScale = (220 - 95 * t) * scale;
        return {
          x: cx + (rx / 0.7625) * hw,
          y: sy - tz * zScale,
          s: (1 - 0.45 * t) * scale,
        };
      };

      const fl = tablePt(-0.7625, -1.37);
      const fr = tablePt(0.7625, -1.37);
      const nr = tablePt(0.7625, 1.37);
      const nl = tablePt(-0.7625, 1.37);

      // Floor drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.moveTo(fl.x - 10 * scale, fl.y + 18 * scale);
      ctx.lineTo(fr.x + 10 * scale, fr.y + 18 * scale);
      ctx.lineTo(nr.x + 22 * scale, nr.y + 34 * scale);
      ctx.lineTo(nl.x - 22 * scale, nl.y + 34 * scale);
      ctx.closePath();
      ctx.fill();

      // Table surface
      const tGrad = ctx.createLinearGradient(0, farY, 0, nearY);
      tGrad.addColorStop(0, '#113059');
      tGrad.addColorStop(0.5, '#174276');
      tGrad.addColorStop(1, '#1E5291');
      ctx.fillStyle = tGrad;
      ctx.beginPath();
      ctx.moveTo(fl.x, fl.y);
      ctx.lineTo(fr.x, fr.y);
      ctx.lineTo(nr.x, nr.y);
      ctx.lineTo(nl.x, nl.y);
      ctx.closePath();
      ctx.fill();

      // Table front apron
      const rimH = 12 * scale;
      ctx.fillStyle = '#0B1D36';
      ctx.beginPath();
      ctx.moveTo(nl.x, nl.y);
      ctx.lineTo(nr.x, nr.y);
      ctx.lineTo(nr.x, nr.y + rimH);
      ctx.lineTo(nl.x, nl.y + rimH);
      ctx.closePath();
      ctx.fill();

      // Boundary lines
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.88)';
      ctx.lineWidth = Math.max(1.8, 3 * scale);
      ctx.beginPath();
      ctx.moveTo(fl.x, fl.y);
      ctx.lineTo(fr.x, fr.y);
      ctx.lineTo(nr.x, nr.y);
      ctx.lineTo(nl.x, nl.y);
      ctx.closePath();
      ctx.stroke();

      // Center line
      const cf = tablePt(0, -1.37);
      const cn = tablePt(0, 1.37);
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.42)';
      ctx.lineWidth = Math.max(1, 1.8 * scale);
      ctx.beginPath();
      ctx.moveTo(cf.x, cf.y);
      ctx.lineTo(cn.x, cn.y);
      ctx.stroke();

      // Sweet-spot zone glow
      const b = g.ball;
      if (b.inPlay) {
        const hitterSide = b.vy > 0 ? 0 : 1;
        const canHit = b.lastHitter !== hitterSide && b.bouncesOnSide >= 1;
        if (canHit) {
          const y1 = hitterSide === 0 ? 0.55 : -0.55;
          const y2 = hitterSide === 0 ? 1.37 : -1.37;
          const zfl = tablePt(-0.7625, y1);
          const zfr = tablePt(0.7625, y1);
          const znr = tablePt(0.7625, y2);
          const znl = tablePt(-0.7625, y2);
          ctx.fillStyle =
            hitterSide === 0
              ? 'rgba(56, 189, 248, 0.14)'
              : 'rgba(251, 113, 133, 0.14)';
          ctx.beginPath();
          ctx.moveTo(zfl.x, zfl.y);
          ctx.lineTo(zfr.x, zfr.y);
          ctx.lineTo(znr.x, znr.y);
          ctx.lineTo(znl.x, znl.y);
          ctx.closePath();
          ctx.fill();
        }
      }

      const drawNet = () => {
        const nl0 = tablePt(-0.83, 0, 0);
        const nr0 = tablePt(0.83, 0, 0);
        const nl1 = tablePt(-0.83, 0, 0.1525);
        const nr1 = tablePt(0.83, 0, 0.1525);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.beginPath();
        ctx.moveTo(nl0.x, nl0.y);
        ctx.lineTo(nr0.x, nr0.y);
        ctx.lineTo(nr1.x, nr1.y);
        ctx.lineTo(nl1.x, nl1.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 22; i++) {
          const f = i / 22;
          ctx.beginPath();
          ctx.moveTo(nl0.x + (nr0.x - nl0.x) * f, nl0.y);
          ctx.lineTo(nl1.x + (nr1.x - nl1.x) * f, nl1.y);
          ctx.stroke();
        }

        ctx.strokeStyle = '#F8FAFC';
        ctx.lineWidth = Math.max(2, 3.5 * scale);
        ctx.beginPath();
        ctx.moveTo(nl1.x, nl1.y);
        ctx.lineTo(nr1.x, nr1.y);
        ctx.stroke();
      };

      const drawBall = () => {
        if (!b.inPlay && g.state !== 'gameover') return;
        const shadow = tablePt(b.x, b.y, 0);
        const pos = tablePt(b.x, b.y, Math.max(0, b.z));
        const r = Math.max(4.5, 11 * pos.s);

        if (b.trail.length > 1) {
          for (let i = 0; i < b.trail.length; i++) {
            const tp = tablePt(b.trail[i].x, b.trail[i].y, Math.max(0, b.trail[i].z));
            const alpha = ((i + 1) / b.trail.length) * 0.28;
            ctx.fillStyle =
              Math.abs(b.spin) > 0.35
                ? `rgba(251, 191, 36, ${alpha})`
                : `rgba(56, 189, 248, ${alpha})`;
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, r * ((i + 1) / b.trail.length) * 0.85, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (b.y >= -1.6 && b.y <= 1.6) {
          const sr = Math.max(2, r * Math.max(0.25, 1 - b.z * 0.9));
          ctx.fillStyle = 'rgba(0,0,0,0.42)';
          ctx.beginPath();
          ctx.ellipse(shadow.x, shadow.y, sr * 1.2, sr * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        const bgGrad = ctx.createRadialGradient(
          pos.x - r * 0.3,
          pos.y - r * 0.3,
          r * 0.1,
          pos.x,
          pos.y,
          r
        );
        bgGrad.addColorStop(0, '#FFFFFF');
        bgGrad.addColorStop(0.55, '#FDE68A');
        bgGrad.addColorStop(1, '#F59E0B');
        ctx.fillStyle = bgGrad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
      };

      const drawPaddleSlot = (slot: 1 | 2 | 3 | 4) => {
        if (!doublesMode && (slot === 3 || slot === 4)) return;
        const teamSide = slot === 1 || slot === 3 ? 0 : 1;
        const isNear = flip ? teamSide === 1 : teamSide === 0;
        const baseY = teamSide === 0 ? 1.48 : -1.48;
        const laneOffset = doublesMode
          ? slot === 1 || slot === 4
            ? -0.34
            : 0.34
          : 0;

        let targetX = aimsRef.current[slot] * 0.52 + laneOffset * 0.45;
        let targetY = baseY;

        if (b.inPlay) {
          const approaching =
            (teamSide === 0 && b.vy > 0) || (teamSide === 1 && b.vy < 0);
          if (approaching) {
            targetX = b.x * 0.75 + laneOffset * 0.25;
            if (
              (teamSide === 0 && b.y > 0.2) ||
              (teamSide === 1 && b.y < -0.2)
            ) {
              targetY = Math.max(
                teamSide === 0 ? 0.82 : -1.72,
                Math.min(teamSide === 0 ? 1.72 : -0.82, b.y)
              );
            }
          }
        }

        const sw = swingsRef.current[slot];
        const age = g.simTime - sw.time;
        let swingFwd = 0;
        let swingLift = 0;
        let swingRot = 0;
        if (age >= 0 && age < 0.34) {
          const p = age / 0.34;
          const curve = Math.sin(p * Math.PI);
          const pwr = 0.5 + 0.5 * sw.power;
          swingFwd = curve * 0.32 * pwr * (teamSide === 0 ? -1 : 1);
          swingLift = curve * 0.1 * pwr;
          swingRot = curve * (0.55 + sw.aim * 0.4) * (isNear ? -1 : 1);
        }

        const pos = paddlePosRef.current[slot];
        pos.x += (targetX - pos.x) * 0.22;
        pos.y += (targetY + swingFwd - pos.y) * 0.25;

        const pt = tablePt(pos.x, pos.y, 0.2 + swingLift);
        const ps = pt.s * (isNear ? 1.15 : 0.96);
        const accent = PLAYER_ACCENTS[slot].hex;

        // Aim guide ray on table when ball approaches
        if (isNear && Math.abs(aimsRef.current[slot]) > 0.04) {
          const start = tablePt(pos.x, teamSide === 0 ? 1.15 : -1.15, 0.01);
          const end = tablePt(
            aimsRef.current[slot] * 0.65,
            teamSide === 0 ? -0.95 : 0.95,
            0.01
          );
          ctx.save();
          ctx.strokeStyle = `${accent}66`;
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.translate(pt.x, pt.y);
        const sideTilt = (pos.x / 0.85) * 0.35 * (flip ? -1 : 1);
        ctx.rotate(sideTilt + swingRot);

        // Handle
        ctx.fillStyle = '#92400E';
        ctx.beginPath();
        ctx.roundRect(-5 * ps, 14 * ps, 10 * ps, 22 * ps, 3 * ps);
        ctx.fill();

        // Blade rim
        const rx = 25 * ps;
        const ry = 29 * ps;
        ctx.fillStyle = '#FDE68A';
        ctx.beginPath();
        ctx.ellipse(0, 0, rx + 2.5 * ps, ry + 2.5 * ps, 0, 0, Math.PI * 2);
        ctx.fill();

        // Blade rubber colored by player slot
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // Gloss highlight
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.ellipse(-rx * 0.25, -ry * 0.25, rx * 0.45, ry * 0.35, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Player Tag under paddle
        ctx.fillStyle = accent;
        ctx.font = `700 ${Math.max(10, Math.round(11 * ps))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`P${slot}`, pt.x, pt.y + 44 * ps);
      };

      const ballBehindNet = flip ? b.y > 0 : b.y < 0;
      const farSlots: (1 | 2 | 3 | 4)[] = flip ? [1, 3] : [2, 4];
      const nearSlots: (1 | 2 | 3 | 4)[] = flip ? [2, 4] : [1, 3];

      farSlots.forEach(drawPaddleSlot);
      if (ballBehindNet) {
        drawBall();
        drawNet();
      } else {
        drawNet();
        drawBall();
      }
      nearSlots.forEach(drawPaddleSlot);

      // Hit feedback floating popups
      const fb = g.lastHitFeedback;
      if (fb && g.simTime - fb.time < 0.75) {
        const age = g.simTime - fb.time;
        const fbY = fb.side === 0 ? 1.05 : -1.05;
        const pt = tablePt(0, fbY, 0.36 + age * 0.32);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age / 0.75);
        ctx.font = `800 ${Math.round(20 * scale)}px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle =
          fb.quality === 'PERFECT'
            ? '#34D399'
            : fb.quality === 'GOOD'
            ? '#38BDF8'
            : fb.quality === 'EARLY'
            ? '#FBBF24'
            : '#FB7185';
        ctx.fillText(fb.quality, pt.x, pt.y);
        ctx.restore();
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const g = gameRef.current;

      const prevBounces = g.ball.bouncesOnSide;
      g.step(dt);
      if (g.ball.inPlay && g.ball.bouncesOnSide > prevBounces) {
        sound.playTableBounce();
      }

      // Run CPU bots for any slot configured with a bot
      ([1, 2, 3, 4] as const).forEach((slot) => {
        if (!doublesMode && (slot === 3 || slot === 4)) return;
        const pSlot = players[slot];
        if (!pSlot.connected && pSlot.botDifficulty !== 'off') {
          const bot = botsRef.current[slot];
          bot.setDifficulty(pSlot.botDifficulty);
          const teamSide: 0 | 1 = slot === 1 || slot === 3 ? 0 : 1;
          const action = bot.update(dt, g, teamSide);
          if (action) {
            aimsRef.current[slot] = action.aim;
            swingsRef.current[slot] = {
              time: g.simTime,
              power: action.power,
              aim: action.aim,
              spin: action.spin,
            };
            if (g.swing(teamSide, action.power, action.aim, action.spin, slot)) {
              sound.playPaddleHit(action.power, Math.abs(action.spin) > 0.3);
            }
          }
        }
      });

      // Notify parent score changes
      const statusText = g.pointBanner ? g.pointBanner.text : g.status;
      if (
        g.scores[0] !== prevScore0 ||
        g.scores[1] !== prevScore1 ||
        statusText !== prevStatus
      ) {
        if (prevScore0 !== -1 && (g.scores[0] !== prevScore0 || g.scores[1] !== prevScore1)) {
          sound.playScorePoint();
        }
        prevScore0 = g.scores[0];
        prevScore1 = g.scores[1];
        prevStatus = statusText;
        onScoreChange([g.scores[0], g.scores[1]], statusText);
      }

      // Broadcast 20Hz live Sweet-Spot Radar telemetry to Phone Controllers
      if (now - lastHudBroadcast > 50) {
        lastHudBroadcast = now;
        const b = g.ball;
        const approachingSide: 0 | 1 | null = !b.inPlay
          ? null
          : b.vy > 0
          ? 0
          : 1;
        const normProgress =
          approachingSide === null
            ? 0
            : approachingSide === 0
            ? Math.max(0, Math.min(1, (b.y + 1.37) / 2.74))
            : Math.max(0, Math.min(1, (1.37 - b.y) / 2.74));

        onBroadcastHud({
          pong: {
            scores: [g.scores[0], g.scores[1]],
            servingSide: g.servingSide,
            ballApproachingSide: approachingSide,
            ballNormalizedProgress: Number(normProgress.toFixed(3)),
            ballX: Number((b.x / 0.7625).toFixed(2)),
            lastQuality: g.lastHitFeedback ? g.lastHitFeedback.quality : null,
            rallyCount: g.rallyCount,
            statusText,
          },
        });
      }

      // Render Canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        if (
          canvas.width !== Math.floor(rect.width * dpr) ||
          canvas.height !== Math.floor(rect.height * dpr)
        ) {
          canvas.width = Math.floor(rect.width * dpr);
          canvas.height = Math.floor(rect.height * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          if (splitScreen) {
            const halfW = rect.width / 2;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, halfW, rect.height);
            ctx.clip();
            renderScene(ctx, halfW, rect.height, false);
            ctx.restore();

            ctx.save();
            ctx.translate(halfW, 0);
            ctx.beginPath();
            ctx.rect(0, 0, halfW, rect.height);
            ctx.clip();
            renderScene(ctx, halfW, rect.height, true);
            ctx.restore();

            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(halfW, 0);
            ctx.lineTo(halfW, rect.height);
            ctx.stroke();
          } else {
            renderScene(ctx, rect.width, rect.height, false);
          }
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [players, splitScreen, doublesMode, onBroadcastHud, onScoreChange]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
