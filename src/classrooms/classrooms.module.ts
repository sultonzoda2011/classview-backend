import { Module } from '@nestjs/common'
import { StreamsModule } from '../streams/streams.module'
import { ClassRoomsController } from './classrooms.controller'
import { ClassRoomsService } from './classrooms.service'

@Module({ imports: [StreamsModule], controllers: [ClassRoomsController], providers: [ClassRoomsService], exports: [ClassRoomsService] })
export class ClassRoomsModule {}
