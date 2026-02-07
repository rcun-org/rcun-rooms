import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findAll() {
    return this.roomsService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.roomsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: { user: { userId: string } }, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(req.user.userId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    await this.roomsService.remove(id, req.user.userId);
  }

  @Patch(':roomId/invite/:userId')
  @UseGuards(JwtAuthGuard)
  invite(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.roomsService.invite(roomId, userId, req.user.userId);
  }
}
