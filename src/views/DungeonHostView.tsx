import React, { useEffect, useRef } from 'react';
import { createDungeonGame, DUNGEON_PILLARS } from '../engine/dungeonEngine';
import {
  ControllerHudPayload,
  ControllerInputMessage,
  PLAYER_ACCENTS,
  PlayerSlot,
} from '../types/protocol';
import { sound } from '../utils/sound';

interface DungeonHostViewProps {
  players: Record<1 | 2 | 3 | 4, PlayerSlot>;
  onBroadcastHud: (payload: Omit<ControllerHudPayload, 'activeGame'>) => void;
  inputSubscribe: (handler: (msg: ControllerInputMessage) => void) => () => void;
  onStatusChange: (
    beaconsDone: number,
    timer: number,
    status: string,
    winner: 'explorers' | 'overlord' | null
  ) => void;
  resetSignal: number;
}

export const DungeonHostView: React.FC<DungeonHostViewProps> = ({
  players,
  onBroadcastHud,
  inputSubscribe,
  onStatusChange,
  resetSignal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef(createDungeonGame());

  useEffect(() => {
    engineRef.current.resetGame(players);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Subscribe to Phone GamePad inputs for Explorers & Overlord
  useEffect(() => {
    return inputSubscribe((msg) => {
      const slot = msg.slot;
      if (!slot || slot < 1 || slot > 4) return;
      const eng = engineRef.current;

      if (msg.subType === 'move') {
        eng.applyExplorerInput(slot, msg.moveX, msg.moveY, msg.aimAngle);
      } else if (msg.subType === 'action') {
        if (msg.action === 'dash') {
          eng.triggerExplorerAction(slot, 'dash');
        } else if (msg.action === 'flare') {
          eng.triggerExplorerAction(slot, 'flare');
          sound.playFlarePing();
        } else if (msg.action === 'interact') {
          eng.setExplorerInteracting(slot, true);
        }
      } else if (msg.subType === 'drawWall') {
        if (eng.spawnWall(msg.x1, msg.y1, msg.x2, msg.y2)) {
          sound.playWallSummon();
        }
      } else if (msg.subType === 'placeTrap') {
        if (eng.spawnTrap(msg.x, msg.y)) {
          sound.playTrapArmed();
        }
      } else if (msg.subType === 'slingshot') {
        if (eng.spawnPhantomOrb(msg.x, msg.y, msg.vx, msg.vy)) {
          sound.playOrbLaunch();
        }
      } else if (msg.subType === 'blackout') {
        if (eng.triggerLightning()) {
          sound.playDamageAlert();
        }
      }
    });
  }, [inputSubscribe]);

  // Keyboard controls for testing Explorer P1 on Desktop
  useEffect(() => {
    const keys: Record<string, boolean> = {};
    const updateKeys = () => {
      const mx = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
      const my = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
      const angle = mx !== 0 || my !== 0 ? Math.atan2(my, mx) : undefined;
      engineRef.current.applyExplorerInput(1, mx, my, angle);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      updateKeys();
      if (e.code === 'Space') engineRef.current.triggerExplorerAction(1, 'dash');
      if (e.code === 'KeyF') {
        engineRef.current.triggerExplorerAction(1, 'flare');
        sound.playFlarePing();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
      updateKeys();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastHudBroadcast = 0;
    let prevCompleted = -1;
    let prevSecond = -1;
    let prevStatus = '';

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const eng = engineRef.current;
      eng.step(dt, players);
      const st = eng.state;

      const completed = st.beacons.filter((b) => b.completed).length;
      const sec = Math.ceil(st.timer);
      if (
        completed !== prevCompleted ||
        sec !== prevSecond ||
        st.statusText !== prevStatus
      ) {
        if (prevCompleted !== -1 && completed > prevCompleted) {
          sound.playBeaconComplete();
        }
        prevCompleted = completed;
        prevSecond = sec;
        prevStatus = st.statusText;
        onStatusChange(completed, sec, st.statusText, st.winner);
      }

      // Broadcast 20Hz live tactical radar & Overlord mana to Phone GamePads
      if (now - lastHudBroadcast > 55) {
        lastHudBroadcast = now;
        onBroadcastHud({
          dungeon: {
            overlordMana: Math.round(st.overlordMana),
            beaconsCompleted: completed,
            totalBeacons: st.beacons.length,
            timerSeconds: sec,
            beacons: st.beacons.map((b) => ({
              id: b.id,
              x: Number(b.x.toFixed(3)),
              y: Number(b.y.toFixed(3)),
              progress: Number(b.progress.toFixed(2)),
              completed: b.completed,
            })),
            explorers: st.explorers.map((ex) => ({
              slot: ex.slot,
              x: Number(ex.x.toFixed(3)),
              y: Number(ex.y.toFixed(3)),
              hp: ex.hp,
              flareCooldown: Number(ex.flareCooldown.toFixed(1)),
              dashCooldown: Number(ex.dashCooldown.toFixed(1)),
            })),
            traps: st.traps.map((t) => ({
              id: t.id,
              x: Number(t.x.toFixed(3)),
              y: Number(t.y.toFixed(3)),
              triggered: t.triggered,
            })),
            walls: st.walls.map((w) => ({
              id: w.id,
              x1: Number(w.x1.toFixed(3)),
              y1: Number(w.y1.toFixed(3)),
              x2: Number(w.x2.toFixed(3)),
              y2: Number(w.y2.toFixed(3)),
            })),
            statusText: st.statusText,
          },
        });
      }

      // Draw Shared TV Viewport (with Fog of War hiding unrevealed Overlord traps!)
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

          const W = rect.width;
          const H = rect.height;
          const pad = 28;
          const mapW = W - pad * 2;
          const mapH = H - pad * 2;
          const toX = (nx: number) => pad + nx * mapW;
          const toY = (ny: number) => pad + ny * mapH;

          // Deep stone floor background
          ctx.fillStyle = '#070B14';
          ctx.fillRect(0, 0, W, H);

          // Dungeon chamber border
          ctx.fillStyle = '#0C1324';
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(pad, pad, mapW, mapH, 16);
          ctx.fill();
          ctx.stroke();

          // Architectural stone tile grid
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
          ctx.lineWidth = 1;
          for (let i = 1; i < 16; i++) {
            const gx = pad + (mapW / 16) * i;
            ctx.beginPath();
            ctx.moveTo(gx, pad);
            ctx.lineTo(gx, pad + mapH);
            ctx.stroke();
          }
          for (let j = 1; j < 10; j++) {
            const gy = pad + (mapH / 10) * j;
            ctx.beginPath();
            ctx.moveTo(pad, gy);
            ctx.lineTo(pad + mapW, gy);
            ctx.stroke();
          }

          // Helper to check if a point is illuminated by any Explorer flashlight or Sonar Flare
          const isPointRevealed = (nx: number, ny: number): boolean => {
            if (st.lightningTimer > 0) return true;
            for (const ex of st.explorers) {
              if (ex.hp <= 0) continue;
              const dx = nx - ex.x;
              const dy = ny - ex.y;
              const dist = Math.hypot(dx, dy);
              if (ex.flareActiveTimer > 0 && dist < 0.28) return true;
              if (dist < 0.23) {
                const angleToPt = Math.atan2(dy, dx);
                let diff = angleToPt - ex.aimAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) < 0.56 || dist < 0.065) return true;
              }
            }
            return false;
          };

          // Draw Explorer Flashlight Cones & Sonar Flare rings
          for (const ex of st.explorers) {
            if (ex.hp <= 0) continue;
            const exX = toX(ex.x);
            const exY = toY(ex.y);
            const coneRadius = Math.min(mapW, mapH) * 0.25;
            const accent = PLAYER_ACCENTS[ex.slot].hex;

            ctx.save();
            const grad = ctx.createRadialGradient(exX, exY, 6, exX, exY, coneRadius);
            grad.addColorStop(0, `${accent}38`);
            grad.addColorStop(0.7, `${accent}14`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(exX, exY);
            ctx.arc(exX, exY, coneRadius, ex.aimAngle - 0.52, ex.aimAngle + 0.52);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            if (ex.flareActiveTimer > 0) {
              const flareR = Math.min(mapW, mapH) * 0.29;
              ctx.save();
              ctx.strokeStyle = `${accent}AA`;
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 6]);
              ctx.beginPath();
              ctx.arc(exX, exY, flareR, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }
          }

          // Stone Pillars
          for (const pil of DUNGEON_PILLARS) {
            const px = toX(pil.x);
            const py = toY(pil.y);
            const pw = pil.w * mapW;
            const ph = pil.h * mapH;
            ctx.fillStyle = '#1E293B';
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(px, py, pw, ph, 6);
            ctx.fill();
            ctx.stroke();
          }

          // Arcane Beacons (Objectives)
          for (const b of st.beacons) {
            const bx = toX(b.x);
            const by = toY(b.y);
            const r = 22;

            const glow = ctx.createRadialGradient(bx, by, 3, bx, by, r * 1.9);
            glow.addColorStop(
              0,
              b.completed ? 'rgba(52, 211, 153, 0.45)' : 'rgba(56, 189, 248, 0.28)'
            );
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(bx, by, r * 1.9, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = b.completed ? '#064E3B' : '#0F172A';
            ctx.strokeStyle = b.completed ? '#34D399' : '#38BDF8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(bx, by, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Progress ring
            if (!b.completed && b.progress > 0) {
              ctx.strokeStyle = '#34D399';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(
                bx,
                by,
                r + 5,
                -Math.PI / 2,
                -Math.PI / 2 + Math.PI * 2 * b.progress
              );
              ctx.stroke();
            }

            ctx.fillStyle = '#F8FAFC';
            ctx.font = '700 11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              b.completed ? 'SEALED' : `${Math.round(b.progress * 100)}%`,
              bx,
              by
            );
          }

          // Overlord Drawn Barrier Walls (Only visible when illuminated or recently summoned)
          for (const w of st.walls) {
            const midX = (w.x1 + w.x2) * 0.5;
            const midY = (w.y1 + w.y2) * 0.5;
            const visible = w.ttl > 6.3 || isPointRevealed(midX, midY);
            if (!visible) continue;

            ctx.save();
            ctx.strokeStyle = '#FB7185';
            ctx.shadowColor = '#FB7185';
            ctx.shadowBlur = 12;
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(toX(w.x1), toY(w.y1));
            ctx.lineTo(toX(w.x2), toY(w.y2));
            ctx.stroke();
            ctx.restore();
          }

          // Overlord Snare Traps (Hidden in fog of war unless revealed by Flashlight/Flare!)
          for (const t of st.traps) {
            const visible =
              t.triggered || t.revealedTimer > 0 || isPointRevealed(t.x, t.y);
            if (!visible) continue;
            const tx = toX(t.x);
            const ty = toY(t.y);
            ctx.save();
            ctx.strokeStyle = t.triggered ? '#FBBF24' : '#FB7185';
            ctx.fillStyle = t.triggered
              ? 'rgba(251, 191, 36, 0.28)'
              : 'rgba(251, 113, 133, 0.22)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(tx, ty, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }

          // Overlord Slingshot Spectral Orbs
          for (const orb of st.orbs) {
            const ox = toX(orb.x);
            const oy = toY(orb.y);
            ctx.save();
            const og = ctx.createRadialGradient(ox, oy, 2, ox, oy, 16);
            og.addColorStop(0, '#FFF1F2');
            og.addColorStop(0.5, '#FB7185');
            og.addColorStop(1, 'rgba(251, 113, 133, 0)');
            ctx.fillStyle = og;
            ctx.beginPath();
            ctx.arc(ox, oy, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Explorers
          for (const ex of st.explorers) {
            const exX = toX(ex.x);
            const exY = toY(ex.y);
            const accent = PLAYER_ACCENTS[ex.slot].hex;

            ctx.save();
            ctx.fillStyle = ex.hp > 0 ? accent : '#475569';
            ctx.strokeStyle = '#F8FAFC';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(exX, exY, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Aim pointer
            ctx.strokeStyle = '#F8FAFC';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(exX, exY);
            ctx.lineTo(
              exX + Math.cos(ex.aimAngle) * 19,
              exY + Math.sin(ex.aimAngle) * 19
            );
            ctx.stroke();

            // Slot badge & HP pips
            ctx.fillStyle = '#F8FAFC';
            ctx.font = '700 11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`P${ex.slot}`, exX, exY - 20);

            for (let h = 0; h < ex.maxHp; h++) {
              ctx.fillStyle = h < ex.hp ? '#34D399' : 'rgba(255,255,255,0.2)';
              ctx.fillRect(exX - 11 + h * 8, exY + 17, 6, 3.5);
            }
            ctx.restore();
          }

          // Lightning Reveal Flash overlay
          if (st.lightningTimer > 0) {
            ctx.fillStyle = `rgba(251, 113, 133, ${st.lightningTimer * 0.12})`;
            ctx.fillRect(0, 0, W, H);
          }

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [players, onBroadcastHud, onStatusChange]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
