import { Server } from 'node:http';
import { RawData, WebSocket, WebSocketServer } from 'ws';

const playbackPath = '/rooms/playback/ws';
const maxOffsetMs = 24 * 60 * 60 * 1000;
const roomStateLifetimeMs = 6 * 60 * 60 * 1000;

type PlaybackCommand =
  | 'seek_backward'
  | 'seek_to'
  | 'toggle_play'
  | 'seek_forward';

type ClientState = {
  id: string;
  offsetMs: number;
  offsetReady: boolean;
  roomId: string;
  socket: WebSocket;
};

type RoomPlaybackState = {
  isPlaying: boolean;
  positionSec: number;
  serverExecuteAtMs: number;
  updatedAt: number;
};

type RelayEnvelope = {
  data?: Record<string, unknown>;
  roomId?: string;
  senderId?: string;
  timestamp?: number;
  type?: string;
};

function asFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlaybackCommand(value: unknown): value is PlaybackCommand {
  return (
    value === 'seek_backward' ||
    value === 'seek_to' ||
    value === 'toggle_play' ||
    value === 'seek_forward'
  );
}

export class PlaybackWebSocketServer {
  private readonly clients = new Set<ClientState>();
  private readonly roomStates = new Map<string, RoomPlaybackState>();
  private readonly webSocketServer: WebSocketServer;

  constructor(server: Server) {
    this.webSocketServer = new WebSocketServer({
      path: playbackPath,
      server,
    });

    this.webSocketServer.on('connection', (socket) => {
      const client: ClientState = {
        id: '',
        offsetMs: 0,
        offsetReady: false,
        roomId: '',
        socket,
      };

      this.clients.add(client);
      socket.on('message', (raw) => this.handleMessage(client, raw));
      socket.on('close', () => this.disconnect(client));
      socket.on('error', () => this.disconnect(client));
    });
  }

  close() {
    for (const client of this.clients) {
      client.socket.close();
    }
    this.clients.clear();
    this.webSocketServer.close();
  }

  private handleMessage(client: ClientState, raw: RawData) {
    let envelope: RelayEnvelope;

    try {
      envelope = JSON.parse(raw.toString()) as RelayEnvelope;
    } catch {
      return;
    }

    switch (envelope.type) {
      case 'client_hello':
        this.handleHello(client, envelope.data);
        break;
      case 'clock_sync_request':
        this.handleClockSyncRequest(client, envelope.data);
        break;
      case 'clock_offset_report':
        this.handleClockOffsetReport(client, envelope.data);
        break;
      case 'latency_ping':
        this.handleLatencyPing(client, envelope.data);
        break;
      case 'playback_snapshot_request':
        this.sendPlaybackSnapshot(client);
        break;
      case 'control_request':
        this.handleControlRequest(client, envelope.data);
        break;
    }
  }

  private handleHello(client: ClientState, data?: Record<string, unknown>) {
    const clientId = asString(data?.clientId);
    const roomId = asString(data?.roomId);

    if (!clientId || !roomId) {
      return;
    }

    client.id = clientId;
    client.roomId = roomId;

    this.send(client, 'client_ready', {
      clientId,
      roomId,
      serverTimeMs: Date.now(),
    });
    this.broadcastRoomState(roomId);
    this.sendPlaybackSnapshot(client);
  }

  private handleClockSyncRequest(
    client: ClientState,
    data?: Record<string, unknown>,
  ) {
    const sampleId = asString(data?.sampleId);
    const clientSendMs = asFiniteNumber(data?.clientSendMs);

    if (!sampleId || clientSendMs === null) {
      return;
    }

    const serverReceiveMs = Date.now();
    this.send(client, 'clock_sync_result', {
      sampleId,
      clientSendMs,
      serverReceiveMs,
      serverSendMs: Date.now(),
    });
  }

  private handleClockOffsetReport(
    client: ClientState,
    data?: Record<string, unknown>,
  ) {
    const offsetMs = asFiniteNumber(data?.serverMinusClientOffsetMs);

    if (offsetMs === null) {
      return;
    }

    client.offsetMs = Math.max(-maxOffsetMs, Math.min(maxOffsetMs, offsetMs));
    client.offsetReady = true;
    this.broadcastRoomState(client.roomId);
  }

  private handleLatencyPing(
    client: ClientState,
    data?: Record<string, unknown>,
  ) {
    const pingId = asString(data?.pingId);
    const clientSendMs = asFiniteNumber(data?.clientSendMs);

    if (!pingId || clientSendMs === null) {
      return;
    }

    this.send(client, 'latency_pong', {
      clientSendMs,
      pingId,
      serverTimeMs: Date.now(),
    });
  }

  private handleControlRequest(
    sender: ClientState,
    data?: Record<string, unknown>,
  ) {
    const commandId = asString(data?.commandId);
    const command = data?.command;
    const targetTimeSec = asFiniteNumber(data?.targetTimeSec);
    const leadMs = asFiniteNumber(data?.leadMs);

    if (
      !sender.roomId ||
      !commandId ||
      !isPlaybackCommand(command) ||
      targetTimeSec === null ||
      leadMs === null ||
      typeof data?.shouldPlay !== 'boolean'
    ) {
      return;
    }

    const normalizedLeadMs = Math.max(500, Math.min(5000, Math.round(leadMs)));
    const serverExecuteAtMs = Date.now() + normalizedLeadMs;
    const positionSec = Math.max(0, targetTimeSec);
    const shouldPlay = data.shouldPlay;

    this.roomStates.set(sender.roomId, {
      isPlaying: shouldPlay,
      positionSec,
      serverExecuteAtMs,
      updatedAt: Date.now(),
    });
    this.removeExpiredRoomStates();

    let recipients = 0;
    let offsetReadyClients = 0;

    for (const client of this.clients) {
      if (!this.isActiveRoomClient(client, sender.roomId)) {
        continue;
      }

      if (client.offsetReady) {
        offsetReadyClients += 1;
      }

      this.send(client, 'scheduled_control', {
        command,
        commandId,
        executeAtLocalMs: serverExecuteAtMs - client.offsetMs,
        offsetReady: client.offsetReady,
        scheduleMode: 'server_per_client_local_time',
        senderId: sender.id,
        serverExecuteAtMs,
        serverMinusClientOffsetMs: client.offsetMs,
        shouldPlay,
        targetTimeSec: positionSec,
      });
      recipients += 1;
    }

    this.send(sender, 'control_ack', {
      commandId,
      offsetReadyClients,
      recipients,
      serverExecuteAtMs,
    });
  }

  private sendPlaybackSnapshot(client: ClientState) {
    const state = this.roomStates.get(client.roomId);

    if (!state || !client.roomId) {
      return;
    }

    const serverTimeMs = Date.now();
    this.send(client, 'playback_snapshot', {
      positionSec: this.getCurrentPositionSec(state, serverTimeMs),
      serverTimeMs,
      shouldPlay: state.isPlaying,
    });
  }

  private getCurrentPositionSec(
    state: RoomPlaybackState,
    serverTimeMs: number,
  ) {
    if (!state.isPlaying) {
      return state.positionSec;
    }

    return (
      state.positionSec +
      Math.max(0, serverTimeMs - state.serverExecuteAtMs) / 1000
    );
  }

  private disconnect(client: ClientState) {
    if (!this.clients.delete(client)) {
      return;
    }

    this.broadcastRoomState(client.roomId);
  }

  private broadcastRoomState(roomId: string) {
    if (!roomId) {
      return;
    }

    const clients = [...this.clients].filter((client) =>
      this.isActiveRoomClient(client, roomId),
    );
    const offsetReadyClients = clients.filter(
      (client) => client.offsetReady,
    ).length;

    for (const client of clients) {
      this.send(client, 'server_state', {
        clients: clients.length,
        offsetReadyClients,
      });
    }
  }

  private isActiveRoomClient(client: ClientState, roomId: string) {
    return (
      client.id.length > 0 &&
      client.roomId === roomId &&
      client.socket.readyState === WebSocket.OPEN
    );
  }

  private removeExpiredRoomStates() {
    const expiresBefore = Date.now() - roomStateLifetimeMs;

    for (const [roomId, state] of this.roomStates) {
      if (state.updatedAt < expiresBefore) {
        this.roomStates.delete(roomId);
      }
    }
  }

  private send(client: ClientState, type: string, data: object) {
    if (client.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    client.socket.send(
      JSON.stringify({
        data,
        roomId: client.roomId,
        senderId: 'server',
        targetId: client.id,
        timestamp: Date.now(),
        type,
      }),
    );
  }
}

export function attachPlaybackWebSocketServer(server: Server) {
  return new PlaybackWebSocketServer(server);
}
