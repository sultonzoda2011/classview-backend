import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import * as bcrypt from 'bcrypt'
import { PrismaClient, Role } from '../src/generated/prisma/client'

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? '').trim().toLowerCase()
  const phone = (process.env.SEED_SUPERADMIN_PHONE ?? '').replace(/[\s\-()]/g, '')
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? ''
  if (!email || !phone || password.length < 8) {
    throw new Error('Задайте SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PHONE и SEED_SUPERADMIN_PASSWORD (минимум 8 символов)')
  }
  const exists = await prisma.account.findUnique({ where: { email } })
  if (exists) {
    console.log(`SuperAdmin ${email} уже существует, пропускаю`)
  } else {
    await prisma.account.create({
      data: {
        fullName: process.env.SEED_SUPERADMIN_NAME ?? 'Super Admin',
        email,
        phoneNumber: phone,
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePw: false,
        role: Role.SuperAdmin,
      },
    })
    console.log(`SuperAdmin ${email} создан`)
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
