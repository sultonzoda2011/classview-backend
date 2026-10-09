import { BadRequestException, Controller, Get, NotFoundException, Param, ParseIntPipe, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators'
import { Role } from '../generated/prisma/client'
import { STREAM_FILE_REGEX, StreamsService } from './streams.service'

@ApiTags('Streams')
@Controller('Streams')
export class StreamsController {
  constructor(private readonly streams: StreamsService) {}

  /** Родитель: ссылка на поток своего класса */
  @ApiBearerAuth() @Roles(Role.User)
  @Get('playlist.m3u8')
  forUser(@CurrentUser() user: AuthUser) {
    return this.streams.linkForUser(user)
  }

  /** Публичный, но защищён подписью в пути (тег <video> не умеет слать Authorization) */
  @Public()
  @Get('files/:classRoomId/:exp/:sig/:file')
  file(
    @Param('classRoomId', ParseIntPipe) classRoomId: number,
    @Param('exp', ParseIntPipe) exp: number,
    @Param('sig') sig: string,
    @Param('file') file: string,
    @Res() res: Response,
  ) {
    if (!STREAM_FILE_REGEX.test(file) || !/^[0-9a-f]{64}$/.test(sig) || !this.streams.verifyLink(classRoomId, exp, sig)) {
      throw new BadRequestException('Ссылка недействительна или просрочена')
    }
    const path = join(this.streams.fileDir(classRoomId), file)
    if (!existsSync(path)) throw new NotFoundException('Поток не найден')
    this.streams.touch(classRoomId)
    res.setHeader('Cache-Control', file.endsWith('.m3u8') ? 'no-store' : 'public, max-age=30')
    res.type(file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t')
    res.sendFile(path)
  }

  /** Админ: ссылка на поток любого класса своего центра */
  @ApiBearerAuth() @Roles(Role.Admin, Role.SuperAdmin)
  @Get(':classRoomId/playlist.m3u8')
  forAdmin(@CurrentUser() user: AuthUser, @Param('classRoomId', ParseIntPipe) classRoomId: number) {
    return this.streams.linkForAdmin(user, classRoomId)
  }
}
