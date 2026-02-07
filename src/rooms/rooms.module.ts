import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { ApiRoomAliasController } from './api-room-alias.controller';
import { RoomsService } from './rooms.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [RoomsController, ApiRoomAliasController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
