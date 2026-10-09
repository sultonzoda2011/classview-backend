import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthUser } from '../common/decorators'
import { PrismaService } from '../prisma/prisma.service'

interface JwtPayload {
  nameid?: string
  purpose?: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    })
  }

  /** Роль и центр берём из БД, а не из токена: смена роли и удаление аккаунта действуют сразу. */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload.nameid || payload.purpose) throw new UnauthorizedException('Недействительный токен')
    const acc = await this.prisma.account.findUnique({
      where: { id: payload.nameid },
      select: { id: true, role: true, centerId: true, classRoomId: true },
    })
    if (!acc) throw new UnauthorizedException('Пользователь не найден')
    return acc
  }
}
