import { Transform } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator'
import { NormalizeEmail, TrimString } from '../common/transforms'

export class LoginDto {
  /** email, телефон или username */
  @TrimString() @IsString() @IsNotEmpty() @MaxLength(100)
  phoneOrUserName: string

  @IsString() @IsNotEmpty() @MaxLength(100)
  password: string
}

export class SendOtpDto {
  @NormalizeEmail() @IsEmail({}, { message: 'Некорректный email' })
  email: string
}

export class VerifyOtpDto {
  @NormalizeEmail() @IsEmail({}, { message: 'Некорректный email' })
  email: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @Length(6, 6, { message: 'Код должен состоять из 6 цифр' }) @Matches(/^\\d{6}$/, { message: 'Код должен состоять из 6 цифр' })
  otpCode: string
}

export class ResetPasswordDto {
  @NormalizeEmail() @IsEmail({}, { message: 'Некорректный email' })
  email: string

  @IsString() @IsNotEmpty()
  token: string

  @IsString() @MinLength(6, { message: 'Пароль должен содержать минимум 6 символов' }) @MaxLength(100)
  newPassword: string

  @IsString()
  confirmNewPassword: string
}

export class ChangePasswordDto {
  @IsString() @IsNotEmpty()
  currentPassword: string

  @IsString() @MinLength(6, { message: 'Пароль должен содержать минимум 6 символов' }) @MaxLength(100)
  newPassword: string

  @IsString()
  confirmNewPassword: string
}
