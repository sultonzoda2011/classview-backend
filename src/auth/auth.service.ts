import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { Result } from '../common/result'
import { Account } from '../generated/prisma/client'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { ChangePasswordDto, LoginDto, ResetPasswordDto, SendOtpDto, VerifyOtpDto } from './dto'

const OTP_TTL_MS = 5 * 60 * 1000
const OTP_RESEND_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const BCRYPT_ROUNDS = 10
// хеш-пустышка: сравниваем с ним, когда аккаунт не найден (одинаковое время ответа)
const DUMMY_HASH = bcrypt.hashSync('classview-dummy-password', BCRYPT_ROUNDS)

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private readonly secret: string
  private readonly resetSecret: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET')
    this.resetSecret = `${this.secret}:reset`
  }

  /** Клеймы названы так, как их читает фронт (nameid, unique_name, role, centerId, classRoomId). */
  signAccessToken(acc: Pick<Account, 'id' | 'fullName' | 'userName' | 'role' | 'centerId' | 'classRoomId' | 'mustChangePw'>) {
    return this.jwt.signAsync({
      nameid: acc.id,
      unique_name: acc.userName ?? acc.fullName,
      role: acc.role,
      centerId: acc.centerId != null ? String(acc.centerId) : '',
      classRoomId: acc.classRoomId != null ? String(acc.classRoomId) : '',
      mustChangePw: acc.mustChangePw,
    })
  }

  async login(dto: LoginDto) {
    const v = dto.phoneOrUserName.trim()
    const acc = await this.prisma.account.findFirst({
      where: { OR: [{ email: v.toLowerCase() }, { phoneNumber: v.replace(/[\s\-()]/g, '') }, { userName: v }] },
    })
    const ok = await bcrypt.compare(dto.password, acc?.passwordHash ?? DUMMY_HASH)
    if (!acc || !ok) throw new UnauthorizedException('Неверный логин или пароль')
    return new Result(await this.signAccessToken(acc), 'Вход выполнен')
  }

  private hashCode(email: string, code: string) {
    return createHmac('sha256', this.secret).update(`${email}:${code}`).digest('hex')
  }

  async sendOtp(dto: SendOtpDto) {
    const generic = new Result(null, 'Если аккаунт с таким email существует, код отправлен на почту')
    const acc = await this.prisma.account.findUnique({ where: { email: dto.email }, select: { id: true } })
    if (!acc) return generic

    const last = await this.prisma.otp.findFirst({ where: { email: dto.email }, orderBy: { createdAt: 'desc' } })
    if (last && Date.now() - last.createdAt.getTime() < OTP_RESEND_MS) {
      throw new HttpException('Подождите минуту перед повторной отправкой кода', HttpStatus.TOO_MANY_REQUESTS)
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.prisma.$transaction([
      this.prisma.otp.deleteMany({ where: { email: dto.email } }),
      this.prisma.otp.create({
        data: { email: dto.email, codeHash: this.hashCode(dto.email, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      }),
    ])
    try {
      await this.mail.sendOtp(dto.email, code)
    } catch (e) {
      this.logger.error(`Не удалось отправить OTP на ${dto.email}: ${(e as Error).message}`)
      throw new HttpException('Не удалось отправить письмо, попробуйте позже', HttpStatus.BAD_GATEWAY)
    }
    return generic
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const invalid = new BadRequestException('Неверный или просроченный код')
    const now = new Date()
    const otp = await this.prisma.otp.findFirst({
      where: { email: dto.email, used: false, verified: false, expiresAt: { gt: now }, attempts: { lt: OTP_MAX_ATTEMPTS } },
      orderBy: { createdAt: 'desc' },
    })
    if (!otp) throw invalid

    const expected = Buffer.from(otp.codeHash, 'hex')
    const actual = Buffer.from(this.hashCode(dto.email, dto.otpCode), 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      // Инкремент условный и атомарный: параллельные запросы не обходят лимит попыток.
      await this.prisma.otp.updateMany({
        where: {
          id: otp.id,
          used: false,
          verified: false,
          expiresAt: { gt: now },
          attempts: { lt: OTP_MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      })
      throw invalid
    }

    const token = await this.jwt.signAsync(
      { purpose: 'reset', email: dto.email, otpId: otp.id },
      { secret: this.resetSecret, expiresIn: '10m' },
    )
    // Только один запрос может подтвердить OTP и получить reset-токен.
    const claimed = await this.prisma.otp.updateMany({
      where: {
        id: otp.id,
        used: false,
        verified: false,
        expiresAt: { gt: now },
        attempts: { lt: OTP_MAX_ATTEMPTS },
      },
      data: { verified: true },
    })
    if (claimed.count !== 1) throw invalid

    return new Result(token, 'Код подтверждён')
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.newPassword !== dto.confirmNewPassword) throw new BadRequestException('Пароли не совпадают')
    let payload: { purpose?: string; email?: string; otpId?: number }
    try {
      payload = await this.jwt.verifyAsync(dto.token, { secret: this.resetSecret })
    } catch {
      throw new BadRequestException('Токен сброса недействителен или просрочен')
    }
    if (payload.purpose !== 'reset' || payload.email !== dto.email || !payload.otpId) {
      throw new BadRequestException('Токен сброса недействителен')
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS)
    await this.prisma.$transaction(async (tx) => {
      // Одноразово «захватываем» OTP внутри той же транзакции, что меняет пароль.
      // При ошибке обновления аккаунта транзакция откатит used обратно в false.
      const claimed = await tx.otp.updateMany({
        where: { id: payload.otpId!, email: dto.email, verified: true, used: false },
        data: { used: true },
      })
      if (claimed.count !== 1) throw new BadRequestException('Токен сброса недействителен')

      await tx.account.update({
        where: { email: dto.email },
        data: { passwordHash, mustChangePw: false },
      })
    })
    return new Result(null, 'Пароль изменён')
  }

  /** Возвращает новый токен: в старом mustChangePw ещё true. */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmNewPassword) throw new BadRequestException('Пароли не совпадают')
    const acc = await this.prisma.account.findUnique({ where: { id: userId } })
    if (!acc) throw new UnauthorizedException()
    if (!(await bcrypt.compare(dto.currentPassword, acc.passwordHash))) throw new BadRequestException('Текущий пароль неверный')
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('Новый пароль должен отличаться от текущего')

    const updated = await this.prisma.account.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS), mustChangePw: false },
    })
    return new Result(await this.signAccessToken(updated), 'Пароль изменён')
  }
}
