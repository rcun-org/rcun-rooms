import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
  let service: RoomsService;

  const prisma = {
    room: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    roomMember: {
      create: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    roomMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    roomQueueItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    roomShareLink: {
      findUnique: jest.fn(),
    },
    roomFavorite: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const room = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Movie night',
    ownerId: '660e8400-e29b-41d4-a716-446655440000',
    backupVideo: 'https://example.com/video',
    backupVideoTimestamp: 0,
    backupPlayerState: {
      mode: 'youtube',
      url: 'https://example.com/video',
      status: 'paused',
    },
    backupChatHistory: '{}',
    accessMode: 'public',
    lifecycleStatus: 'ready',
    shareHash: 'room-share-hash',
    passwordDigest: 'password-digest',
    draftExpiresAt: null,
    createdAt: new Date('2024-02-07T00:00:00.000Z'),
    updatedAt: new Date('2024-02-07T00:00:00.000Z'),
    members: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RoomsService(prisma as any);
  });

  it('returns public ready rooms and drafts in legacy-compatible response shape', async () => {
    prisma.room.findMany.mockResolvedValue([room]);

    const result = await service.findAll();

    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: { accessMode: 'public' },
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: room.id,
        _id: room.id,
        ownerId: room.ownerId,
        owner: { _id: room.ownerId, id: room.ownerId },
        memberCount: 0,
        members: [],
      }),
    ]);
  });

  it('returns ready rooms owned by a user including private rooms', async () => {
    prisma.room.findMany.mockResolvedValue([room]);

    const result = await service.findMine(room.ownerId);

    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: { ownerId: room.ownerId, lifecycleStatus: 'ready' },
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: room.id,
        ownerId: room.ownerId,
        memberCount: 0,
        members: [],
      }),
    ]);
  });

  it('returns ready favorite rooms for a user', async () => {
    prisma.roomFavorite.findMany.mockResolvedValue([
      {
        userId: room.ownerId,
        roomId: room.id,
        createdAt: new Date('2024-02-07T00:04:00.000Z'),
        room,
      },
    ]);

    const result = await service.findFavorites(room.ownerId);

    expect(prisma.roomFavorite.findMany).toHaveBeenCalledWith({
      where: {
        userId: room.ownerId,
        room: {
          lifecycleStatus: 'ready',
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        room: {
          include: { members: true },
        },
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: room.id,
        ownerId: room.ownerId,
      }),
    ]);
  });

  it('adds a ready room to user favorites', async () => {
    prisma.room.findFirst.mockResolvedValue(room);
    prisma.roomFavorite.upsert.mockResolvedValue({
      userId: room.ownerId,
      roomId: room.id,
      createdAt: new Date('2024-02-07T00:04:00.000Z'),
    });

    await expect(service.addFavorite(room.id, room.ownerId)).resolves.toEqual(
      expect.objectContaining({
        id: room.id,
        ownerId: room.ownerId,
      }),
    );

    expect(prisma.room.findFirst).toHaveBeenCalledWith({
      where: {
        id: room.id,
        lifecycleStatus: 'ready',
      },
      include: { members: true },
    });
    expect(prisma.roomFavorite.upsert).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: room.ownerId,
          roomId: room.id,
        },
      },
      create: {
        userId: room.ownerId,
        roomId: room.id,
      },
      update: {},
    });
  });

  it('throws when favoriting a missing room', async () => {
    prisma.room.findFirst.mockResolvedValue(null);

    await expect(service.addFavorite(room.id, room.ownerId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('removes a room from user favorites idempotently', async () => {
    prisma.roomFavorite.deleteMany.mockResolvedValue({ count: 1 });

    await service.removeFavorite(room.id, room.ownerId);

    expect(prisma.roomFavorite.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: room.ownerId,
        roomId: room.id,
      },
    });
  });

  it('returns room members with roles in the room response', async () => {
    const roomWithMembers = {
      ...room,
      members: [
        {
          userId: room.ownerId,
          role: 'owner',
          createdAt: new Date('2024-02-07T00:00:00.000Z'),
        },
        {
          userId: '770e8400-e29b-41d4-a716-446655440000',
          role: 'member',
          createdAt: new Date('2024-02-07T00:02:00.000Z'),
        },
      ],
    };
    prisma.room.findUnique.mockResolvedValue(roomWithMembers);

    await expect(service.findById(room.id)).resolves.toEqual(
      expect.objectContaining({
        id: room.id,
        memberCount: 2,
        members: [
          expect.objectContaining({
            role: 'owner',
            userId: room.ownerId,
          }),
          expect.objectContaining({
            role: 'member',
            userId: '770e8400-e29b-41d4-a716-446655440000',
          }),
        ],
      }),
    );
  });

  it('creates a room and owner membership', async () => {
    prisma.room.create.mockResolvedValue(room);
    prisma.room.findUnique.mockResolvedValue({
      ...room,
      members: [
        {
          userId: room.ownerId,
          role: 'owner',
          createdAt: new Date('2024-02-07T00:00:00.000Z'),
        },
      ],
    });
    prisma.roomMember.create.mockResolvedValue({
      roomId: room.id,
      userId: room.ownerId,
      role: 'owner',
    });

    const result = await service.create(room.ownerId, {
      title: room.title,
      videoUrl: room.backupVideo,
      playerMode: 'youtube',
    });

    expect(prisma.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: room.title,
          ownerId: room.ownerId,
          backupVideo: room.backupVideo,
          accessMode: 'public',
          lifecycleStatus: 'ready',
          shareHash: expect.any(String),
          shareLinks: {
            create: {
              hash: expect.any(String),
            },
          },
        }),
        include: { members: true },
      }),
    );
    expect(prisma.roomMember.create).toHaveBeenCalledWith({
      data: {
        roomId: room.id,
        userId: room.ownerId,
        role: 'owner',
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: room.id,
        memberCount: 1,
        members: [
          expect.objectContaining({
            role: 'owner',
            userId: room.ownerId,
          }),
        ],
      }),
    );
  });

  it('rejects private room creation without a password', async () => {
    await expect(
      service.create(room.ownerId, {
        accessMode: 'private',
        title: room.title,
        videoUrl: room.backupVideo,
      }),
    ).rejects.toThrow(
      new BadRequestException('Private rooms require a password'),
    );
  });

  it('blocks updates from non-owners', async () => {
    prisma.room.findUnique.mockResolvedValue(room);

    await expect(
      service.update(room.id, '770e8400-e29b-41d4-a716-446655440000', {
        title: 'Other title',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when deleting a missing room', async () => {
    prisma.room.findUnique.mockResolvedValue(null);

    await expect(service.remove(room.id, room.ownerId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('invites a member when requested by the owner', async () => {
    const inviteeId = '770e8400-e29b-41d4-a716-446655440000';
    prisma.room.findUnique.mockResolvedValue(room);
    prisma.roomMember.upsert.mockResolvedValue({
      roomId: room.id,
      userId: inviteeId,
      role: 'member',
    });

    await service.invite(room.id, inviteeId, room.ownerId);

    expect(prisma.roomMember.upsert).toHaveBeenCalledWith({
      where: {
        roomId_userId: { roomId: room.id, userId: inviteeId },
      },
      create: {
        roomId: room.id,
        userId: inviteeId,
        role: 'member',
      },
      update: {},
    });
  });

  it('adds messages to an existing draft room', async () => {
    const message = {
      id: '880e8400-e29b-41d4-a716-446655440000',
      roomId: room.id,
      authorId: room.ownerId,
      authorName: 'owner',
      text: 'Pick a movie',
      createdAt: new Date('2024-02-07T00:00:00.000Z'),
    };
    prisma.room.findUnique.mockResolvedValue({ id: room.id });
    prisma.roomMessage.create.mockResolvedValue(message);

    await expect(
      service.addMessage(
        room.id,
        { userId: room.ownerId, username: 'owner' },
        { text: '  Pick a movie  ' },
      ),
    ).resolves.toEqual(message);

    expect(prisma.roomMessage.create).toHaveBeenCalledWith({
      data: {
        roomId: room.id,
        authorId: room.ownerId,
        authorName: 'owner',
        text: 'Pick a movie',
      },
    });
  });

  it('resolves a room through its share hash alias', async () => {
    prisma.roomShareLink.findUnique.mockResolvedValue({ roomId: room.id });
    prisma.room.findUnique.mockResolvedValue(room);

    await expect(service.findByShareHash(room.shareHash)).resolves.toEqual(
      expect.objectContaining({
        id: room.id,
        shareHash: room.shareHash,
      }),
    );

    expect(prisma.roomShareLink.findUnique).toHaveBeenCalledWith({
      where: { hash: room.shareHash },
      select: { roomId: true },
    });
  });

  it('returns a locked preview for private shared rooms without access token', async () => {
    const privateRoom = {
      ...room,
      accessMode: 'private',
      passwordDigest: createHash('sha256').update('secret').digest('hex'),
    };
    prisma.roomShareLink.findUnique.mockResolvedValue({ roomId: room.id });
    prisma.room.findUnique.mockResolvedValue(privateRoom);

    const lockedPreview = await service.findByShareHash(room.shareHash);

    expect(lockedPreview).toEqual(
      expect.objectContaining({
        accessMode: 'private',
        hasPassword: true,
        requiresPassword: true,
        shareHash: room.shareHash,
        title: room.title,
      }),
    );
    expect(lockedPreview).not.toHaveProperty('backupVideo');
  });

  it('rejects an incorrect private room password', async () => {
    const privateRoom = {
      ...room,
      accessMode: 'private',
      passwordDigest: createHash('sha256').update('secret').digest('hex'),
    };
    prisma.roomShareLink.findUnique.mockResolvedValue({ roomId: room.id });
    prisma.room.findUnique.mockResolvedValue(privateRoom);

    await expect(
      service.verifySharedAccess(room.shareHash, { roomPassword: 'wrong' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('grants a token for the correct private room password', async () => {
    const privateRoom = {
      ...room,
      accessMode: 'private',
      passwordDigest: createHash('sha256').update('secret').digest('hex'),
    };
    prisma.roomShareLink.findUnique.mockResolvedValue({ roomId: room.id });
    prisma.room.findUnique.mockResolvedValue(privateRoom);

    const access = await service.verifySharedAccess(room.shareHash, {
      roomPassword: 'secret',
    });

    expect(access).toEqual({
      accessToken: expect.any(String),
      room: expect.objectContaining({
        accessMode: 'private',
        backupVideo: room.backupVideo,
        id: room.id,
      }),
    });

    prisma.roomShareLink.findUnique.mockResolvedValue({ roomId: room.id });
    prisma.room.findUnique.mockResolvedValue(privateRoom);
    const unlockedRoom = await service.findByShareHash(
      room.shareHash,
      access.accessToken,
    );

    expect(unlockedRoom).toEqual(
      expect.objectContaining({
        backupVideo: room.backupVideo,
      }),
    );
    expect(unlockedRoom).not.toHaveProperty('requiresPassword');
  });

  it('blocks private shared messages without room access token', async () => {
    const privateRoom = {
      ...room,
      accessMode: 'private',
      passwordDigest: createHash('sha256').update('secret').digest('hex'),
    };
    prisma.roomShareLink.findUnique.mockResolvedValue({ roomId: room.id });
    prisma.room.findUnique.mockResolvedValue(privateRoom);

    await expect(
      service.listMessagesByShareHash(room.shareHash),
    ).rejects.toThrow(ForbiddenException);
  });

  it('adds a queue item after the current last position', async () => {
    const queueItem = {
      id: '990e8400-e29b-41d4-a716-446655440000',
      roomId: room.id,
      title: 'Next movie',
      videoUrl: 'https://example.com/next',
      poster: 'linear-gradient(#000,#111)',
      kind: 'Long',
      duration: '2h',
      position: 3,
      createdById: room.ownerId,
      createdAt: new Date('2024-02-07T00:00:00.000Z'),
    };
    prisma.roomMember.findUnique.mockResolvedValue({ role: 'owner' });
    prisma.roomQueueItem.findFirst.mockResolvedValue({ position: 2 });
    prisma.roomQueueItem.create.mockResolvedValue(queueItem);

    await expect(
      service.addQueueItem(room.id, room.ownerId, {
        duration: '2h',
        kind: 'Long',
        poster: 'linear-gradient(#000,#111)',
        title: ' Next movie ',
        videoUrl: ' https://example.com/next ',
      }),
    ).resolves.toEqual(queueItem);

    expect(prisma.roomQueueItem.create).toHaveBeenCalledWith({
      data: {
        roomId: room.id,
        title: 'Next movie',
        videoUrl: 'https://example.com/next',
        poster: 'linear-gradient(#000,#111)',
        kind: 'Long',
        duration: '2h',
        position: 3,
        createdById: room.ownerId,
      },
    });
  });

  it('skips to the next queued item and removes it from the queue', async () => {
    const queueItem = {
      id: '990e8400-e29b-41d4-a716-446655440000',
      roomId: room.id,
      title: 'Next movie',
      videoUrl: 'https://example.com/next',
      poster: '',
      kind: 'Long',
      duration: '2h',
      position: 1,
      createdById: room.ownerId,
      createdAt: new Date('2024-02-07T00:00:00.000Z'),
    };
    prisma.roomMember.findUnique.mockResolvedValue({ role: 'owner' });
    prisma.roomQueueItem.findFirst.mockResolvedValue(queueItem);
    prisma.room.update.mockResolvedValue({
      ...room,
      backupVideo: queueItem.videoUrl,
      backupPlayerState: {
        duration: queueItem.duration,
        mode: 'long',
        status: 'paused',
        title: queueItem.title,
        url: queueItem.videoUrl,
      },
    });
    prisma.roomQueueItem.delete.mockResolvedValue(queueItem);
    prisma.roomQueueItem.findMany.mockResolvedValue([]);

    await expect(service.skipQueueItem(room.id, room.ownerId)).resolves.toEqual(
      {
        queue: [],
        room: expect.objectContaining({
          backupVideo: queueItem.videoUrl,
          backupPlayerState: expect.objectContaining({
            title: queueItem.title,
            url: queueItem.videoUrl,
          }),
        }),
        skippedItem: queueItem,
      },
    );

    expect(prisma.roomQueueItem.delete).toHaveBeenCalledWith({
      where: { id: queueItem.id },
    });
  });

  it('blocks queue updates from regular members', async () => {
    prisma.roomMember.findUnique.mockResolvedValue({ role: 'member' });

    await expect(
      service.addQueueItem(room.id, '770e8400-e29b-41d4-a716-446655440000', {
        duration: '2h',
        kind: 'Long',
        poster: 'linear-gradient(#000,#111)',
        title: 'Next movie',
        videoUrl: 'https://example.com/next',
      }),
    ).rejects.toThrow(new ForbiddenException('Only host can manage the queue'));
  });

  it('blocks queue skipping from users outside host roles', async () => {
    prisma.roomMember.findUnique.mockResolvedValue(null);

    await expect(
      service.skipQueueItem(room.id, '770e8400-e29b-41d4-a716-446655440001'),
    ).rejects.toThrow(new ForbiddenException('Only host can manage the queue'));
  });
});
