import { Module } from '@nestjs/common'
import { ClassRoomsController } from './classrooms.controller'
import { ClassRoomsService } from './classrooms.service'

@Module({ controllers: [ClassRoomsController], providers: [ClassRoomsService], exports: [ClassRoomsService] })
export class ClassRoomsModule {}
