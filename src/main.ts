import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { attachPlaybackWebSocketServer } from './playback/playback-websocket-server';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN?.split(',') || '*';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  const enableSwagger =
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true';

  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('RCUN Rooms API')
      .setDescription(
        'Rooms Microservice (M4) — комнаты для совместного просмотра',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
        'JWT-auth',
      )
      .addTag('rooms', 'Rooms CRUD и участники')
      .addTag('health', 'Health checks')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = process.env.PORT || 5004;
  await app.listen(port);
  attachPlaybackWebSocketServer(app.getHttpServer());

  console.log(
    `🚀 Rooms Microservice (M4) is running on: http://localhost:${port}`,
  );
  console.log(
    `🎬 Playback WebSocket: ws://localhost:${port}/rooms/playback/ws`,
  );
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  if (enableSwagger) {
    console.log(`📖 Swagger UI: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
