import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Flame,
  Radar,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';
import { DUNGEON_PILLARS } from '../engine/dungeonEngine';
import {
  ControllerHudPayload,
  ControllerInputMessage,
  GameId,
  PLAYER_ACCENTS,
  PlayerRole,
} from '../types/protocol';

interface PhoneControllerViewProps {
  slot: 1 | 2 | 3 | 4;
  role: PlayerRole;
  activeGame: GameId;
  hud: ControllerHudPayload | null;
  connected: boolean;
  isEmbeddedSimulator?: boolean;
  onSendInput: (msg: ControllerInputMessage) => void;
  onCycleRole?: () => void;
}

export const PhoneControllerView: React.FC<PhoneControllerViewProps> = ({
  slot,
  role,
  activeGame,
  hud,
  connected,
  isEmbeddedSimulator = false,
  onSendInput,
  onCycleRole,
}) => {
  const accent = PLAYER_ACCENTS[slot];
  const [motionGranted, setMotionGranted] = useState(false);
  const [aimValue, setAimValue] = useState(0);
  const [spinMode, setSpinMode] = useState<-1 | 0 | 1>(0);
  const [overlordTool, setOverlordTool] = useState<'wall' | 'trap' | 'orb'>('wall');
  const [swingFlash, setSwingFlash] = useState<string | null>(null);

  const zeroBetaRef = useRef<number | null>(null);
  const zeroGammaRef = useRef<number | null>(null);
  const blueprintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const stickCenterRef = useRef<{ x: number; y: number } | null>(null);
  const [stickOffset, setStickOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const vibrate = (ms: number | number[]) => {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
      // Ignore on unsupported browsers
    }
  };

  // DeviceMotion + DeviceOrientation sensor pipeline (ported & upgraded from user's phone-pong)
  const enableDeviceSensors = async () => {
    try {
      const dm = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof dm?.requestPermission === 'function') {
        const res = await dm.requestPermission();
        if (res !== 'granted') return;
      }
      const doEvt = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof doEvt?.requestPermission === 'function') {
        await doEvt.requestPermission().catch(() => {});
      }
      setMotionGranted(true);
      vibrate(35);
    } catch {
      setMotionGranted(true);
    }
  };

  useEffect(() => {
    if (!motionGranted) return;

    let swinging = false;
    let peakAcc = 0;
    let swingStart = 0;
    let lastSwingAt = 0;

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      if (zeroGammaRef.current === null) {
        zeroGammaRef.current = e.gamma;
        zeroBetaRef.current = e.beta;
      }
      const dGamma = e.gamma - (zeroGammaRef.current || 0);
      const normAim = Math.max(-1, Math.min(1, dGamma / 35));
      setAimValue(normAim);

      if (activeGame === 'pong') {
        onSendInput({ type: 'input', subType: 'aim', slot, aim: normAim });
      }
    };

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration || e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      const now = performance.now();
      if (now - lastSwingAt < 420) return;

      if (!swinging && mag > 14) {
        swinging = true;
        peakAcc = mag;
        swingStart = now;
      } else if (swinging) {
        if (mag > peakAcc) peakAcc = mag;
        if (now - swingStart > 125 || mag < 14 * 0.65) {
          const power = Math.min(1, Math.max(0.2, (peakAcc - 14) / (45 - 14)));
          swinging = false;
          lastSwingAt = now;
          if (activeGame === 'pong') {
            onSendInput({
              type: 'input',
              subType: 'swing',
              slot,
              power,
              aim: aimValue,
              spin: spinMode * 0.65,
            });
            setSwingFlash(`${Math.round(power * 100)}% SWING`);
            vibrate(40);
            setTimeout(() => setSwingFlash(null), 500);
          }
        }
      }
    };

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
    };
  }, [motionGranted, activeGame, slot, aimValue, spinMode, onSendInput]);

  // Render Overlord Private Blueprint Viewport (shows ALL hidden traps, walls, beacons, and explorer positions)
  useEffect(() => {
    if (activeGame !== 'dungeon' || role !== 'overlord') return;
    const canvas = blueprintCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = '#090D1A';
    ctx.fillRect(0, 0, W, H);

    // Tactical blueprint grid
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo((W / 12) * i, 0);
      ctx.lineTo((W / 12) * i, H);
      ctx.stroke();
    }
    for (let j = 1; j < 8; j++) {
      ctx.beginPath();
      ctx.moveTo(0, (H / 8) * j);
      ctx.lineTo(W, (H / 8) * j);
      ctx.stroke();
    }

    // Pillars
    for (const p of DUNGEON_PILLARS) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.24)';
      ctx.fillRect(p.x * W, p.y * H, p.w * W, p.h * H);
    }

    const dHud = hud?.dungeon;
    if (dHud) {
      // Beacons
      for (const b of dHud.beacons) {
        ctx.strokeStyle = b.completed ? '#34D399' : '#38BDF8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x * W, b.y * H, 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Active Barrier Walls
      for (const w of dHud.walls) {
        ctx.strokeStyle = '#FB7185';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(w.x1 * W, w.y1 * H);
        ctx.lineTo(w.x2 * W, w.y2 * H);
        ctx.stroke();
      }

      // Hidden Snare Traps
      for (const t of dHud.traps) {
        ctx.fillStyle = t.triggered ? '#FBBF24' : '#FB7185';
        ctx.beginPath();
        ctx.arc(t.x * W, t.y * H, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Live Explorer Radar Blips
      for (const ex of dHud.explorers) {
        const exAccent = PLAYER_ACCENTS[ex.slot as 1 | 2 | 3 | 4]?.hex || '#38BDF8';
        ctx.fillStyle = exAccent;
        ctx.beginPath();
        ctx.arc(ex.x * W, ex.y * H, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`P${ex.slot}`, ex.x * W, ex.y * H - 11);
      }
    }

    // Live finger drag preview for Wall / Orb slingshot
    if (dragStartRef.current && dragCurrentRef.current) {
      ctx.strokeStyle = overlordTool === 'wall' ? '#FB7185' : '#FBBF24';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(dragStartRef.current.x * W, dragStartRef.current.y * H);
      ctx.lineTo(dragCurrentRef.current.x * W, dragCurrentRef.current.y * H);
      ctx.stroke();
    }

    ctx.restore();
  }, [activeGame, role, hud, overlordTool]);

  const triggerPongSwing = (power: number, customAim?: number) => {
    const finalAim = customAim !== undefined ? customAim : aimValue;
    onSendInput({
      type: 'input',
      subType: 'swing',
      slot,
      power,
      aim: finalAim,
      spin: spinMode * 0.7,
    });
    setSwingFlash(`${Math.round(power * 100)}% STRIKE`);
    vibrate(35);
    setTimeout(() => setSwingFlash(null), 450);
  };

  const pongTeamSide = slot === 1 || slot === 3 ? 0 : 1;
  const pongHud = hud?.pong;
  const dungeonHud = hud?.dungeon;
  const myExplorer = dungeonHud?.explorers.find((e) => e.slot === slot);

  return (
    <div
      className={`touch-none-select flex flex-col justify-between bg-[#0B1020] text-slate-100 ${
        isEmbeddedSimulator ? 'h-full rounded-2xl border border-white/10 p-3.5' : 'h-dvh p-4'
      }`}
    >
      {/* Top Controller Telemetry Strip */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: accent.hex, boxShadow: `0 0 10px ${accent.hex}` }}
          />
          <span className="font-display text-sm font-bold tracking-tight">
            P{slot} GAMEPAD
          </span>
          <span className="font-mono text-xs text-slate-400 uppercase">
            {activeGame === 'pong'
              ? pongTeamSide === 0
                ? 'TEAM BLUE'
                : 'TEAM CORAL'
              : role === 'overlord'
              ? 'OVERLORD'
              : 'EXPLORER'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {activeGame === 'dungeon' && onCycleRole && (
            <button
              type="button"
              onClick={onCycleRole}
              className="rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200 active:scale-95"
            >
              Switch Role
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              zeroGammaRef.current = null;
              zeroBetaRef.current = null;
              enableDeviceSensors();
            }}
            className="flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-300 active:scale-95"
          >
            <Compass className="h-3.5 w-3.5" />
            {motionGranted ? 'Re-Center Gyro' : 'Enable Gyro'}
          </button>
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-rose-500'
            }`}
          />
        </div>
      </div>

      {/* MODE 1: PHONE PONG DX SECOND-SCREEN RADAR + SWIPE/SWING PAD */}
      {activeGame === 'pong' && (
        <div className="flex flex-1 flex-col justify-between gap-3 pt-2.5">
          {/* Second-Screen Sweet-Spot Timing Radar */}
          <div className="rounded-xl border border-white/10 bg-slate-900/90 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                <Radar className="h-3.5 w-3.5 text-sky-400" />
                SECOND-SCREEN TIMING RADAR
              </span>
              <span className="font-mono tabular-nums text-sky-300">
                RALLY {pongHud?.rallyCount ?? 0}
              </span>
            </div>

            <div className="relative h-8 w-full overflow-hidden rounded-lg bg-slate-950 border border-white/10">
              {/* Target Sweet-Spot Zone */}
              <div className="absolute right-[8%] top-0 bottom-0 w-[22%] bg-emerald-500/20 border-x border-emerald-400/40" />
              <div className="absolute right-[11%] top-1 text-[10px] font-mono text-emerald-300">
                SWEET SPOT
              </div>
              {/* Approaching Ball Marker */}
              {pongHud && pongHud.ballApproachingSide === pongTeamSide && (
                <div
                  className="absolute top-1.5 h-5 w-5 -translate-x-1/2 rounded-full bg-amber-400 shadow-[0_0_12px_#FBBF24] transition-all duration-75"
                  style={{ left: `${Math.min(96, Math.max(4, pongHud.ballNormalizedProgress * 100))}%` }}
                />
              )}
            </div>
          </div>

          {/* Interactive Touch Swipe & Gyro Aim Pad */}
          <div
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const rect = e.currentTarget.getBoundingClientRect();
              dragStartRef.current = {
                x: (e.clientX - rect.left) / rect.width,
                y: (e.clientY - rect.top) / rect.height,
                t: performance.now(),
              };
            }}
            onPointerMove={(e) => {
              if (!dragStartRef.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const nx = (e.clientX - rect.left) / rect.width;
              const aim = Math.max(-1, Math.min(1, (nx - 0.5) * 2));
              setAimValue(aim);
              onSendInput({ type: 'input', subType: 'aim', slot, aim });
            }}
            onPointerUp={(e) => {
              if (!dragStartRef.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const nx = (e.clientX - rect.left) / rect.width;
              const ny = (e.clientY - rect.top) / rect.height;
              const dy = dragStartRef.current.y - ny;
              const dx = nx - dragStartRef.current.x;
              const dt = Math.max(16, performance.now() - dragStartRef.current.t);
              const vel = Math.hypot(dx, dy) / (dt / 1000);
              const power = Math.min(1, Math.max(0.32, vel * 0.45));
              const aim = Math.max(-1, Math.min(1, (nx - 0.5) * 2));
              dragStartRef.current = null;
              setAimValue(aim);
              triggerPongSwing(power, aim);
            }}
            className="relative flex flex-1 flex-col items-center justify-center rounded-2xl border border-sky-400/25 bg-gradient-to-b from-slate-900/95 to-slate-950 p-4 text-center cursor-pointer active:border-sky-400"
          >
            <Smartphone className="h-8 w-8 text-sky-400 mb-2 opacity-80" />
            <div className="font-display text-base font-bold text-slate-100">
              {swingFlash || 'SWIPE UP OR SWING PHONE TO STRIKE'}
            </div>
            <p className="mt-1 text-xs text-slate-400 max-w-xs">
              Drag left/right to aim ({Math.round(aimValue * 45)}°) • Release to launch shot
            </p>

            {/* Live Aim Bar */}
            <div className="mt-4 w-48 h-2 rounded-full bg-slate-800 relative overflow-hidden">
              <div
                className="Expanded h-full w-6 rounded-full bg-sky-400 absolute top-0 -translate-x-1/2"
                style={{ left: `${50 + aimValue * 44}%` }}
              />
            </div>
          </div>

          {/* Bottom Tactile Spin & Instant Shot Buttons (>= 48px targets) */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setSpinMode(spinMode === -1 ? 0 : -1)}
              className={`min-h-12 rounded-xl border font-display text-xs font-bold transition ${
                spinMode === -1
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                  : 'border-white/10 bg-slate-900 text-slate-300'
              }`}
            >
              LEFT CURVE
            </button>
            <button
              type="button"
              onClick={() => triggerPongSwing(0.82)}
              className="min-h-12 rounded-xl border border-sky-400/50 bg-sky-500/20 font-display text-xs font-bold text-sky-200 active:scale-95"
            >
              POWER SMASH
            </button>
            <button
              type="button"
              onClick={() => setSpinMode(spinMode === 1 ? 0 : 1)}
              className={`min-h-12 rounded-xl border font-display text-xs font-bold transition ${
                spinMode === 1
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                  : 'border-white/10 bg-slate-900 text-slate-300'
              }`}
            >
              RIGHT CURVE
            </button>
          </div>
        </div>
      )}

      {/* MODE 2A: CRYPT OF THE OVERLORD — PRIVATE OVERLORD BLUEPRINT TABLET */}
      {activeGame === 'dungeon' && role === 'overlord' && (
        <div className="flex flex-1 flex-col justify-between gap-2.5 pt-2">
          <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
                PRIVATE OVERLORD BLUEPRINT
              </div>
              <div className="text-[11px] text-slate-400">
                Hidden from TV • Draw walls, plant traps, or slingshot orbs
              </div>
            </div>
            <div className="font-mono text-sm font-bold tabular-nums text-rose-300">
              MANA {dungeonHud?.overlordMana ?? 100}%
            </div>
          </div>

          {/* Interactive Blueprint Touch Surface */}
          <div className="relative flex-1 overflow-hidden rounded-2xl border border-rose-500/35 bg-slate-950">
            <canvas
              ref={blueprintCanvasRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                const nx = (e.clientX - rect.left) / rect.width;
                const ny = (e.clientY - rect.top) / rect.height;
                if (overlordTool === 'trap') {
                  onSendInput({ type: 'input', subType: 'placeTrap', slot, x: nx, y: ny });
                  vibrate(30);
                } else {
                  dragStartRef.current = { x: nx, y: ny, t: performance.now() };
                  dragCurrentRef.current = { x: nx, y: ny };
                }
              }}
              onPointerMove={(e) => {
                if (!dragStartRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                dragCurrentRef.current = {
                  x: (e.clientX - rect.left) / rect.width,
                  y: (e.clientY - rect.top) / rect.height,
                };
              }}
              onPointerUp={(e) => {
                if (!dragStartRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const nx = (e.clientX - rect.left) / rect.width;
                const ny = (e.clientY - rect.top) / rect.height;
                const start = dragStartRef.current;
                dragStartRef.current = null;
                dragCurrentRef.current = null;

                if (overlordTool === 'wall') {
                  onSendInput({
                    type: 'input',
                    subType: 'drawWall',
                    slot,
                    x1: start.x,
                    y1: start.y,
                    x2: nx,
                    y2: ny,
                  });
                  vibrate(40);
                } else if (overlordTool === 'orb') {
                  const vx = (start.x - nx) * 1.4;
                  const vy = (start.y - ny) * 1.4;
                  onSendInput({
                    type: 'input',
                    subType: 'slingshot',
                    slot,
                    x: start.x,
                    y: start.y,
                    vx,
                    vy,
                  });
                  vibrate(45);
                }
              }}
              className="h-full w-full block cursor-crosshair"
            />
          </div>

          {/* Overlord Tactical Tool Bar */}
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setOverlordTool('wall')}
              className={`min-h-12 rounded-xl border px-2 font-display text-xs font-bold transition ${
                overlordTool === 'wall'
                  ? 'border-rose-400 bg-rose-500/25 text-rose-200'
                  : 'border-white/10 bg-slate-900 text-slate-300'
              }`}
            >
              WALL (22)
            </button>
            <button
              type="button"
              onClick={() => setOverlordTool('trap')}
              className={`min-h-12 rounded-xl border px-2 font-display text-xs font-bold transition ${
                overlordTool === 'trap'
                  ? 'border-rose-400 bg-rose-500/25 text-rose-200'
                  : 'border-white/10 bg-slate-900 text-slate-300'
              }`}
            >
              SNARE (28)
            </button>
            <button
              type="button"
              onClick={() => setOverlordTool('orb')}
              className={`min-h-12 rounded-xl border px-2 font-display text-xs font-bold transition ${
                overlordTool === 'orb'
                  ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                  : 'border-white/10 bg-slate-900 text-slate-300'
              }`}
            >
              SLING (18)
            </button>
            <button
              type="button"
              onClick={() => {
                onSendInput({ type: 'input', subType: 'blackout', slot });
                vibrate([40, 60, 40]);
              }}
              className="min-h-12 rounded-xl border border-purple-400/40 bg-purple-500/20 px-2 font-display text-xs font-bold text-purple-200 active:scale-95"
            >
              STORM (45)
            </button>
          </div>
        </div>
      )}

      {/* MODE 2B: CRYPT OF THE OVERLORD — EXPLORER TACTILE GAMEPAD */}
      {activeGame === 'dungeon' && role !== 'overlord' && (
        <div className="flex flex-1 flex-col justify-between gap-3 pt-2">
          {/* Personal Vitality & Beacon Telemetry */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/90 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">VITALITY</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-5 rounded-sm ${
                      i < (myExplorer?.hp ?? 3) ? 'bg-emerald-400' : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="font-mono text-xs tabular-nums text-sky-300">
              BEACONS {dungeonHud?.beaconsCompleted ?? 0}/{dungeonHud?.totalBeacons ?? 4}
            </div>
          </div>

          {/* Split Thumbstick + Tactile Arcade Action Cluster */}
          <div className="grid flex-1 grid-cols-2 gap-3 items-center">
            {/* Left Virtual 8-Way Thumbstick */}
            <div
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                stickCenterRef.current = {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                };
              }}
              onPointerMove={(e) => {
                if (!stickCenterRef.current) return;
                const dx = e.clientX - stickCenterRef.current.x;
                const dy = e.clientY - stickCenterRef.current.y;
                const maxR = 48;
                const dist = Math.min(maxR, Math.hypot(dx, dy));
                const angle = Math.atan2(dy, dx);
                const nx = (Math.cos(angle) * dist) / maxR;
                const ny = (Math.sin(angle) * dist) / maxR;
                setStickOffset({ x: nx * 32, y: ny * 32 });
                onSendInput({
                  type: 'input',
                  subType: 'move',
                  slot,
                  moveX: nx,
                  moveY: ny,
                  aimAngle: angle,
                });
              }}
              onPointerUp={() => {
                stickCenterRef.current = null;
                setStickOffset({ x: 0, y: 0 });
                onSendInput({
                  type: 'input',
                  subType: 'move',
                  slot,
                  moveX: 0,
                  moveY: 0,
                });
              }}
              className="relative flex h-full min-h-40 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/75"
            >
              <div className="h-28 w-28 rounded-full border border-white/15 bg-slate-950/90 flex items-center justify-center">
                <div
                  className="h-12 w-12 rounded-full border-2 border-sky-400 bg-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.4)] transition-transform duration-75"
                  style={{
                    transform: `translate(${stickOffset.x}px, ${stickOffset.y}px)`,
                  }}
                />
              </div>
              <span className="absolute bottom-2 text-[10px] font-mono uppercase text-slate-400">
                MOVE & TORCH AIM
              </span>
            </div>

            {/* Right Tactile Action Buttons (>= 48px touch targets) */}
            <div className="flex flex-col gap-2.5 h-full justify-center">
              <button
                type="button"
                onClick={() => {
                  onSendInput({ type: 'input', subType: 'action', slot, action: 'dash' });
                  vibrate(30);
                }}
                className="flex min-h-14 items-center justify-between rounded-xl border border-sky-400/40 bg-sky-500/15 px-3.5 font-display text-xs font-bold text-sky-200 active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-sky-400" />
                  A • PHASE DASH
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  {myExplorer && myExplorer.dashCooldown > 0
                    ? `${myExplorer.dashCooldown.toFixed(1)}s`
                    : 'READY'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSendInput({ type: 'input', subType: 'action', slot, action: 'interact' });
                  vibrate(25);
                }}
                className="flex min-h-14 items-center justify-between rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3.5 font-display text-xs font-bold text-emerald-200 active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  B • BOOST BEACON
                </span>
                <span className="font-mono text-[11px]">PULSE</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSendInput({ type: 'input', subType: 'action', slot, action: 'flare' });
                  vibrate([30, 50, 30]);
                }}
                className="flex min-h-14 items-center justify-between rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 font-display text-xs font-bold text-amber-200 active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-400" />
                  X • SONAR FLARE
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  {myExplorer && myExplorer.flareCooldown > 0
                    ? `${myExplorer.flareCooldown.toFixed(1)}s`
                    : 'READY'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
