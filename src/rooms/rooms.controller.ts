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
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { AddChatMessageDto } from './dto/add-chat-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all rooms' })
  @ApiResponse({ status: 200, description: 'List of rooms' })
  findAll() {
    return this.roomsService.findAll();
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get rooms owned by current user' })
  @ApiResponse({ status: 200, description: 'List of owned rooms' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findMine(@Req() req: { user: { userId: string } }) {
    return this.roomsService.findMine(req.user.userId);
  }

  @Get('shared/:hash/messages')
  @ApiOperation({ summary: 'Get room chat messages by share hash' })
  @ApiParam({ name: 'hash', description: 'Room share hash' })
  @ApiResponse({ status: 200, description: 'Room chat history' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  listMessagesByShareHash(@Param('hash') hash: string) {
    return this.roomsService.listMessagesByShareHash(hash);
  }

  @Post('shared/:hash/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add room chat message by share hash' })
  @ApiParam({ name: 'hash', description: 'Room share hash' })
  @ApiResponse({ status: 201, description: 'Chat message added' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  addMessageByShareHash(
    @Param('hash') hash: string,
    @Req() req: { user: { userId: string; username: string } },
    @Body() dto: AddChatMessageDto,
  ) {
    return this.roomsService.addMessageByShareHash(hash, req.user, dto);
  }

  @Get('shared/:hash')
  @ApiOperation({ summary: 'Get room by share hash' })
  @ApiParam({ name: 'hash', description: 'Room share hash' })
  @ApiResponse({ status: 200, description: 'Room found' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  findByShareHash(@Param('hash') hash: string) {
    return this.roomsService.findByShareHash(hash);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get room chat messages' })
  @ApiParam({ name: 'id', description: 'Room UUID' })
  @ApiResponse({ status: 200, description: 'Room chat history' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  listMessages(@Param('id') id: string) {
    return this.roomsService.listMessages(id);
  }

  @Post(':id/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add room chat message' })
  @ApiParam({ name: 'id', description: 'Room UUID' })
  @ApiResponse({ status: 201, description: 'Chat message added' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  addMessage(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; username: string } },
    @Body() dto: AddChatMessageDto,
  ) {
    return this.roomsService.addMessage(id, req.user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room by ID' })
  @ApiParam({ name: 'id', description: 'Room UUID' })
  @ApiResponse({ status: 200, description: 'Room found' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  findById(@Param('id') id: string) {
    return this.roomsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a room' })
  @ApiResponse({ status: 201, description: 'Room created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Req() req: { user: { userId: string } }, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(req.user.userId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update room' })
  @ApiParam({ name: 'id', description: 'Room UUID' })
  @ApiResponse({ status: 200, description: 'Room updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the owner' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  update(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete room' })
  @ApiParam({ name: 'id', description: 'Room UUID' })
  @ApiResponse({ status: 204, description: 'Room deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the owner' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async remove(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    await this.roomsService.remove(id, req.user.userId);
  }

  @Patch(':roomId/invite/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Invite user to room' })
  @ApiParam({ name: 'roomId', description: 'Room UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID to invite' })
  @ApiResponse({ status: 200, description: 'User invited' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the owner' })
  @ApiResponse({ status: 404, description: 'Room or user not found' })
  invite(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.roomsService.invite(roomId, userId, req.user.userId);
  }
}
