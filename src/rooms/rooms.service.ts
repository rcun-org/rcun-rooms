import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const rooms = await this.prisma.room.findMany({
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
    return rooms.map(this.toResponse);
  }

  async findById(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return this.toResponse(room);
  }

  async create(ownerId: string, dto: CreateRoomDto) {
    const videoUrl = dto.videoUrl ?? '';
    const playerMode = dto.playerMode ?? 'youtube';

    const room = await this.prisma.room.create({
      data: {
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
        accessMode: 'public',
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

    return this.toResponse(room);
  }

  async update(id: string, userId: string, dto: UpdateRoomDto) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.ownerId !== userId) {
      throw new ForbiddenException('Only owner can update room');
    }

    const updated = await this.prisma.room.update({
      where: { id },
      data: {
        title: dto.title,
        backupVideo: dto.backupVideo,
        backupVideoTimestamp: dto.backupVideoTimestamp,
        backupPlayerState: dto.backupPlayerState as object,
        backupChatHistory: dto.backupChatHistory,
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

  private toResponse(room: {
    id: string;
    title: string;
    ownerId: string;
    backupVideo: string;
    backupVideoTimestamp: number;
    backupPlayerState: Prisma.JsonValue;
    backupChatHistory: string;
    accessMode: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
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
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }
}
