import { IsIn, IsOptional, IsNumber, IsObject, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRoomDto {
  @ApiPropertyOptional({ description: 'Room title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Backup video URL' })
  @IsString()
  @IsOptional()
  backupVideo?: string;

  @ApiPropertyOptional({ description: 'Video timestamp' })
  @IsNumber()
  @IsOptional()
  backupVideoTimestamp?: number;

  @ApiPropertyOptional({
    description: 'Player state',
    example: { mode: 'youtube', url: '', status: 'paused' },
  })
  @IsObject()
  @IsOptional()
  backupPlayerState?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Chat history JSON string' })
  @IsString()
  @IsOptional()
  backupChatHistory?: string;

  @ApiPropertyOptional({
    description: 'Room lifecycle state',
    enum: ['draft', 'ready'],
  })
  @IsIn(['draft', 'ready'])
  @IsOptional()
  lifecycleStatus?: 'draft' | 'ready';

  @ApiPropertyOptional({
    description: 'Room visibility',
    enum: ['public', 'private'],
  })
  @IsIn(['public', 'private'])
  @IsOptional()
  accessMode?: 'public' | 'private';

  @ApiPropertyOptional({ description: 'Room password', maxLength: 32 })
  @IsString()
  @MaxLength(32, { message: 'Password must be at most 32 characters' })
  @IsOptional()
  roomPassword?: string;
}
