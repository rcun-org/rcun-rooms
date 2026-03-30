import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyRoomAccessDto {
  @ApiPropertyOptional({ description: 'Room password', maxLength: 32 })
  @IsString()
  @MaxLength(32, { message: 'Password must be at most 32 characters' })
  @IsOptional()
  roomPassword?: string;
}
