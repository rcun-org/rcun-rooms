import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
  let service: RoomsService;

  const prisma = {
    room: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    roomMember: {
      create: jest.fn(),
      upsert: jest.fn(),
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
    createdAt: new Date('2024-02-07T00:00:00.000Z'),
    updatedAt: new Date('2024-02-07T00:00:00.000Z'),
    members: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RoomsService(prisma as any);
  });

  it('returns rooms in legacy-compatible response shape', async () => {
    prisma.room.findMany.mockResolvedValue([room]);

    const result = await service.findAll();

    expect(prisma.room.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: room.id,
        _id: room.id,
        ownerId: room.ownerId,
        owner: { _id: room.ownerId, id: room.ownerId },
      }),
    ]);
  });

  it('creates a room and owner membership', async () => {
    prisma.room.create.mockResolvedValue(room);
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
    expect(result).toEqual(expect.objectContaining({ id: room.id }));
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
});
