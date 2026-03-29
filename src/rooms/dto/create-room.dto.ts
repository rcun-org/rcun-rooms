import {
  IsIn,
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ description: 'Room title', minLength: 1, maxLength: 48 })
  @IsString()
  @MinLength(1, { message: 'Title must be at least 1 character' })
  @MaxLength(48, { message: 'Title must be at most 48 characters' })
  title: string;

  @ApiPropertyOptional({ description: 'Video URL (Youtube, videocdn, etc.)' })
  @IsString()
  @IsOptional()
  videoUrl?: string;

  @ApiPropertyOptional({ description: 'Player mode', example: 'youtube' })
  @IsString()
  @IsOptional()
  playerMode?: string;

  @ApiPropertyOptional({ description: 'Video source', example: 'videocdn' })
  @IsString()
  @IsOptional()
  videoSource?: string;

  @ApiPropertyOptional({ description: 'IMDB ID for future M1 integration' })
  @IsString()
  @IsOptional()
  imdb?: string;

  @ApiPropertyOptional({
    description: 'Room lifecycle state',
    enum: ['draft', 'ready'],
    default: 'ready',
  })
  @IsIn(['draft', 'ready'])
  @IsOptional()
  lifecycleStatus?: 'draft' | 'ready';

  @ApiPropertyOptional({
    description: 'Room visibility',
    enum: ['public', 'private'],
    default: 'public',
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
