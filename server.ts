import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import {
  BotDifficulty,
  ControllerHudPayload,
  GameId,
  PlayerRole,
  PlayerSlot,
} from './src/types/protocol';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface ServerPlayerSlot extends PlayerSlot {
  ws: WebSocket | null;
  token: string | null;
}

interface Room {
  code: string;
  hostWs: WebSocket | null;
  activeGame: GameId;
  players: Record<1 | 2 | 3 | 4, ServerPlayerSlot>;
  lastHud: ControllerHudPayload | null;
}

const rooms = new Map<string, Room>();

function createDefaultSlot(slot: 1 | 2 | 3 | 4): ServerPlayerSlot {
  return {
    slot,
    connected: false,
    name: `Player ${slot}`,
    role: slot === 4 ? 'overlord' : 'explorer',
    botDifficulty: slot === 2 ? 'medium' : 'off',
    latencyMs: 0,
    lastActivity: Date.now(),
    ws: null,
    token: null,
  };
}

function getOrCreateRoom(rawCode?: string): Room {
  const code = (rawCode || 'WIIU').toUpperCase().slice(0, 6);
  let room = rooms.get(code);
  if (!room) {
    room = {
      code,
      hostWs: null,
      activeGame: 'pong',
      players: {
        1: createDefaultSlot(1),
        2: createDefaultSlot(2),
        3: createDefaultSlot(3),
        4: createDefaultSlot(4),
      },
      lastHud: null,
    };
    rooms.set(code, room);
  }
  return room;
}

function toPublicSlot(s: ServerPlayerSlot): PlayerSlot {
  return {
    slot: s.slot,
    connected: s.connected,
    name: s.name,
    role: s.role,
    botDifficulty: s.botDifficulty,
    latencyMs: s.latencyMs,
    lastActivity: s.lastActivity,
  };
}

function serializeRoom(room: Room) {
  const players: Record<1 | 2 | 3 | 4, PlayerSlot> = {
    1: toPublicSlot(room.players[1]),
    2: toPublicSlot(room.players[2]),
    3: toPublicSlot(room.players[3]),
    4: toPublicSlot(room.players[4]),
  };
  return {
    type: 'roomState',
    roomCode: room.code,
    activeGame: room.activeGame,
    players,
  };
}

function sendJson(ws: WebSocket | null, payload: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(room: Room) {
  const stateMsg = serializeRoom(room);
  sendJson(room.hostWs, stateMsg);
  ([1, 2, 3, 4] as const).forEach((s) => {
    sendJson(room.players[s].ws, {
      ...stateMsg,
      assignedSlot: s,
      assignedRole: room.players[s].role,
    });
  });
}

function getLanAddresses(): string[] {
  const out: string[] = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push(net.address);
      }
    }
  }
  return out;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // API: Server Info & App URL for QR Pairing
  app.get('/api/info', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const baseUrl = process.env.APP_URL || `${proto}://${host}`;
    res.json({
      baseUrl: baseUrl.replace(/\/$/, ''),
      addresses: getLanAddresses(),
      port: PORT,
    });
  });

  // API: Generate crisp SVG QR Code for Phone Controller pairing
  app.get('/api/qr', async (req, res) => {
    try {
      const targetUrl = String(req.query.url || 'http://localhost:3000');
      const svg = await QRCode.toString(targetUrl, {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#F8FAFC',
          light: '#00000000',
        },
      });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg);
    } catch (err) {
      res.status(500).send(String(err));
    }
  });

  // WebSocket Real-Time Relay Server
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let clientKind: 'host' | 'controller' | null = null;
    let boundRoom: Room | null = null;
    let boundSlot: 1 | 2 | 3 | 4 | null = null;

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        sendJson(ws, { type: 'pong', clientSentAt: msg.clientSentAt });
        if (boundRoom && boundSlot && typeof msg.latencyMs === 'number') {
          boundRoom.players[boundSlot].latencyMs = Math.round(msg.latencyMs);
        }
        return;
      }

      if (msg.type === 'join') {
        const room = getOrCreateRoom(String(msg.roomCode || 'WIIU'));
        boundRoom = room;

        if (msg.clientType === 'host') {
          clientKind = 'host';
          room.hostWs = ws;
          broadcastRoomState(room);
          return;
        }

        if (msg.clientType === 'controller') {
          clientKind = 'controller';
          const requestedSlot = Number(msg.preferredSlot) as 1 | 2 | 3 | 4;
          const token = String(msg.token || '');

          let targetSlot: 1 | 2 | 3 | 4 | null = null;

          // 1. Reconnect by token
          if (token) {
            for (const s of [1, 2, 3, 4] as const) {
              if (room.players[s].token === token) {
                targetSlot = s;
                break;
              }
            }
          }

          // 2. Requested slot if available or disconnected
          if (
            !targetSlot &&
            requestedSlot >= 1 &&
            requestedSlot <= 4 &&
            !room.players[requestedSlot].connected
          ) {
            targetSlot = requestedSlot;
          }

          // 3. First open slot
          if (!targetSlot) {
            for (const s of [1, 2, 3, 4] as const) {
              if (!room.players[s].connected) {
                targetSlot = s;
                break;
              }
            }
          }

          // 4. Fallback to slot 1
          if (!targetSlot) targetSlot = 1;

          boundSlot = targetSlot;
          const slotObj = room.players[targetSlot];
          if (slotObj.ws && slotObj.ws !== ws) {
            try {
              slotObj.ws.close();
            } catch {
              // ignore
            }
          }

          const newToken =
            token || `${targetSlot}-${Math.random().toString(36).slice(2, 10)}`;
          slotObj.ws = ws;
          slotObj.connected = true;
          slotObj.token = newToken;
          slotObj.botDifficulty = 'off';
          slotObj.lastActivity = Date.now();
          if (msg.name) slotObj.name = String(msg.name).slice(0, 16);

          sendJson(ws, {
            type: 'joined',
            roomCode: room.code,
            slot: targetSlot,
            token: newToken,
            activeGame: room.activeGame,
            role: slotObj.role,
          });

          if (room.lastHud) {
            sendJson(ws, { type: 'hud', payload: room.lastHud });
          }

          broadcastRoomState(room);
          return;
        }
      }

      if (!boundRoom) return;

      // Host or Controller switching active game
      if (msg.type === 'switchGame') {
        const nextGame: GameId = msg.game === 'dungeon' ? 'dungeon' : 'pong';
        boundRoom.activeGame = nextGame;
        broadcastRoomState(boundRoom);
        return;
      }

      // Host configuring CPU Bot difficulty or Player Role
      if (msg.type === 'configureSlot') {
        const s = Number(msg.slot) as 1 | 2 | 3 | 4;
        if (s >= 1 && s <= 4) {
          if (msg.botDifficulty !== undefined) {
            boundRoom.players[s].botDifficulty = msg.botDifficulty as BotDifficulty;
          }
          if (msg.role !== undefined) {
            const newRole = msg.role as PlayerRole;
            if (newRole === 'overlord') {
              // Ensure only 1 Overlord at a time for clean 1-vs-Many asymmetry
              ([1, 2, 3, 4] as const).forEach((other) => {
                if (boundRoom && boundRoom.players[other].role === 'overlord') {
                  boundRoom.players[other].role = 'explorer';
                }
              });
            }
            boundRoom.players[s].role = newRole;
          }
          broadcastRoomState(boundRoom);
        }
        return;
      }

      // Host broadcasting 20Hz live HUD / Radar state to connected Phone Controllers
      if (msg.type === 'hud' && clientKind === 'host') {
        const hudPayload = msg.payload as ControllerHudPayload;
        boundRoom.lastHud = hudPayload;
        ([1, 2, 3, 4] as const).forEach((s) => {
          sendJson(boundRoom!.players[s].ws, {
            type: 'hud',
            payload: hudPayload,
            slot: s,
            role: boundRoom!.players[s].role,
          });
        });
        return;
      }

      // Controller sending high-frequency sensor/touch/button input to Host
      if (msg.type === 'input') {
        const effectiveSlot =
          boundSlot || (Number(msg.slot) as 1 | 2 | 3 | 4) || 1;
        if (effectiveSlot >= 1 && effectiveSlot <= 4) {
          boundRoom.players[effectiveSlot].lastActivity = Date.now();
        }
        sendJson(boundRoom.hostWs, {
          ...msg,
          slot: effectiveSlot,
        });
      }
    });

    ws.on('close', () => {
      if (!boundRoom) return;
      if (clientKind === 'host' && boundRoom.hostWs === ws) {
        boundRoom.hostWs = null;
      } else if (clientKind === 'controller' && boundSlot) {
        const slotObj = boundRoom.players[boundSlot];
        if (slotObj.ws === ws) {
          slotObj.ws = null;
          slotObj.connected = false;
          broadcastRoomState(boundRoom);
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TelePad Arcade Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
