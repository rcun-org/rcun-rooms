import { createServer, Server } from 'node:http';
import { WebSocket } from 'ws';
import { PlaybackWebSocketServer } from './playback-websocket-server';

type SentEnvelope = {
  data: Record<string, unknown>;
  roomId: string;
  senderId: string;
  targetId: string;
  timestamp: number;
  type: string;
};

type MockSocket = {
  close: jest.Mock;
  on: jest.Mock;
  readyState: number;
  send: jest.Mock;
};

type TestClient = {
  id: string;
  offsetMs: number;
  offsetReady: boolean;
  roomId: string;
  socket: MockSocket;
};

function createMockSocket(): MockSocket {
  return {
    close: jest.fn(),
    on: jest.fn(),
    readyState: WebSocket.OPEN,
    send: jest.fn(),
  };
}

function createClient(overrides: Partial<TestClient> = {}): TestClient {
  return {
    id: overrides.id ?? '',
    offsetMs: overrides.offsetMs ?? 0,
    offsetReady: overrides.offsetReady ?? false,
    roomId: overrides.roomId ?? '',
    socket: overrides.socket ?? createMockSocket(),
  };
}

function getSentMessages(client: TestClient) {
  return client.socket.send.mock.calls.map(([payload]) =>
    JSON.parse(payload as string),
  ) as SentEnvelope[];
}

describe('PlaybackWebSocketServer', () => {
  let httpServer: Server;
  let playbackServer: PlaybackWebSocketServer;

  beforeEach(() => {
    httpServer = createServer();
    playbackServer = new PlaybackWebSocketServer(httpServer);
  });

  afterEach(() => {
    playbackServer.close();
    httpServer.close();
  });

  it('replays the latest queue update to a late joiner after client hello', () => {
    const sender = createClient({ id: 'first', roomId: 'movie-night' });
    const lateJoiner = createClient();
    (playbackServer as never as { clients: Set<TestClient> }).clients.add(
      sender,
    );
    (playbackServer as never as { clients: Set<TestClient> }).clients.add(
      lateJoiner,
    );

    (
      playbackServer as never as {
        handleQueueUpdateRequest: (
          client: TestClient,
          data: Record<string, unknown>,
        ) => void;
      }
    ).handleQueueUpdateRequest(sender, {
      queue: [
        {
          createdAt: '2026-03-30T19:35:00.000Z',
          createdById: 'user-1',
          duration: '2h 46m',
          id: 'queue-item-1',
          kind: 'Long',
          position: 1,
          poster: 'url(https://example.com/poster.jpg)',
          roomId: 'room-uuid',
          title: 'Dune: Part Two',
          videoUrl: 'https://www.youtube.com/watch?v=test',
        },
      ],
    });

    (
      playbackServer as never as {
        handleHello: (
          client: TestClient,
          data: Record<string, unknown>,
        ) => void;
      }
    ).handleHello(lateJoiner, {
      clientId: 'late',
      roomId: 'movie-night',
    });

    expect(getSentMessages(lateJoiner)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            queue: [
              expect.objectContaining({
                id: 'queue-item-1',
                title: 'Dune: Part Two',
              }),
            ],
            senderId: 'first',
          }),
          roomId: 'movie-night',
          targetId: 'late',
          type: 'queue_update_broadcast',
        }),
      ]),
    );
  });

  it('replays the latest video update to a late joiner after client hello', () => {
    const sender = createClient({ id: 'first', roomId: 'movie-night' });
    const lateJoiner = createClient();
    (playbackServer as never as { clients: Set<TestClient> }).clients.add(
      sender,
    );
    (playbackServer as never as { clients: Set<TestClient> }).clients.add(
      lateJoiner,
    );

    (
      playbackServer as never as {
        handleVideoUpdateRequest: (
          client: TestClient,
          data: Record<string, unknown>,
        ) => void;
      }
    ).handleVideoUpdateRequest(sender, {
      queue: [],
      room: {
        backupPlayerState: {
          mode: 'long',
          status: 'paused',
          title: 'Dune: Part Two',
          url: 'https://www.youtube.com/watch?v=test',
        },
        backupVideo: 'https://www.youtube.com/watch?v=test',
        id: 'room-uuid',
        shareHash: 'share-hash',
        title: 'Movie night',
      },
      skippedItem: {
        createdAt: '2026-03-30T19:35:00.000Z',
        createdById: 'user-1',
        duration: '2h 46m',
        id: 'queue-item-1',
        kind: 'Long',
        position: 1,
        poster: 'url(https://example.com/poster.jpg)',
        roomId: 'room-uuid',
        title: 'Dune: Part Two',
        videoUrl: 'https://www.youtube.com/watch?v=test',
      },
    });

    (
      playbackServer as never as {
        handleHello: (
          client: TestClient,
          data: Record<string, unknown>,
        ) => void;
      }
    ).handleHello(lateJoiner, {
      clientId: 'late',
      roomId: 'movie-night',
    });

    expect(getSentMessages(lateJoiner)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            room: expect.objectContaining({
              id: 'room-uuid',
              title: 'Movie night',
            }),
            senderId: 'first',
            skippedItem: expect.objectContaining({
              id: 'queue-item-1',
              title: 'Dune: Part Two',
            }),
          }),
          roomId: 'movie-night',
          targetId: 'late',
          type: 'video_update_broadcast',
        }),
      ]),
    );
  });

  it('replays queue and video updates in server timestamp order', () => {
    const sender = createClient({ id: 'first', roomId: 'movie-night' });
    const lateJoiner = createClient();
    (playbackServer as never as { clients: Set<TestClient> }).clients.add(
      sender,
    );
    (playbackServer as never as { clients: Set<TestClient> }).clients.add(
      lateJoiner,
    );

    const dateNow = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(3000)
      .mockReturnValueOnce(3000)
      .mockReturnValueOnce(3000)
      .mockReturnValueOnce(3000);

    (
      playbackServer as never as {
        handleQueueUpdateRequest: (
          client: TestClient,
          data: Record<string, unknown>,
        ) => void;
      }
    ).handleQueueUpdateRequest(sender, {
      queue: [
        {
          createdAt: '2026-03-30T19:35:00.000Z',
          createdById: 'user-1',
          duration: 'Queued',
          id: 'queue-item-1',
          kind: 'Long',
          position: 1,
          poster: '',
          roomId: 'room-uuid',
          title: 'Queue first',
          videoUrl: 'https://www.youtube.com/watch?v=queue',
        },
      ],
    });

    (
      playbackServer as never as {
        handleVideoUpdateRequest: (
          client: TestClient,
          data: Record<string, unknown>,
        ) => void;
      }
    ).handleVideoUpdateRequest(sender, {
      queue: [],
      room: {
        id: 'room-uuid',
        shareHash: 'share-hash',
        title: 'Movie night',
      },
      skippedItem: null,
    });

    (
      playbackServer as never as {
        handleHello: (
          client: TestClient,
          data: Record<string, unknown>,
        ) => void;
      }
    ).handleHello(lateJoiner, {
      clientId: 'late',
      roomId: 'movie-night',
    });

    const replayTypes = getSentMessages(lateJoiner)
      .map((message) => message.type)
      .filter(
        (type) =>
          type === 'queue_update_broadcast' ||
          type === 'video_update_broadcast',
      );

    expect(replayTypes).toEqual([
      'queue_update_broadcast',
      'video_update_broadcast',
    ]);

    dateNow.mockRestore();
  });
});
