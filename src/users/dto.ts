import { PartialType } from '@nestjs/swagger'
import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'
import { NormalizeEmail, NormalizePhone, NormalizeTime, PHONE_REGEX, TIME_REGEX, TrimString } from '../common/transforms'

export class CreateUserDto {
  @TrimString() @IsString() @IsNotEmpty({ message: 'ФИО обязательно' }) @MaxLength(200)
  fullName: string

  @TrimString() @IsString() @IsNotEmpty({ message: 'Имя ребенка обязательно' }) @MaxLength(200)
  childName: string

  @NormalizePhone() @Matches(PHONE_REGEX, { message: 'Некорректный номер телефона' })
  phoneNumber: string

  @NormalizeEmail() @IsEmail({}, { message: 'Некорректный email' }) @MaxLength(200)
  email: string

  /** Разрешён ли просмотр камеры */
  @IsBoolean()
  connect: boolean

  /** Ежедневное окно просмотра, формат HH:mm */
  @NormalizeTime() @Matches(TIME_REGEX, { message: 'Время начала: формат HH:mm' })
  startTime: string

  @NormalizeTime() @Matches(TIME_REGEX, { message: 'Время окончания: формат HH:mm' })
  endTime: string

  @IsInt() @Min(1, { message: 'Некорректный ID класса' })
  classRoomId: number

  /** Для Admin игнорируется и принудительно равен его центру */
  @IsOptional() @IsInt() @Min(1, { message: 'Некорректный ID центра' })
  centerId?: number
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class CreateEmployeeDto {
  @TrimString() @IsString() @IsNotEmpty({ message: 'ФИО обязательно' }) @MaxLength(200)
  fullName: string

  @NormalizePhone() @Matches(PHONE_REGEX, { message: 'Некорректный номер телефона' })
  phoneNumber: string

  @NormalizeEmail() @IsEmail({}, { message: 'Некорректный email' }) @MaxLength(200)
  email: string

  /** Сотрудников создаём только с ролью Admin; SuperAdmin создаётся seed-скриптом */
  @IsIn(['Admin'], { message: 'Допустима только роль Admin' })
  role: 'Admin'

  /** Для Admin игнорируется и принудительно равен его центру; для SuperAdmin обязателен */
  @IsOptional() @IsInt() @Min(1, { message: 'Некорректный ID центра' })
  centerId?: number
}
