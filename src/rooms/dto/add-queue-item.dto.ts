import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddQueueItemDto {
  @ApiProperty({ description: 'Video title', minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1, { message: 'Title must not be empty' })
  @MaxLength(160, { message: 'Title must be at most 160 characters' })
  title: string;

  @ApiProperty({ description: 'Video URL' })
  @IsString()
  @MinLength(1, { message: 'Video URL must not be empty' })
  videoUrl: string;

  @ApiPropertyOptional({ description: 'Poster CSS background or cover URL' })
  @IsString()
  @MaxLength(2000, { message: 'Poster must be at most 2000 characters' })
  @IsOptional()
  poster?: string;

  @ApiPropertyOptional({ description: 'Video kind label', example: 'Long' })
  @IsString()
  @MaxLength(32, { message: 'Kind must be at most 32 characters' })
  @IsOptional()
  kind?: string;

  @ApiPropertyOptional({
    description: 'Video duration label',
    example: '2h 10m',
  })
  @IsString()
  @MaxLength(64, { message: 'Duration must be at most 64 characters' })
  @IsOptional()
  duration?: string;
}
