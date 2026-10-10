import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ServiceUnavailableException } from '@nestjs/common'
import { Role } from '../generated/prisma/client'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from './users.service'

test('removes a newly created parent account if credential email was not delivered', async () => {
  const created = {
    id: 'new-parent',
    fullName: 'Test Parent',
    childName: 'Test Child',
    phoneNumber: '+992900000001',
    email: 'parent@example.com',
    userName: null,
    role: Role.User,
    connect: false,
    startTime: '09:00',
    endTime: '17:00',
    createdAt: new Date(),
    classRoomId: 2,
    centerId: 1,
  }
  const deleted: string[] = []
  const prisma = {
    center: { findUnique: async () => ({ id: 1 }) },
    classRoom: { findUnique: async () => ({ centerId: 1 }) },
    account: {
      create: async () => created,
      delete: async ({ where }: { where: { id: string } }) => {
        deleted.push(where.id)
        return created
      },
    },
  } as unknown as PrismaService
  const mail = {
    sendCredentials: async () => false,
  } as unknown as MailService
  const service = new UsersService(prisma, mail)

  await assert.rejects(
    () => service.create(
      { id: 'admin', role: Role.SuperAdmin, centerId: null, classRoomId: null },
      {
        fullName: created.fullName,
        childName: created.childName,
        phoneNumber: created.phoneNumber,
        email: created.email,
        connect: false,
        startTime: '09:00',
        endTime: '17:00',
        classRoomId: 2,
        centerId: 1,
      },
    ),
    (error) => error instanceof ServiceUnavailableException && error.getStatus() === 503,
  )
  assert.deepEqual(deleted, ['new-parent'])
})
