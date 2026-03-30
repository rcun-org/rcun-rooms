import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddChatMessageDto {
  @ApiProperty({
    description: 'Chat message text',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @MinLength(1, { message: 'Message must not be empty' })
  @MaxLength(500, { message: 'Message must be at most 500 characters' })
  text: string;
}
