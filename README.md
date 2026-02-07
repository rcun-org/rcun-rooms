# RCUN Rooms Microservice (M4)

NestJS + Prisma + Neon PostgreSQL — управление комнатами для совместного просмотра.

## Требования

- Node.js 20+
- PostgreSQL (Neon) — та же БД что rcun-auth или отдельная

## Запуск через Docker (рекомендуется)

Установка, Prisma generate, build и миграции выполняются внутри Docker. Локально ничего устанавливать не нужно.

```bash
# Из папки rcun-rooms
docker-compose build rcun-rooms
docker-compose up -d rcun-rooms
```

Или только rcun-rooms:

```bash
cd rcun-rooms
docker build -t rcun-rooms .
docker run -p 5004:5004 --env-file .env rcun-rooms
```

При старте контейнера автоматически выполняется `prisma migrate deploy`.

## Конфигурация (.env)

- `ROOMS_DATABASE_URL` — строка подключения к Neon (или `AUTH_DATABASE_URL` для shared DB)
- `AUTH_JWT_SECRET` — общий секрет JWT с rcun-auth

## Запуск локально (опционально)

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Сервис будет доступен на http://localhost:5004

## API

- GET /rooms — список комнат
- POST /rooms — создать комнату (JWT)
- GET /rooms/:id — комната по ID
- PATCH /rooms/:id — обновить (JWT, owner)
- DELETE /rooms/:id — удалить (JWT, owner)
- PATCH /rooms/:roomId/invite/:userId — пригласить (JWT, owner)

Alias для rcun-web: /api/room, /api/room/:id

## Health

- GET /rooms/health/liveness
- GET /rooms/health/readiness

## Docker

```bash
docker build -t rcun-rooms .
docker run -p 5004:5004 --env-file .env rcun-rooms
```