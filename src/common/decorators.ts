import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import { Role } from '../generated/prisma/client'

export interface AuthUser {
  id: string
  role: Role
  centerId: number | null
  classRoomId: number | null
}

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const ROLES_KEY = 'roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user
})
