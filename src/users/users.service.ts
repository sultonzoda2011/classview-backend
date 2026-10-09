import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { randomInt } from 'node:crypto'
import { AuthUser } from '../common/decorators'
import { Prisma, Role } from '../generated/prisma/client'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { CreateEmployeeDto, CreateUserDto, UpdateUserDto } from './dto'

const select = {
  id: true,
  fullName: true,
  childName: true,
  phoneNumber: true,
  email: true,
  userName: true,
  role: true,
  connect: true,
  startTime: true,
  endTime: true,
  createdAt: true,
  classRoomId: true,
  centerId: true,
} satisfies Prisma.AccountSelect

type UserView = Prisma.AccountGetPayload<{ select: typeof select }>

// без похожих символов (0/O, 1/l/I)
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const generatePassword = (len = 10) => Array.from({ length: len }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('')

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Фронт ждёт childName строкой */
  private view(u: UserView) {
    return { ...u, childName: u.childName ?? '' }
  }

  private isAdminLike(actor: AuthUser) {
    return actor.role === Role.Admin || actor.role === Role.SuperAdmin
  }

  /** Центр, в котором actor имеет право работать */
  private resolveCenter(actor: AuthUser, requested?: number): number {
    if (actor.role === Role.Admin) {
      if (actor.centerId == null) throw new ForbiddenException('Админ не привязан к центру')
      if (requested !== undefined && requested !== actor.centerId) throw new ForbiddenException('Нет доступа к этому центру')
      return actor.centerId
    }
    if (requested === undefined) throw new BadRequestException('Укажите центр')
    return requested
  }

  private async assertClassRoomInCenter(classRoomId: number, centerId: number) {
    const room = await this.prisma.classRoom.findUnique({ where: { id: classRoomId }, select: { centerId: true } })
    if (!room) throw new BadRequestException('Класс не найден')
    if (room.centerId !== centerId) throw new BadRequestException('Класс принадлежит другому центру')
  }

  private async assertCenterExists(centerId: number) {
    const c = await this.prisma.center.findUnique({ where: { id: centerId }, select: { id: true } })
    if (!c) throw new BadRequestException('Центр не найден')
  }

  /** Только родители (role=User); Admin видит свой центр, SuperAdmin всех */
  async findAll(actor: AuthUser) {
    const rows = await this.prisma.account.findMany({
      where: { role: Role.User, ...(actor.role === Role.Admin ? { centerId: actor.centerId ?? -1 } : {}) },
      select,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.view(r))
  }

  async findOne(actor: AuthUser, id: string) {
    const target = await this.prisma.account.findUnique({ where: { id }, select })
    if (!target) throw new NotFoundException('Пользователь не найден')
    const self = target.id === actor.id
    const sameCenterAdmin = actor.role === Role.Admin && target.centerId === actor.centerId
    if (!self && actor.role !== Role.SuperAdmin && !sameCenterAdmin) throw new ForbiddenException('Нет доступа')
    return this.view(target)
  }

  private async sendCredentials(email: string, fullName: string, password: string) {
    try {
      await this.mail.sendCredentials(email, fullName, email, password)
      return true
    } catch (e) {
      this.logger.error(`Не удалось отправить данные для входа на ${email}: ${(e as Error).message}`)
      return false
    }
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const centerId = this.resolveCenter(actor, dto.centerId)
    await this.assertCenterExists(centerId)
    await this.assertClassRoomInCenter(dto.classRoomId, centerId)

    const password = generatePassword()
    const created = await this.prisma.account.create({
      data: {
        fullName: dto.fullName,
        childName: dto.childName,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePw: true,
        role: Role.User,
        connect: dto.connect,
        startTime: dto.startTime,
        endTime: dto.endTime,
        classRoomId: dto.classRoomId,
        centerId,
      },
      select,
    })
    const sent = await this.sendCredentials(created.email, created.fullName, password)
    return { user: this.view(created), mailSent: sent }
  }

  async createEmployee(actor: AuthUser, dto: CreateEmployeeDto) {
    const centerId = this.resolveCenter(actor, dto.centerId)
    await this.assertCenterExists(centerId)

    const password = generatePassword()
    const created = await this.prisma.account.create({
      data: {
        fullName: dto.fullName,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePw: true,
        role: Role.Admin,
        centerId,
      },
      select,
    })
    const sent = await this.sendCredentials(created.email, created.fullName, password)
    return { user: this.view(created), mailSent: sent }
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.account.findUnique({ where: { id }, select: { id: true, role: true, centerId: true, classRoomId: true } })
    if (!target) throw new NotFoundException('Пользователь не найден')
    if (target.role !== Role.User) throw new ForbiddenException('Редактировать можно только родителей')
    if (actor.role === Role.Admin && target.centerId !== actor.centerId) throw new ForbiddenException('Нет доступа')

    // центр меняет только SuperAdmin; Admin может лишь «передать» свой же центр
    const nextCenter = dto.centerId !== undefined ? this.resolveCenter(actor, dto.centerId) : target.centerId
    if (nextCenter == null) throw new BadRequestException('Укажите центр')
    if (dto.centerId !== undefined) await this.assertCenterExists(nextCenter)

    const nextRoom = dto.classRoomId ?? target.classRoomId
    if (nextRoom != null && (dto.classRoomId !== undefined || dto.centerId !== undefined)) {
      await this.assertClassRoomInCenter(nextRoom, nextCenter)
    }

    const updated = await this.prisma.account.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        childName: dto.childName,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
        connect: dto.connect,
        startTime: dto.startTime,
        endTime: dto.endTime,
        classRoomId: dto.classRoomId,
        centerId: dto.centerId !== undefined ? nextCenter : undefined,
      },
      select,
    })
    return this.view(updated)
  }

  async remove(actor: AuthUser, id: string) {
    if (id === actor.id) throw new BadRequestException('Нельзя удалить самого себя')
    const target = await this.prisma.account.findUnique({ where: { id }, select: { role: true, centerId: true } })
    if (!target) throw new NotFoundException('Пользователь не найден')
    if (target.role === Role.SuperAdmin) throw new ForbiddenException('SuperAdmin удалить нельзя')
    if (actor.role === Role.Admin && (target.role !== Role.User || target.centerId !== actor.centerId)) {
      throw new ForbiddenException('Нет доступа')
    }
    await this.prisma.account.delete({ where: { id } })
  }
}
