import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Columns2,
  Copy,
  Gamepad2,
  QrCode,
  RotateCcw,
  Smartphone,
  Swords,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { DungeonHostView } from './views/DungeonHostView';
import { PhoneControllerView } from './views/PhoneControllerView';
import { PongHostView } from './views/PongHostView';
import {
  BotDifficulty,
  ControllerHudPayload,
  ControllerInputMessage,
  GameId,
  PLAYER_ACCENTS,
  PlayerRole,
  PlayerSlot,
} from './types/protocol';
import { sound } from './utils/sound';

function createInitialPlayers(): Record<1 | 2 | 3 | 4, PlayerSlot> {
  return {
    1: {
      slot: 1,
      connected: false,
      name: 'Player 1',
      role: 'explorer',
      botDifficulty: 'off',
      latencyMs: 0,
      lastActivity: Date.now(),
    },
    2: {
      slot: 2,
      connected: false,
      name: 'Player 2',
      role: 'explorer',
      botDifficulty: 'medium',
      latencyMs: 0,
      lastActivity: Date.now(),
    },
    3: {
      slot: 3,
      connected: false,
      name: 'Player 3',
      role: 'explorer',
      botDifficulty: 'medium',
      latencyMs: 0,
      lastActivity: Date.now(),
    },
    4: {
      slot: 4,
      connected: false,
      name: 'Player 4',
      role: 'overlord',
      botDifficulty: 'medium',
      latencyMs: 0,
      lastActivity: Date.now(),
    },
  };
}

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialMode =
    searchParams.get('mode') === 'controller' ? 'controller' : 'host';
  const initialRoom = (searchParams.get('room') || 'WIIU').toUpperCase();
  const initialSlotParam = Number(searchParams.get('slot')) as 1 | 2 | 3 | 4;

  const [viewMode, setViewMode] = useState<'host' | 'controller'>(initialMode);
  const [roomCode] = useState<string>(initialRoom);
  const [activeGame, setActiveGame] = useState<GameId>('pong');
  const [players, setPlayers] = useState<Record<1 | 2 | 3 | 4, PlayerSlot>>(
    createInitialPlayers
  );
  const [wsConnected, setWsConnected] = useState(false);

  // Controller-specific state when running on a smartphone
  const [assignedSlot, setAssignedSlot] = useState<1 | 2 | 3 | 4>(
    initialSlotParam >= 1 && initialSlotParam <= 4 ? initialSlotParam : 1
  );
  const [controllerHud, setControllerHud] =
    useState<ControllerHudPayload | null>(null);

  // Host Console UI Controls
  const [showTwinSimulator, setShowTwinSimulator] = useState(true);
  const [simSlot, setSimSlot] = useState<1 | 2 | 3 | 4>(1);
  const [showQrModal, setShowQrModal] = useState(false);
  const [splitScreen, setSplitScreen] = useState(false);
  const [doublesMode, setDoublesMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  const [baseUrl, setBaseUrl] = useState<string>(window.location.origin);
  const [copiedLink, setCopiedLink] = useState(false);

  // Live Score & Match Telemetry for Top Console Overlay
  const [pongScores, setPongScores] = useState<[number, number]>([0, 0]);
  const [pongStatus, setPongStatus] = useState<string>(
    'Team Blue to serve — swing phone or swipe up!'
  );
  const [dungeonBeacons, setDungeonBeacons] = useState<number>(0);
  const [dungeonTimer, setDungeonTimer] = useState<number>(150);
  const [dungeonStatus, setDungeonStatus] = useState<string>(
    'Explorers: Charge all 4 Arcane Beacons! Overlord: Stop them from your tablet!'
  );

  const wsRef = useRef<WebSocket | null>(null);
  const inputListenersRef = useRef<Set<(msg: ControllerInputMessage) => void>>(
    new Set()
  );

  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then((data) => {
        if (data?.baseUrl) setBaseUrl(data.baseUrl);
      })
      .catch(() => {});
  }, []);

  const dispatchInputToHost = useCallback((msg: ControllerInputMessage) => {
    inputListenersRef.current.forEach((fn) => fn(msg));
  }, []);

  const subscribeToInputs = useCallback(
    (handler: (msg: ControllerInputMessage) => void) => {
      inputListenersRef.current.add(handler);
      return () => {
        inputListenersRef.current.delete(handler);
      };
    },
    []
  );

  // Connect WebSocket for either Host TV Console or Mobile Phone GamePad
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pingInterval: number | undefined;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        const savedToken = sessionStorage.getItem(`telepad_token_${roomCode}`);
        ws?.send(
          JSON.stringify({
            type: 'join',
            roomCode,
            clientType: viewMode,
            preferredSlot: assignedSlot,
            token: savedToken || undefined,
          })
        );

        pingInterval = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ type: 'ping', clientSentAt: performance.now() })
            );
          }
        }, 2500);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'joined') {
            setAssignedSlot(msg.slot);
            setActiveGame(msg.activeGame);
            if (msg.token) {
              sessionStorage.setItem(`telepad_token_${roomCode}`, msg.token);
            }
          } else if (msg.type === 'roomState') {
            setActiveGame(msg.activeGame);
            setPlayers(msg.players);
            if (msg.assignedSlot) setAssignedSlot(msg.assignedSlot);
          } else if (msg.type === 'hud') {
            setControllerHud(msg.payload);
          } else if (msg.type === 'input') {
            dispatchInputToHost(msg as ControllerInputMessage);
          }
        } catch {
          // Ignore malformed packets
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingInterval) clearInterval(pingInterval);
        reconnectTimer = window.setTimeout(connect, 1500);
      };
    };

    connect();
    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [viewMode, roomCode, assignedSlot, dispatchInputToHost]);

  const handleSwitchGame = (game: GameId) => {
    setActiveGame(game);
    if (game === 'dungeon') {
      // Set P1 as Overlord or Explorer cleanly for immediate Twin-View testing
      setSimSlot(1);
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'switchGame', game }));
    }
  };

  const handleConfigureSlot = (
    slot: 1 | 2 | 3 | 4,
    patch: { botDifficulty?: BotDifficulty; role?: PlayerRole }
  ) => {
    setPlayers((prev) => {
      const next = { ...prev };
      if (patch.role === 'overlord') {
        ([1, 2, 3, 4] as const).forEach((s) => {
          if (next[s].role === 'overlord') {
            next[s] = { ...next[s], role: 'explorer' };
          }
        });
      }
      next[slot] = { ...next[slot], ...patch };
      return next;
    });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'configureSlot',
          slot,
          ...patch,
        })
      );
    }
  };

  const handleBroadcastHud = useCallback(
    (partialHud: Omit<ControllerHudPayload, 'activeGame'>) => {
      const fullPayload: ControllerHudPayload = {
        activeGame,
        ...partialHud,
      };
      setControllerHud(fullPayload);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'hud',
            payload: fullPayload,
          })
        );
      }
    },
    [activeGame]
  );

  const handleControllerSendInput = useCallback(
    (msg: ControllerInputMessage) => {
      // If running inside the Host Twin-View Simulator, dispatch directly with zero latency
      if (viewMode === 'host') {
        dispatchInputToHost(msg);
        return;
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    },
    [viewMode, dispatchInputToHost]
  );

  const handlePongScoreChange = useCallback(
    (scores: [number, number], status: string) => {
      setPongScores(scores);
      setPongStatus(status);
    },
    []
  );

  const handleDungeonStatusChange = useCallback(
    (beaconsDone: number, timer: number, status: string) => {
      setDungeonBeacons(beaconsDone);
      setDungeonTimer(timer);
      setDungeonStatus(status);
    },
    []
  );

  const controllerJoinUrl = `${baseUrl}/?mode=controller&room=${roomCode}`;
  const qrImageUrl = `/api/qr?url=${encodeURIComponent(controllerJoinUrl)}`;

  // Dedicated Full-Viewport Mobile GamePad View when opened on a phone
  if (viewMode === 'controller') {
    const mySlotInfo = players[assignedSlot] || players[1];
    return (
      <PhoneControllerView
        slot={assignedSlot}
        role={mySlotInfo.role}
        activeGame={activeGame}
        hud={controllerHud}
        connected={wsConnected}
        onSendInput={handleControllerSendInput}
        onCycleRole={() => {
          const nextRole: PlayerRole =
            mySlotInfo.role === 'overlord' ? 'explorer' : 'overlord';
          handleConfigureSlot(assignedSlot, { role: nextRole });
        }}
      />
    );
  }

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#0B1020] text-slate-100 select-none">
      {/* 3-Zone Top Bar Contract (Wordmark Left, 4 Text Links Center, 1 Primary CTA Right) */}
      <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-8 border-b border-white/10 bg-[#0B1020]/90 px-6 backdrop-blur-md">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 whitespace-nowrap">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-400/40 text-sky-400">
            <Gamepad2 className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-extrabold tracking-tight text-slate-50">
            TELEPAD ARCADE
          </span>
        </div>

        {/* Zone 2: Primary Navigation (4 top-level text items) */}
        <nav className="flex items-center gap-7 text-sm font-semibold">
          <button
            type="button"
            onClick={() => handleSwitchGame('pong')}
            className={`transition whitespace-nowrap ${
              activeGame === 'pong'
                ? 'text-sky-400 border-b-2 border-sky-400 py-5'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Phone Pong DX
          </button>
          <button
            type="button"
            onClick={() => handleSwitchGame('dungeon')}
            className={`transition whitespace-nowrap ${
              activeGame === 'dungeon'
                ? 'text-rose-400 border-b-2 border-rose-400 py-5'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Crypt of the Overlord
          </button>
          <button
            type="button"
            onClick={() => setShowTwinSimulator((v) => !v)}
            className={`transition whitespace-nowrap ${
              showTwinSimulator
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Twin-View GamePad
          </button>
          <button
            type="button"
            onClick={() => setResetCounter((c) => c + 1)}
            className="text-slate-400 hover:text-slate-200 transition whitespace-nowrap"
          >
            Reset Match
          </button>
        </nav>

        {/* Zone 3: Single Primary Action CTA */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(56,189,248,0.35)] transition hover:bg-sky-400 active:scale-95 whitespace-nowrap"
          >
            <QrCode className="h-4 w-4" />
            Pair Phone • {roomCode}
          </button>
        </div>
      </header>

      {/* Main Interactive Stage + Dockable Twin-View Phone GamePad Simulator */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Left/Center Shared TV Arena Stage (85%+ visual weight) */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Translucent Floating Score & Mode Telemetry Bar */}
          <div className="pointer-events-none absolute top-4 left-6 right-6 z-10 flex items-center justify-between gap-4">
            {/* Live Score / Objective Readout */}
            <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5 backdrop-blur-md">
              {activeGame === 'pong' ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    <span className="text-xs font-bold uppercase text-slate-300">
                      BLUE
                    </span>
                    <span className="font-mono text-2xl font-extrabold tabular-nums text-sky-400">
                      {pongScores[0]}
                    </span>
                  </div>
                  <span className="text-slate-600 font-mono">:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-extrabold tabular-nums text-rose-400">
                      {pongScores[1]}
                    </span>
                    <span className="text-xs font-bold uppercase text-slate-300">
                      CORAL
                    </span>
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase text-slate-300">
                      BEACONS
                    </span>
                    <span className="font-mono text-lg font-extrabold tabular-nums text-emerald-400">
                      {dungeonBeacons}/4
                    </span>
                  </div>
                  <span className="text-slate-600">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold uppercase text-slate-400">
                      CRYPT TIMER
                    </span>
                    <span className="font-mono text-lg font-extrabold tabular-nums text-amber-400">
                      {dungeonTimer}s
                    </span>
                  </div>
                </div>
              )}

              <div className="hidden md:block border-l border-white/10 pl-4 text-xs font-medium text-slate-300 max-w-md truncate">
                {activeGame === 'pong' ? pongStatus : dungeonStatus}
              </div>
            </div>

            {/* Quick Arena Controls (Doubles / Split-Screen / Audio / Reset) */}
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-1.5 backdrop-blur-md">
              {activeGame === 'pong' && (
                <>
                  <button
                    type="button"
                    onClick={() => setDoublesMode((d) => !d)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      doublesMode
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    {doublesMode ? '2v2 Doubles' : '1v1 Singles'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitScreen((s) => !s)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      splitScreen
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    Split TV
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  sound.muted = !muted;
                  setMuted(!muted);
                }}
                className="rounded-xl p-2 text-slate-300 hover:bg-white/5"
                title={muted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-sky-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setResetCounter((c) => c + 1)}
                className="rounded-xl p-2 text-slate-300 hover:bg-white/5"
                title="Reset Match"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Active Game Canvas Viewport */}
          <div className="flex-1 w-full h-full">
            {activeGame === 'pong' ? (
              <PongHostView
                players={players}
                splitScreen={splitScreen}
                doublesMode={doublesMode}
                onBroadcastHud={handleBroadcastHud}
                inputSubscribe={subscribeToInputs}
                onScoreChange={handlePongScoreChange}
                resetSignal={resetCounter}
              />
            ) : (
              <DungeonHostView
                players={players}
                onBroadcastHud={handleBroadcastHud}
                inputSubscribe={subscribeToInputs}
                onStatusChange={handleDungeonStatusChange}
                resetSignal={resetCounter}
              />
            )}
          </div>

          {/* Bottom 4-Slot Player & Bot Status Bar */}
          <div className="z-10 flex items-center justify-between gap-3 border-t border-white/10 bg-[#0B1020]/90 px-6 py-2.5 backdrop-blur-md">
            <div className="grid flex-1 grid-cols-4 gap-3">
              {([1, 2, 3, 4] as const).map((slotNum) => {
                const p = players[slotNum];
                const accent = PLAYER_ACCENTS[slotNum];
                return (
                  <div
                    key={slotNum}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/75 px-3 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: accent.hex,
                          boxShadow: p.connected ? `0 0 8px ${accent.hex}` : 'none',
                        }}
                      />
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display text-xs font-bold text-slate-100">
                            P{slotNum}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate">
                            {p.connected
                              ? 'Phone Linked'
                              : p.botDifficulty === 'off'
                              ? 'Twin-Sim / Idle'
                              : `CPU (${p.botDifficulty.toUpperCase()})`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {activeGame === 'dungeon' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleConfigureSlot(slotNum, {
                              role: p.role === 'overlord' ? 'explorer' : 'overlord',
                            })
                          }
                          className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase transition ${
                            p.role === 'overlord'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                              : 'bg-sky-500/15 text-sky-300 border border-sky-400/30'
                          }`}
                        >
                          {p.role === 'overlord' ? 'OVERLORD' : 'EXPLORER'}
                        </button>
                      )}

                      {!p.connected && (
                        <button
                          type="button"
                          onClick={() => {
                            const order: BotDifficulty[] = [
                              'off',
                              'easy',
                              'medium',
                              'hard',
                            ];
                            const nextDiff =
                              order[(order.indexOf(p.botDifficulty) + 1) % order.length];
                            handleConfigureSlot(slotNum, { botDifficulty: nextDiff });
                          }}
                          className="flex items-center gap-1 rounded-md border border-white/10 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:border-white/25"
                          title="Cycle Bot Difficulty"
                        >
                          <Bot className="h-3 w-3 text-slate-400" />
                          {p.botDifficulty === 'off' ? 'No Bot' : p.botDifficulty}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Dockable Twin-View Phone GamePad Simulator (For Instant Single-Screen Testing) */}
        {showTwinSimulator && (
          <aside className="flex w-[370px] shrink-0 flex-col border-l border-white/10 bg-[#0E1528] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-emerald-400" />
                <span className="font-display text-xs font-bold uppercase tracking-wider text-slate-200">
                  TWIN-VIEW PHONE SIMULATOR
                </span>
              </div>
              <div className="flex items-center gap-1">
                {([1, 2, 3, 4] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSimSlot(s)}
                    className={`rounded-lg px-2 py-1 font-mono text-xs font-bold transition ${
                      simSlot === s
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    P{s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <PhoneControllerView
                slot={simSlot}
                role={players[simSlot].role}
                activeGame={activeGame}
                hud={controllerHud}
                connected={true}
                isEmbeddedSimulator={true}
                onSendInput={handleControllerSendInput}
                onCycleRole={() => {
                  const nextRole: PlayerRole =
                    players[simSlot].role === 'overlord' ? 'explorer' : 'overlord';
                  handleConfigureSlot(simSlot, { role: nextRole });
                }}
              />
            </div>

            <p className="mt-2.5 text-center text-[11px] text-slate-400">
              Test second-screen gameplay right here or scan{' '}
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="font-semibold text-sky-400 underline"
              >
                Pair Phone
              </button>{' '}
              with your real smartphone.
            </p>
          </aside>
        )}
      </main>

      {/* Scannable QR Pairing & Room Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0F172A] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5 text-sky-400 mb-2">
              <QrCode className="h-5 w-5" />
              <span className="font-display text-sm font-bold uppercase tracking-wider">
                CONNECT SMARTPHONE GAMEPAD
              </span>
            </div>

            <h2 className="font-display text-2xl font-extrabold text-slate-50">
              Room Code: <span className="font-mono text-sky-400">{roomCode}</span>
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Scan with your phone camera to transform your device into a motion &
              second-screen Wii U controller.
            </p>

            <div className="my-5 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-950 p-5">
              <img
                src={qrImageUrl}
                alt="Scan QR Code to Pair Phone"
                className="h-48 w-48 rounded-lg"
              />
              <span className="mt-3 font-mono text-xs text-slate-400 break-all text-center">
                {controllerJoinUrl}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(controllerJoinUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-900 py-3 font-display text-xs font-bold text-slate-100 hover:bg-slate-800"
              >
                <Copy className="h-4 w-4 text-sky-400" />
                {copiedLink ? 'Copied Controller Link!' : 'Copy Controller URL'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQrModal(false);
                  setViewMode('controller');
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 font-display text-xs font-bold text-slate-950 hover:bg-sky-400"
              >
                <Swords className="h-4 w-4" />
                Open Full Pad
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
