import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('rooms/health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('liveness')
  liveness() {
    return { status: 'alive' };
  }

  @Get('readiness')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch (error) {
      return { status: 'not ready', error: (error as Error).message };
    }
  }
}
