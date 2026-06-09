import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { AddChatMessageDto } from './dto/add-chat-message.dto';
import { AddQueueItemDto } from './dto/add-queue-item.dto';
import { VerifyRoomAccessDto } from './dto/verify-room-access.dto';

type RoomWithMembers = {
  id: string;
  title: string;
  ownerId: string;
  backupVideo: string;
  backupVideoTimestamp: number;
  backupPlayerState: Prisma.JsonValue;
  backupChatHistory: string;
  accessMode: string;
  lifecycleStatus: string;
  shareHash: string;
  passwordDigest: string;
  draftExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    userId: string;
    role: string;
    createdAt: Date;
  }>;
};

type QueueSkipGuard = {
  expectedCurrentVideoUrl?: string;
  expectedQueueItemId?: string;
};

@Injectable()
export class RoomsService implements OnModuleInit, OnModuleDestroy {
  private readonly draftLifetimeMs = 45 * 60 * 1000;
  private readonly cleanupIntervalMs = 60 * 1000;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    void this.cleanupExpiredDrafts().catch(() => undefined);
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredDrafts().catch(() => undefined);
    }, this.cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  async findAll() {
    await this.cleanupExpiredDrafts();

    const rooms = await this.prisma.room.findMany({
      where: {
        accessMode: 'public',
      },
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
    return rooms.map((room) => this.toResponse(room));
  }

  async findMine(ownerId: string) {
    await this.cleanupExpiredDrafts();

    const rooms = await this.prisma.room.findMany({
      where: {
        ownerId,
        lifecycleStatus: 'ready',
      },
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
    return rooms.map((room) => this.toResponse(room));
  }

  async findFavorites(userId: string) {
    await this.cleanupExpiredDrafts();

    const favorites = await this.prisma.roomFavorite.findMany({
      where: {
        userId,
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

    return favorites.map((favorite) => this.toResponse(favorite.room));
  }

  async addFavorite(roomId: string, userId: string) {
    await this.cleanupExpiredDrafts();

    const room = await this.prisma.room.findFirst({
      where: {
        id: roomId,
        lifecycleStatus: 'ready',
      },
      include: { members: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await this.prisma.roomFavorite.upsert({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
      create: {
        userId,
        roomId,
      },
      update: {},
    });

    return this.toResponse(room);
  }

  async removeFavorite(roomId: string, userId: string) {
    await this.cleanupExpiredDrafts();

    await this.prisma.roomFavorite.deleteMany({
      where: {
        userId,
        roomId,
      },
    });
  }

  async findById(id: string) {
    await this.cleanupExpiredDrafts();

    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return this.toResponse(room);
  }

  async findByShareHash(hash: string, accessToken?: string) {
    const room = await this.findRoomByShareHash(hash);

    if (!this.canReadSharedRoom(room, accessToken)) {
      return this.toPrivateEntryResponse(room);
    }

    return this.toResponse(room);
  }

  async verifySharedAccess(hash: string, dto: VerifyRoomAccessDto) {
    const room = await this.findRoomByShareHash(hash);

    if (
      room.accessMode === 'private' &&
      !this.isPasswordDigestValid(
        this.createPasswordDigest(dto.roomPassword),
        room.passwordDigest,
      )
    ) {
      throw new ForbiddenException('Room password is incorrect');
    }

    return {
      accessToken: this.createRoomAccessToken(room),
      room: this.toResponse(room),
    };
  }

  async create(ownerId: string, dto: CreateRoomDto) {
    await this.cleanupExpiredDrafts();

    const id = randomUUID();
    const videoUrl = dto.videoUrl ?? '';
    const playerMode = dto.playerMode ?? 'youtube';
    const lifecycleStatus = dto.lifecycleStatus ?? 'ready';
    const passwordDigest = this.createPasswordDigest(dto.roomPassword);
    this.requirePrivatePassword(dto.accessMode ?? 'public', passwordDigest);
    const shareHash = this.createShareHash(id, dto.title, passwordDigest);

    const room = await this.prisma.room.create({
      data: {
        id,
        title: dto.title,
        ownerId,
        backupVideo: videoUrl,
        backupVideoTimestamp: 0,
        backupPlayerState: {
          mode: playerMode,
          url: videoUrl,
          status: 'paused',
        },
        backupChatHistory: '{}',
        accessMode: dto.accessMode ?? 'public',
        lifecycleStatus,
        shareHash,
        passwordDigest,
        draftExpiresAt:
          lifecycleStatus === 'draft' ? this.createDraftExpiry() : null,
        shareLinks: {
          create: {
            hash: shareHash,
          },
        },
      },
      include: { members: true },
    });

    await this.prisma.roomMember.create({
      data: {
        roomId: room.id,
        userId: ownerId,
        role: 'owner',
      },
    });

    const createdRoom = await this.prisma.room.findUnique({
      where: { id: room.id },
      include: { members: true },
    });

    if (!createdRoom) {
      throw new NotFoundException('Room not found');
    }

    return this.toResponse(createdRoom);
  }

  async update(id: string, userId: string, dto: UpdateRoomDto) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.ownerId !== userId) {
      throw new ForbiddenException('Only owner can update room');
    }

    const lifecycleStatus = dto.lifecycleStatus ?? room.lifecycleStatus;
    const accessMode = dto.accessMode ?? room.accessMode;
    const passwordDigest =
      dto.roomPassword === undefined
        ? room.passwordDigest
        : this.createPasswordDigest(dto.roomPassword);
    this.requirePrivatePassword(accessMode, passwordDigest);
    const shareHash = this.createShareHash(
      room.id,
      dto.title ?? room.title,
      passwordDigest,
    );

    const updated = await this.prisma.room.update({
      where: { id },
      data: {
        title: dto.title,
        backupVideo: dto.backupVideo,
        backupVideoTimestamp: dto.backupVideoTimestamp,
        backupPlayerState: dto.backupPlayerState as object,
        backupChatHistory: dto.backupChatHistory,
        accessMode: dto.accessMode,
        lifecycleStatus,
        shareHash,
        passwordDigest,
        draftExpiresAt:
          lifecycleStatus === 'draft'
            ? (room.draftExpiresAt ?? this.createDraftExpiry())
            : null,
        shareLinks: {
          upsert: {
            where: { hash: shareHash },
            create: { hash: shareHash },
            update: {},
          },
        },
      },
      include: { members: true },
    });

    return this.toResponse(updated);
  }

  async remove(id: string, userId: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.ownerId !== userId) {
      throw new ForbiddenException('Only owner can delete room');
    }

    await this.prisma.room.delete({ where: { id } });
  }

  async invite(roomId: string, inviteeId: string, inviterId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.ownerId !== inviterId) {
      throw new ForbiddenException('Only owner can invite');
    }

    await this.prisma.roomMember.upsert({
      where: {
        roomId_userId: { roomId, userId: inviteeId },
      },
      create: {
        roomId,
        userId: inviteeId,
        role: 'member',
      },
      update: {},
    });

    return this.findById(roomId);
  }

  async listMessages(roomId: string) {
    await this.requireRoom(roomId);

    return this.prisma.roomMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  async addMessage(
    roomId: string,
    author: { userId: string; username: string },
    dto: AddChatMessageDto,
  ) {
    await this.requireRoom(roomId);

    return this.prisma.roomMessage.create({
      data: {
        roomId,
        authorId: author.userId,
        authorName: author.username,
        text: dto.text.trim(),
      },
    });
  }

  async listMessagesByShareHash(hash: string, accessToken?: string) {
    const room = await this.requireSharedRoomAccess(hash, accessToken);
    return this.listMessages(room.id);
  }

  async addMessageByShareHash(
    hash: string,
    author: { userId: string; username: string },
    dto: AddChatMessageDto,
    accessToken?: string,
  ) {
    const room = await this.requireSharedRoomAccess(hash, accessToken);
    return this.addMessage(room.id, author, dto);
  }

  async listQueue(roomId: string) {
    await this.requireRoom(roomId);

    return this.prisma.roomQueueItem.findMany({
      where: { roomId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    });
  }

  async listQueueByShareHash(hash: string, accessToken?: string) {
    const room = await this.requireSharedRoomAccess(hash, accessToken);
    return this.listQueue(room.id);
  }

  async addQueueItem(roomId: string, userId: string, dto: AddQueueItemDto) {
    await this.requireRoom(roomId);
    await this.requireQueueManager(roomId, userId);

    const lastItem = await this.prisma.roomQueueItem.findFirst({
      where: { roomId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return this.prisma.roomQueueItem.create({
      data: {
        roomId,
        title: dto.title.trim(),
        videoUrl: dto.videoUrl.trim(),
        poster: dto.poster?.trim() ?? '',
        kind: dto.kind?.trim() || 'Long',
        duration: dto.duration?.trim() || 'Queued',
        position: (lastItem?.position ?? 0) + 1,
        createdById: userId,
      },
    });
  }

  async addQueueItemByShareHash(
    hash: string,
    userId: string,
    dto: AddQueueItemDto,
    accessToken?: string,
  ) {
    const room = await this.requireSharedRoomAccess(hash, accessToken);
    return this.addQueueItem(room.id, userId, dto);
  }

  async skipQueueItem(roomId: string, userId: string, guard?: QueueSkipGuard) {
    const room = await this.findById(roomId);
    await this.requireQueueManager(roomId, userId);

    if (
      guard?.expectedCurrentVideoUrl &&
      room.backupVideo !== guard.expectedCurrentVideoUrl
    ) {
      return {
        queue: await this.listQueue(roomId),
        room,
        skippedItem: null,
      };
    }

    const nextItem = await this.prisma.roomQueueItem.findFirst({
      where: { roomId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    if (!nextItem) {
      return {
        queue: [],
        room: await this.findById(roomId),
        skippedItem: null,
      };
    }

    if (
      guard?.expectedQueueItemId &&
      nextItem.id !== guard.expectedQueueItemId
    ) {
      return {
        queue: await this.listQueue(roomId),
        room,
        skippedItem: null,
      };
    }

    const updatedRoom = await this.prisma.room.update({
      where: { id: roomId },
      data: {
        backupVideo: nextItem.videoUrl,
        backupVideoTimestamp: 0,
        backupPlayerState: {
          duration: nextItem.duration,
          mode: nextItem.kind.toLowerCase(),
          status: 'paused',
          title: nextItem.title,
          url: nextItem.videoUrl,
        },
      },
      include: { members: true },
    });

    await this.prisma.roomQueueItem.delete({
      where: { id: nextItem.id },
    });

    return {
      queue: await this.listQueue(roomId),
      room: this.toResponse(updatedRoom),
      skippedItem: nextItem,
    };
  }

  async skipQueueItemByShareHash(
    hash: string,
    userId: string,
    accessToken?: string,
    guard?: QueueSkipGuard,
  ) {
    const room = await this.requireSharedRoomAccess(hash, accessToken);
    return this.skipQueueItem(room.id, userId, guard);
  }

  private async cleanupExpiredDrafts() {
    await this.prisma.room.deleteMany({
      where: {
        lifecycleStatus: 'draft',
        draftExpiresAt: {
          lte: new Date(),
        },
      },
    });
  }

  private async findRoomIdByShareHash(hash: string) {
    await this.cleanupExpiredDrafts();

    const link = await this.prisma.roomShareLink.findUnique({
      where: { hash },
      select: { roomId: true },
    });

    if (!link) {
      throw new NotFoundException('Room not found');
    }

    return link.roomId;
  }

  private async findRoomByShareHash(hash: string) {
    const roomId = await this.findRoomIdByShareHash(hash);
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { members: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  private async requireSharedRoomAccess(hash: string, accessToken?: string) {
    const room = await this.findRoomByShareHash(hash);

    if (!this.canReadSharedRoom(room, accessToken)) {
      throw new ForbiddenException('Private room password required');
    }

    return room;
  }

  private createDraftExpiry() {
    return new Date(Date.now() + this.draftLifetimeMs);
  }

  private createPasswordDigest(password = '') {
    return createHash('sha256').update(password).digest('hex');
  }

  private requirePrivatePassword(accessMode: string, passwordDigest: string) {
    if (
      accessMode === 'private' &&
      passwordDigest === this.createPasswordDigest('')
    ) {
      throw new BadRequestException('Private rooms require a password');
    }
  }

  private createRoomAccessToken(room: {
    passwordDigest: string;
    shareHash: string;
  }) {
    return createHash('sha256')
      .update(`room-access\0${room.shareHash}\0${room.passwordDigest}`)
      .digest('hex');
  }

  private canReadSharedRoom(
    room: { accessMode: string; passwordDigest: string; shareHash: string },
    accessToken?: string,
  ) {
    return (
      room.accessMode !== 'private' ||
      this.isPasswordDigestValid(
        accessToken ?? '',
        this.createRoomAccessToken(room),
      )
    );
  }

  private isPasswordDigestValid(candidate: string, expected: string) {
    if (!candidate || candidate.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
  }

  private createShareHash(id: string, title: string, passwordDigest: string) {
    return createHash('sha256')
      .update(`${title.trim().toLowerCase()}\0${passwordDigest}\0${id}`)
      .digest('hex');
  }

  private async requireRoom(id: string) {
    await this.cleanupExpiredDrafts();

    const room = await this.prisma.room.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }
  }

  private async requireQueueManager(roomId: string, userId: string) {
    const member = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('Only host can manage the queue');
    }

    if (member.role !== 'owner' && member.role !== 'moderator') {
      throw new ForbiddenException('Only host can manage the queue');
    }
  }

  private toPrivateEntryResponse(room: RoomWithMembers) {
    return {
      title: room.title,
      accessMode: room.accessMode,
      lifecycleStatus: room.lifecycleStatus,
      shareHash: room.shareHash,
      draftExpiresAt: room.draftExpiresAt,
      createdAt: room.createdAt,
      hasPassword: room.passwordDigest !== this.createPasswordDigest(''),
      requiresPassword: true,
    };
  }

  private toResponse(room: RoomWithMembers) {
    return {
      id: room.id,
      _id: room.id,
      title: room.title,
      owner: { _id: room.ownerId, id: room.ownerId },
      ownerId: room.ownerId,
      backupVideo: room.backupVideo,
      backupVideoTimestamp: room.backupVideoTimestamp,
      backupPlayerState: room.backupPlayerState,
      backupChatHistory: room.backupChatHistory,
      accessMode: room.accessMode,
      hasPassword: room.passwordDigest !== this.createPasswordDigest(''),
      lifecycleStatus: room.lifecycleStatus,
      shareHash: room.shareHash,
      draftExpiresAt: room.draftExpiresAt,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      memberCount: room.members.length,
      members: room.members.map((member) => ({
        createdAt: member.createdAt,
        role: member.role,
        userId: member.userId,
      })),
    };
  }
}
