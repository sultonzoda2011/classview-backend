import { PartialType } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { TrimString } from '../common/transforms'

export class CreateCenterDto {
  @TrimString() @IsString() @IsNotEmpty({ message: 'Название обязательно' }) @MaxLength(200)
  name: string

  @TrimString() @IsString() @IsNotEmpty({ message: 'Адрес обязателен' }) @MaxLength(300)
  address: string
}

export class UpdateCenterDto extends PartialType(CreateCenterDto) {}
