import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Rooms Microservice (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
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
  });
});
