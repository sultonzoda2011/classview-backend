import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { AuthUser } from '../common/decorators'
import { Role } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateCenterDto, UpdateCenterDto } from './dto'

const select = { id: true, name: true, address: true } as const

@Injectable()
export class CentersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(actor: AuthUser) {
    return this.prisma.center.findMany({
      where: actor.role === Role.SuperAdmin ? {} : { id: actor.centerId ?? -1 },
      select,
      orderBy: { id: 'asc' },
    })
  }

  create(dto: CreateCenterDto) {
    return this.prisma.center.create({ data: dto, select })
  }

  async update(actor: AuthUser, id: number, dto: UpdateCenterDto) {
    if (actor.role !== Role.SuperAdmin && actor.centerId !== id) throw new ForbiddenException('Нет доступа к этому центру')
    const exists = await this.prisma.center.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException('Центр не найден')
    return this.prisma.center.update({ where: { id }, data: dto, select })
  }

  async remove(id: number) {
    const exists = await this.prisma.center.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException('Центр не найден')
    await this.prisma.center.delete({ where: { id } })
  }
}
