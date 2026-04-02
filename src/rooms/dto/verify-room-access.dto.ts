import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyRoomAccessDto {
  @ApiProperty({ description: 'Room password', minLength: 1, maxLength: 32 })
  @IsString()
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(32, { message: 'Password must be at most 32 characters' })
  roomPassword: string;
}
