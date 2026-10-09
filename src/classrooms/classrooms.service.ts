import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { AuthUser } from '../common/decorators'
import { Role } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateClassRoomDto, UpdateClassRoomDto } from './dto'

const select = { id: true, name: true, centerId: true, cameraUrl: true } as const

@Injectable()
export class ClassRoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: AuthUser) {
    if (actor.role === Role.User) {
      if (actor.classRoomId == null) return []
      const rooms = await this.prisma.classRoom.findMany({ where: { id: actor.classRoomId }, select })
      // адрес камеры родителям не показываем (в нём могут быть логин и пароль камеры)
      return rooms.map((r) => ({ ...r, cameraUrl: '' }))
    }
    return this.prisma.classRoom.findMany({
      where: actor.role === Role.SuperAdmin ? {} : { centerId: actor.centerId ?? -1 },
      select,
      orderBy: { id: 'asc' },
    })
  }

  private assertCenter(actor: AuthUser, centerId: number) {
    if (actor.role !== Role.SuperAdmin && actor.centerId !== centerId) throw new ForbiddenException('Нет доступа к этому центру')
  }

  async create(actor: AuthUser, dto: CreateClassRoomDto) {
    this.assertCenter(actor, dto.centerId)
    const center = await this.prisma.center.findUnique({ where: { id: dto.centerId }, select: { id: true } })
    if (!center) throw new BadRequestException('Центр не найден')
    return this.prisma.classRoom.create({ data: dto, select })
  }

  private async getScoped(actor: AuthUser, id: number) {
    const room = await this.prisma.classRoom.findUnique({ where: { id }, select })
    if (!room) throw new NotFoundException('Класс не найден')
    this.assertCenter(actor, room.centerId)
    return room
  }

  async update(actor: AuthUser, id: number, dto: UpdateClassRoomDto) {
    await this.getScoped(actor, id)
    if (dto.centerId !== undefined) {
      this.assertCenter(actor, dto.centerId)
      const center = await this.prisma.center.findUnique({ where: { id: dto.centerId }, select: { id: true } })
      if (!center) throw new BadRequestException('Центр не найден')
    }
    return this.prisma.classRoom.update({ where: { id }, data: dto, select })
  }

  async remove(actor: AuthUser, id: number) {
    await this.getScoped(actor, id)
    await this.prisma.classRoom.delete({ where: { id } })
  }
}
