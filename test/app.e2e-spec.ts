import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type RoomRecord = {
  id: string;
  title: string;
  ownerId: string;
  backupVideo: string;
  backupVideoTimestamp: number;
  backupPlayerState: Record<string, unknown>;
  backupChatHistory: string;
  accessMode: string;
  lifecycleStatus: string;
  shareHash: string;
  passwordDigest: string;
  draftExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type RoomMemberRecord = {
  id: string;
  roomId: string;
  userId: string;
  role: string;
  createdAt: Date;
};

type RoomMessageRecord = {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Date;
};

type RoomQueueItemRecord = {
  id: string;
  roomId: string;
  title: string;
  videoUrl: string;
  poster: string;
  kind: string;
  duration: string;
  position: number;
  createdById: string;
  createdAt: Date;
};

type RoomShareLinkRecord = {
  id: string;
  roomId: string;
  hash: string;
  createdAt: Date;
};

class InMemoryPrisma {
  private rooms: RoomRecord[] = [];
  private members: RoomMemberRecord[] = [];
  private messages: RoomMessageRecord[] = [];
  private queueItems: RoomQueueItemRecord[] = [];
  private shareLinks: RoomShareLinkRecord[] = [];

  $queryRaw = async () => [{ ready: 1 }];

  reset() {
    this.rooms = [];
    this.members = [];
    this.messages = [];
    this.queueItems = [];
    this.shareLinks = [];
  }

  room = {
    deleteMany: async (args: { where?: Record<string, unknown> } = {}) => {
      const deletedRoomIds = this.rooms
        .filter((room) => this.matchesRoomWhere(room, args.where))
        .map((room) => room.id);
      this.rooms = this.rooms.filter(
        (room) => !deletedRoomIds.includes(room.id),
      );
      this.members = this.members.filter(
        (member) => !deletedRoomIds.includes(member.roomId),
      );
      this.messages = this.messages.filter(
        (message) => !deletedRoomIds.includes(message.roomId),
      );
      this.queueItems = this.queueItems.filter(
        (item) => !deletedRoomIds.includes(item.roomId),
      );
      this.shareLinks = this.shareLinks.filter(
        (link) => !deletedRoomIds.includes(link.roomId),
      );
      return { count: deletedRoomIds.length };
    },
    findMany: async (args: {
      include?: { members?: boolean };
      orderBy?: { createdAt?: 'asc' | 'desc' };
      where?: Record<string, unknown>;
    }) => {
      const rooms = this.rooms
        .filter((room) => this.matchesRoomWhere(room, args.where))
        .sort((left, right) => {
          if (args.orderBy?.createdAt === 'asc') {
            return left.createdAt.getTime() - right.createdAt.getTime();
          }

          return right.createdAt.getTime() - left.createdAt.getTime();
        });

      return args.include?.members
        ? rooms.map((room) => this.withMembers(room))
        : rooms.map((room) => ({ ...room }));
    },
    findUnique: async (args: {
      include?: { members?: boolean };
      select?: Record<string, boolean>;
      where: { id: string };
    }) => {
      const room = this.rooms.find((item) => item.id === args.where.id);

      if (!room) {
        return null;
      }

      if (args.select) {
        return Object.fromEntries(
          Object.entries(args.select)
            .filter(([, enabled]) => enabled)
            .map(([key]) => [key, room[key as keyof RoomRecord]]),
        );
      }

      return args.include?.members ? this.withMembers(room) : { ...room };
    },
    create: async (args: {
      data: RoomRecord & {
        shareLinks?: { create?: { hash: string } };
      };
      include?: { members?: boolean };
    }) => {
      const now = new Date();
      const room = {
        ...args.data,
        createdAt: args.data.createdAt ?? now,
        updatedAt: args.data.updatedAt ?? now,
      };
      delete (room as { shareLinks?: unknown }).shareLinks;
      this.rooms.push(room);

      if (args.data.shareLinks?.create?.hash) {
        this.shareLinks.push({
          id: randomUUID(),
          roomId: room.id,
          hash: args.data.shareLinks.create.hash,
          createdAt: now,
        });
      }

      return args.include?.members ? this.withMembers(room) : { ...room };
    },
    update: async (args: {
      data: Partial<RoomRecord> & {
        shareLinks?: {
          upsert?: {
            create: { hash: string };
            update: Record<string, never>;
            where: { hash: string };
          };
        };
      };
      include?: { members?: boolean };
      where: { id: string };
    }) => {
      const roomIndex = this.rooms.findIndex(
        (room) => room.id === args.where.id,
      );

      if (roomIndex === -1) {
        return null;
      }

      const current = this.rooms[roomIndex];
      const nextRoom = {
        ...current,
        ...Object.fromEntries(
          Object.entries(args.data).filter(
            ([key, value]) => key !== 'shareLinks' && value !== undefined,
          ),
        ),
        updatedAt: new Date(),
      } as RoomRecord;

      this.rooms[roomIndex] = nextRoom;

      const upsert = args.data.shareLinks?.upsert;
      if (
        upsert &&
        !this.shareLinks.some((link) => link.hash === upsert.where.hash)
      ) {
        this.shareLinks.push({
          id: randomUUID(),
          roomId: nextRoom.id,
          hash: upsert.create.hash,
          createdAt: new Date(),
        });
      }

      return args.include?.members
        ? this.withMembers(nextRoom)
        : { ...nextRoom };
    },
    delete: async (args: { where: { id: string } }) => {
      const room = this.rooms.find((item) => item.id === args.where.id);
      await this.room.deleteMany({ where: { id: args.where.id } });
      return room;
    },
  };

  roomMember = {
    create: async (args: {
      data: Pick<RoomMemberRecord, 'role' | 'roomId' | 'userId'>;
    }) => {
      const member = {
        id: randomUUID(),
        createdAt: new Date(),
        ...args.data,
      };
      this.members.push(member);
      return member;
    },
    findUnique: async (args: {
      select?: { role?: boolean };
      where: { roomId_userId: { roomId: string; userId: string } };
    }) => {
      const member = this.members.find(
        (item) =>
          item.roomId === args.where.roomId_userId.roomId &&
          item.userId === args.where.roomId_userId.userId,
      );

      if (!member) {
        return null;
      }

      return args.select?.role ? { role: member.role } : { ...member };
    },
    upsert: async (args: {
      create: Pick<RoomMemberRecord, 'role' | 'roomId' | 'userId'>;
      where: { roomId_userId: { roomId: string; userId: string } };
    }) => {
      const member = this.members.find(
        (item) =>
          item.roomId === args.where.roomId_userId.roomId &&
          item.userId === args.where.roomId_userId.userId,
      );

      if (member) {
        return member;
      }

      return this.roomMember.create({ data: args.create });
    },
  };

  roomMessage = {
    findMany: async (args: {
      orderBy?: { createdAt?: 'asc' | 'desc' };
      take?: number;
      where: { roomId: string };
    }) => {
      const messages = this.messages
        .filter((message) => message.roomId === args.where.roomId)
        .sort((left, right) =>
          args.orderBy?.createdAt === 'desc'
            ? right.createdAt.getTime() - left.createdAt.getTime()
            : left.createdAt.getTime() - right.createdAt.getTime(),
        );

      return messages.slice(0, args.take ?? messages.length);
    },
    create: async (args: {
      data: Pick<
        RoomMessageRecord,
        'authorId' | 'authorName' | 'roomId' | 'text'
      >;
    }) => {
      const message = {
        id: randomUUID(),
        createdAt: new Date(),
        ...args.data,
      };
      this.messages.push(message);
      return message;
    },
  };

  roomQueueItem = {
    findMany: async (args: {
      orderBy?: Array<{
        createdAt?: 'asc' | 'desc';
        position?: 'asc' | 'desc';
      }>;
      take?: number;
      where: { roomId: string };
    }) => {
      const queueItems = this.queueItems
        .filter((item) => item.roomId === args.where.roomId)
        .sort(
          (left, right) =>
            left.position - right.position ||
            left.createdAt.getTime() - right.createdAt.getTime(),
        );

      return queueItems.slice(0, args.take ?? queueItems.length);
    },
    findFirst: async (args: {
      orderBy?: { position?: 'asc' | 'desc' };
      where: { roomId: string };
    }) => {
      const queueItems = this.queueItems.filter(
        (item) => item.roomId === args.where.roomId,
      );

      queueItems.sort((left, right) =>
        args.orderBy?.position === 'desc'
          ? right.position - left.position
          : left.position - right.position,
      );

      return queueItems[0] ?? null;
    },
    create: async (args: {
      data: Pick<
        RoomQueueItemRecord,
        | 'createdById'
        | 'duration'
        | 'kind'
        | 'position'
        | 'poster'
        | 'roomId'
        | 'title'
        | 'videoUrl'
      >;
    }) => {
      const queueItem = {
        id: randomUUID(),
        createdAt: new Date(),
        ...args.data,
      };
      this.queueItems.push(queueItem);
      return queueItem;
    },
    delete: async (args: { where: { id: string } }) => {
      const item = this.queueItems.find(
        (queueItem) => queueItem.id === args.where.id,
      );
      this.queueItems = this.queueItems.filter(
        (queueItem) => queueItem.id !== args.where.id,
      );
      return item;
    },
  };

  roomShareLink = {
    findUnique: async (args: {
      select?: { roomId?: boolean };
      where: { hash: string };
    }) => {
      const link = this.shareLinks.find(
        (item) => item.hash === args.where.hash,
      );

      if (!link) {
        return null;
      }

      return args.select?.roomId ? { roomId: link.roomId } : { ...link };
    },
  };

  private matchesRoomWhere(room: RoomRecord, where?: Record<string, unknown>) {
    if (!where) {
      return true;
    }

    return Object.entries(where).every(([key, value]) => {
      if (key === 'draftExpiresAt' && value && typeof value === 'object') {
        const lte = (value as { lte?: Date }).lte;
        return room.draftExpiresAt !== null && lte
          ? room.draftExpiresAt.getTime() <= lte.getTime()
          : false;
      }

      return room[key as keyof RoomRecord] === value;
    });
  }

  private withMembers(room: RoomRecord) {
    return {
      ...room,
      members: this.members.filter((member) => member.roomId === room.id),
    };
  }
}

describe('Rooms Microservice (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let ownerAuth: string;
  let guestAuth: string;

  const ownerId = '550e8400-e29b-41d4-a716-446655440001';
  const guestId = '550e8400-e29b-41d4-a716-446655440002';

  async function createPrivateRoom() {
    const response = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', ownerAuth)
      .send({
        title: 'Private movie night',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        playerMode: 'youtube',
        accessMode: 'private',
        roomPassword: 'secret',
      })
      .expect(201);

    return response.body as {
      id: string;
      shareHash: string;
      title: string;
    };
  }

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'rooms-e2e-secret';
    process.env.AUTH_JWT_EXPIRES_IN = '1h';
    prisma = new InMemoryPrisma();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    const jwtService = app.get(JwtService);
    ownerAuth = `Bearer ${jwtService.sign({
      sub: ownerId,
      username: 'owner',
    })}`;
    guestAuth = `Bearer ${jwtService.sign({
      sub: guestId,
      username: 'guest',
    })}`;
  });

  beforeEach(() => {
    prisma.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health', () => {
    it('GET /rooms/health/liveness - should return alive', () => {
      return request(app.getHttpServer())
        .get('/rooms/health/liveness')
        .expect(200)
        .expect({ status: 'alive' });
    });

    it('GET /rooms/health/readiness - should return ready', () => {
      return request(app.getHttpServer())
        .get('/rooms/health/readiness')
        .expect(200)
        .expect({ status: 'ready' });
    });
  });

  describe('Rooms', () => {
    it('GET /rooms - should return empty array', () => {
      return request(app.getHttpServer())
        .get('/rooms')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('POST /rooms - requires authentication', () => {
      return request(app.getHttpServer())
        .post('/rooms')
        .send({ title: 'No auth room' })
        .expect(401);
    });

    it('POST /rooms - rejects private rooms without a password', () => {
      return request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', ownerAuth)
        .send({
          accessMode: 'private',
          title: 'Locked without a key',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBe('Private rooms require a password');
        });
    });

    it('creates private rooms for authenticated owners and keeps them out of public listings', async () => {
      const room = await createPrivateRoom();

      expect(room).toEqual(
        expect.objectContaining({
          accessMode: 'private',
          backupVideo: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          hasPassword: true,
          memberCount: 1,
          ownerId,
          shareHash: expect.any(String),
        }),
      );

      await request(app.getHttpServer())
        .get('/rooms')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([]);
        });

      await request(app.getHttpServer())
        .get('/rooms/mine')
        .set('Authorization', ownerAuth)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([
            expect.objectContaining({
              accessMode: 'private',
              hasPassword: true,
              id: room.id,
              shareHash: room.shareHash,
            }),
          ]);
        });
    });

    it('PATCH /rooms/:id - rejects switching a room to private without a password', async () => {
      const createdRoomResponse = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', ownerAuth)
        .send({
          accessMode: 'public',
          lifecycleStatus: 'draft',
          title: 'Draft room',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/rooms/${createdRoomResponse.body.id}`)
        .set('Authorization', ownerAuth)
        .send({
          accessMode: 'private',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBe('Private rooms require a password');
        });

      await request(app.getHttpServer())
        .patch(`/rooms/${createdRoomResponse.body.id}`)
        .set('Authorization', ownerAuth)
        .send({
          accessMode: 'private',
          roomPassword: 'secret',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              accessMode: 'private',
              hasPassword: true,
            }),
          );
        });
    });

    it('guards private shared room data until the password is verified', async () => {
      const room = await createPrivateRoom();

      await request(app.getHttpServer())
        .get(`/rooms/shared/${room.shareHash}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              accessMode: 'private',
              hasPassword: true,
              requiresPassword: true,
              shareHash: room.shareHash,
              title: room.title,
            }),
          );
          expect(res.body).not.toHaveProperty('id');
          expect(res.body).not.toHaveProperty('_id');
          expect(res.body).not.toHaveProperty('backupVideo');
          expect(res.body).not.toHaveProperty('ownerId');
        });

      await request(app.getHttpServer())
        .get(`/rooms/shared/${room.shareHash}/messages`)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toBe('Private room password required');
        });

      await request(app.getHttpServer())
        .get(`/rooms/shared/${room.shareHash}/queue`)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toBe('Private room password required');
        });
    });

    it('returns validation and access errors from the private room access endpoint', async () => {
      const room = await createPrivateRoom();

      await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/access`)
        .send({ roomPassword: '' })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('Password is required');
        });

      await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/access`)
        .send({ roomPassword: 'wrong' })
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toBe('Room password is incorrect');
        });
    });

    it('unlocks shared room data with a room access token', async () => {
      const room = await createPrivateRoom();
      const accessResponse = await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/access`)
        .send({ roomPassword: 'secret' })
        .expect(200);
      const accessToken = accessResponse.body.accessToken as string;

      expect(accessResponse.body.room).toEqual(
        expect.objectContaining({
          accessMode: 'private',
          backupVideo: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          id: room.id,
        }),
      );

      await request(app.getHttpServer())
        .get(`/rooms/shared/${room.shareHash}`)
        .set('X-Room-Access-Token', accessToken)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              backupVideo: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              id: room.id,
            }),
          );
          expect(res.body).not.toHaveProperty('requiresPassword');
        });

      await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/messages`)
        .set('Authorization', ownerAuth)
        .set('X-Room-Access-Token', accessToken)
        .send({ text: 'Welcome to the private room' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/rooms/shared/${room.shareHash}/messages`)
        .set('X-Room-Access-Token', accessToken)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([
            expect.objectContaining({
              authorId: ownerId,
              text: 'Welcome to the private room',
            }),
          ]);
        });
    });

    it('requires both JWT host authorization and room access for private queue changes', async () => {
      const room = await createPrivateRoom();
      const accessResponse = await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/access`)
        .send({ roomPassword: 'secret' })
        .expect(200);
      const accessToken = accessResponse.body.accessToken as string;

      await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/queue`)
        .set('X-Room-Access-Token', accessToken)
        .send({
          title: 'Queued video',
          videoUrl: 'https://example.com/video',
        })
        .expect(401);

      await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/queue`)
        .set('Authorization', guestAuth)
        .set('X-Room-Access-Token', accessToken)
        .send({
          title: 'Queued video',
          videoUrl: 'https://example.com/video',
        })
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toBe('Only host can manage the queue');
        });

      await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/queue`)
        .set('Authorization', ownerAuth)
        .send({
          title: 'Queued video',
          videoUrl: 'https://example.com/video',
        })
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toBe('Private room password required');
        });

      await request(app.getHttpServer())
        .post(`/rooms/shared/${room.shareHash}/queue`)
        .set('Authorization', ownerAuth)
        .set('X-Room-Access-Token', accessToken)
        .send({
          duration: 'Queued',
          kind: 'Long',
          poster: '',
          title: 'Queued video',
          videoUrl: 'https://example.com/video',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              createdById: ownerId,
              position: 1,
              title: 'Queued video',
            }),
          );
        });

      await request(app.getHttpServer())
        .get(`/rooms/shared/${room.shareHash}/queue`)
        .set('X-Room-Access-Token', accessToken)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([
            expect.objectContaining({
              title: 'Queued video',
            }),
          ]);
        });
    });
  });
});
