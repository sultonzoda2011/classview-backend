import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser, Roles } from '../common/decorators'
import { Result } from '../common/result'
import { Role } from '../generated/prisma/client'
import { CreateEmployeeDto, CreateUserDto, UpdateUserDto } from './dto'
import { UsersService } from './users.service'

// mailSent — отдельное поле в data, а не зашито в message: фронт сам решает, как это показать на любом языке
const created = <T extends object>(r: { user: T; mailSent: boolean }) => new Result({ ...r.user, mailSent: r.mailSent }, 'Success')

@ApiTags('Users')
@ApiBearerAuth()
@Controller('Users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.Admin, Role.SuperAdmin)
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.users.findAll(user)
  }

  // объявлен раньше ':id', чтобы не перехватывался параметром
  @Roles(Role.Admin, Role.SuperAdmin)
  @Post('create-employee')
  async createEmployee(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return created(await this.users.createEmployee(user, dto))
  }

  @Roles(Role.Admin, Role.SuperAdmin)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return created(await this.users.create(user, dto))
  }

  /** Любой авторизованный: родитель видит только себя, админ свой центр */
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(user, id)
  }

  @Roles(Role.Admin, Role.SuperAdmin)
  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto)
  }

  @Roles(Role.Admin, Role.SuperAdmin) @HttpCode(200)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.remove(user, id)
    return new Result(null, 'Пользователь удалён')
  }
}
