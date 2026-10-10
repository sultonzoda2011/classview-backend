import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { MustChangePasswordGuard } from './guards'

function context(user: unknown): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

function guard(allowChange: boolean) {
  return new MustChangePasswordGuard({
    getAllAndOverride: () => allowChange,
  } as unknown as Reflector)
}

test('blocks business endpoints while a temporary password must be changed', () => {
  assert.throws(
    () => guard(false).canActivate(context({ id: 'user-1', mustChangePw: true })),
    (error) => error instanceof ForbiddenException && error.getStatus() === 403,
  )
})

test('allows the change-password endpoint for accounts with temporary passwords', () => {
  assert.equal(guard(true).canActivate(context({ id: 'user-1', mustChangePw: true })), true)
})

test('does not block routes without an authenticated user', () => {
  assert.equal(guard(false).canActivate(context(undefined)), true)
})
