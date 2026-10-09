import { Body, Controller, Delete, Get, HttpCode, ParseIntPipe, Post, Put, Param } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser, Roles } from '../common/decorators'
import { Result } from '../common/result'
import { Role } from '../generated/prisma/client'
import { CentersService } from './centers.service'
import { CreateCenterDto, UpdateCenterDto } from './dto'

@ApiTags('Centers')
@ApiBearerAuth()
@Roles(Role.Admin, Role.SuperAdmin)
@Controller('Centers')
export class CentersController {
  constructor(private readonly centers: CentersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.centers.findAll(user)
  }

  @Roles(Role.SuperAdmin)
  @Post()
  create(@Body() dto: CreateCenterDto) {
    return this.centers.create(dto)
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCenterDto) {
    return this.centers.update(user, id, dto)
  }

  @Roles(Role.SuperAdmin) @HttpCode(200)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.centers.remove(id)
    return new Result(null, 'Центр удалён')
  }
}
