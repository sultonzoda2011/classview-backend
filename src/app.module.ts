import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard, RolesGuard } from './auth/guards'
import { CentersModule } from './centers/centers.module'
import { ClassRoomsModule } from './classrooms/classrooms.module'
import { ResponseInterceptor } from './common/response.interceptor'
import { HealthController } from './health/health.controller'
import { MailModule } from './mail/mail.module'
import { PrismaModule } from './prisma/prisma.module'
import { StreamsModule } from './streams/streams.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    CentersModule,
    ClassRoomsModule,
    StreamsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
