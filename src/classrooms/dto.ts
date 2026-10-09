import { PartialType } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsString, Matches, MaxLength, Min } from 'class-validator'
import { TrimString } from '../common/transforms'

export class CreateClassRoomDto {
  @TrimString() @IsString() @IsNotEmpty({ message: 'Название обязательно' }) @MaxLength(200)
  name: string

  /** RTSP/HTTP-адрес камеры. Может содержать логин и пароль камеры, поэтому наружу отдаётся только Admin/SuperAdmin. */
  @TrimString() @IsString() @MaxLength(1000)
  @Matches(/^(rtsp|rtsps|http|https):\/\/\S+$/i, { message: 'Введите корректный URL камеры (rtsp:// или http://)' })
  cameraUrl: string

  @IsInt() @Min(1, { message: 'Выберите центр' })
  centerId: number
}

export class UpdateClassRoomDto extends PartialType(CreateClassRoomDto) {}
