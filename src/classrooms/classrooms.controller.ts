import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser, Roles } from '../common/decorators'
import { Result } from '../common/result'
import { Role } from '../generated/prisma/client'
import { ClassRoomsService } from './classrooms.service'
import { CreateClassRoomDto, UpdateClassRoomDto } from './dto'

@ApiTags('ClassRooms')
@ApiBearerAuth()
@Controller('ClassRooms')
export class ClassRoomsController {
  constructor(private readonly rooms: ClassRoomsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.rooms.findAll(user)
  }

  @Roles(Role.Admin, Role.SuperAdmin)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClassRoomDto) {
    return this.rooms.create(user, dto)
  }

  @Roles(Role.Admin, Role.SuperAdmin)
  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClassRoomDto) {
    return this.rooms.update(user, id, dto)
  }

  @Roles(Role.Admin, Role.SuperAdmin) @HttpCode(200)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.rooms.remove(user, id)
    return new Result(null, 'Класс удалён')
  }
}
