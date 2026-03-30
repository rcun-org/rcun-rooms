import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { PlaybackWebSocketServer } from './playback-websocket-server';

type RelayMessage = {
  data: Record<string, unknown>;
  type: string;
};

function openSocket(port: number) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/rooms/playback/ws`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitForMessage(
  socket: WebSocket,
  type: string,
  predicate: (message: RelayMessage) => boolean = () => true,
) {
  return new Promise<RelayMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', handleMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 1000);

    function handleMessage(raw: Buffer) {
      const message = JSON.parse(raw.toString()) as RelayMessage;

      if (message.type !== type || !predicate(message)) {
        return;
      }

      clearTimeout(timeout);
      socket.off('message', handleMessage);
      resolve(message);
    }

    socket.on('message', handleMessage);
  });
}

function send(socket: WebSocket, type: string, data: Record<string, unknown>) {
  socket.send(JSON.stringify({ data, type }));
}

describe('PlaybackWebSocketServer', () => {
  let httpServer: Server;
  let playbackServer: PlaybackWebSocketServer;
  let port: number;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    httpServer = createServer();
    playbackServer = new PlaybackWebSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.close();
    }
    sockets.length = 0;
    playbackServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('schedules one room command in each client local clock and serves a late-join snapshot', async () => {
    const first = await openSocket(port);
    const second = await openSocket(port);
    sockets.push(first, second);

    const firstReady = waitForMessage(first, 'client_ready');
    send(first, 'client_hello', { clientId: 'first', roomId: 'movie-night' });
    await firstReady;

    const secondReady = waitForMessage(second, 'client_ready');
    send(second, 'client_hello', { clientId: 'second', roomId: 'movie-night' });
    await secondReady;

    const offsetsReady = waitForMessage(
      first,
      'server_state',
      (message) => message.data.offsetReadyClients === 2,
    );
    send(first, 'clock_offset_report', { serverMinusClientOffsetMs: 0 });
    send(second, 'clock_offset_report', { serverMinusClientOffsetMs: 60_000 });
    await offsetsReady;

    const firstScheduled = waitForMessage(first, 'scheduled_control');
    const secondScheduled = waitForMessage(second, 'scheduled_control');
    const ack = waitForMessage(first, 'control_ack');

    send(first, 'control_request', {
      command: 'seek_to',
      commandId: 'seek-1',
      leadMs: 1200,
      shouldPlay: false,
      targetTimeSec: 42,
    });

    const [firstMessage, secondMessage, ackMessage] = await Promise.all([
      firstScheduled,
      secondScheduled,
      ack,
    ]);

    expect(
      Number(firstMessage.data.executeAtLocalMs) -
        Number(secondMessage.data.executeAtLocalMs),
    ).toBe(60_000);
    expect(firstMessage.data).toEqual(
      expect.objectContaining({
        command: 'seek_to',
        targetTimeSec: 42,
      }),
    );
    expect(ackMessage.data).toEqual(
      expect.objectContaining({
        offsetReadyClients: 2,
        recipients: 2,
      }),
    );

    const third = await openSocket(port);
    sockets.push(third);
    const thirdReady = waitForMessage(third, 'client_ready');
    const thirdSnapshot = waitForMessage(third, 'playback_snapshot');
    send(third, 'client_hello', { clientId: 'third', roomId: 'movie-night' });

    await thirdReady;
    await expect(thirdSnapshot).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          positionSec: 42,
          shouldPlay: false,
        }),
      }),
    );
  });

  it('broadcasts room reactions to other clients in the same room', async () => {
    const first = await openSocket(port);
    const second = await openSocket(port);
    sockets.push(first, second);

    const firstReady = waitForMessage(first, 'client_ready');
    send(first, 'client_hello', { clientId: 'first', roomId: 'movie-night' });
    await firstReady;

    const secondReady = waitForMessage(second, 'client_ready');
    send(second, 'client_hello', { clientId: 'second', roomId: 'movie-night' });
    await secondReady;

    const reactionBroadcast = waitForMessage(second, 'reaction_broadcast');
    send(first, 'reaction_request', {
      emoji: '😍',
      reactionId: 'reaction-1',
    });

    await expect(reactionBroadcast).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          emoji: '😍',
          reactionId: 'reaction-1',
          senderId: 'first',
        }),
      }),
    );
  });

  it('broadcasts saved chat messages to other clients in the same room', async () => {
    const first = await openSocket(port);
    const second = await openSocket(port);
    sockets.push(first, second);

    const firstReady = waitForMessage(first, 'client_ready');
    send(first, 'client_hello', { clientId: 'first', roomId: 'movie-night' });
    await firstReady;

    const secondReady = waitForMessage(second, 'client_ready');
    send(second, 'client_hello', { clientId: 'second', roomId: 'movie-night' });
    await secondReady;

    const message = {
      authorId: 'user-1',
      authorName: 'Mira',
      createdAt: '2026-03-30T19:20:00.000Z',
      id: 'message-1',
      roomId: 'room-uuid',
      text: 'This scene is wild',
    };
    const chatBroadcast = waitForMessage(second, 'chat_message_broadcast');
    send(first, 'chat_message_request', { message });

    await expect(chatBroadcast).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          message,
          senderId: 'first',
        }),
      }),
    );
  });
});
