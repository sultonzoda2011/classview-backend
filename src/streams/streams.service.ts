import { BadGatewayException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ChildProcess, spawn } from 'node:child_process'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isWithinWindow, secondsNow, toMinutes } from '../common/access-window'
import { AuthUser } from '../common/decorators'
import { Role } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'

interface Running {
  proc: ChildProcess
  dir: string
  lastAccess: number
}

const IDLE_MS = 60_000
const START_TIMEOUT_MS = 20_000
const MAX_LINK_SEC = 4 * 3600
export const STREAM_FILE_REGEX = /^(index\.m3u8|seg_\d+\.ts)$/

@Injectable()
export class StreamsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamsService.name)
  private readonly running = new Map<number, Running>()
  private readonly starting = new Map<number, Promise<Running>>()
  private readonly stopping = new Map<number, Promise<void>>()
  private readonly baseDir: string
  private readonly ffmpeg: string
  private readonly tz: string
  private readonly secret: string
  private reaper?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.baseDir = config.get<string>('STREAMS_DIR') ?? join(tmpdir(), 'classview-streams')
    this.ffmpeg = config.get<string>('FFMPEG_PATH') ?? 'ffmpeg'
    this.tz = config.get<string>('APP_TIMEZONE') ?? 'Asia/Dushanbe'
    this.secret = `${config.getOrThrow<string>('JWT_SECRET')}:stream`
  }

  onModuleInit() {
    // Do not recursively delete STREAMS_DIR: deployments may point it at a persistent data directory.
    // A class-specific HLS directory is cleared safely in start() before its FFmpeg process launches.
    mkdirSync(this.baseDir, { recursive: true })
    this.reaper = setInterval(() => this.reapIdle(), 15_000)
  }

  async onModuleDestroy() {
    if (this.reaper) clearInterval(this.reaper)
    await Promise.all([...this.running.keys()].map((id) => this.stop(id)))
  }

  // ---------- подписанные ссылки: /Streams/files/:classRoomId/:exp/:sig/:file ----------

  private sign(classRoomId: number, exp: number) {
    return createHmac('sha256', this.secret).update(`${classRoomId}:${exp}`).digest('hex')
  }

  verifyLink(classRoomId: number, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return false
    const a = Buffer.from(this.sign(classRoomId, exp), 'hex')
    const b = Buffer.from(sig, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private buildLink(classRoomId: number, ttlSec: number) {
    // Respect short parent access windows; a 30-second minimum would leak viewing time past the configured end.
    const ttl = Math.max(1, Math.min(Math.floor(ttlSec), MAX_LINK_SEC))
    const exp = Math.floor(Date.now() / 1000) + ttl
    return `/api/Streams/files/${classRoomId}/${exp}/${this.sign(classRoomId, exp)}/index.m3u8`
  }

  // ---------- доступ ----------

  /** Админ: любой класс своего центра (SuperAdmin: любой) */
  async linkForAdmin(actor: AuthUser, classRoomId: number) {
    const room = await this.prisma.classRoom.findUnique({ where: { id: classRoomId }, select: { id: true, centerId: true, cameraUrl: true } })
    if (!room) throw new NotFoundException('Класс не найден')
    if (actor.role !== Role.SuperAdmin && actor.centerId !== room.centerId) throw new ForbiddenException('Нет доступа к этому классу')
    await this.ensureRunning(room.id, room.cameraUrl)
    return this.buildLink(room.id, MAX_LINK_SEC)
  }

  /** Родитель: свой класс, если доступ включён и сейчас внутри его окна просмотра */
  async linkForUser(actor: AuthUser) {
    const acc = await this.prisma.account.findUnique({
      where: { id: actor.id },
      select: { connect: true, startTime: true, endTime: true, classRoom: { select: { id: true, cameraUrl: true } } },
    })
    if (!acc?.classRoom) throw new NotFoundException('Вам не назначен класс')
    if (!acc.connect) throw new ForbiddenException('Доступ к камере отключён')
    const now = new Date()
    if (!isWithinWindow(acc.startTime, acc.endTime, this.tz, now)) {
      throw new ForbiddenException(`Просмотр доступен с ${acc.startTime ?? '--:--'} до ${acc.endTime ?? '--:--'}`)
    }
    await this.ensureRunning(acc.classRoom.id, acc.classRoom.cameraUrl)
    // The configured HH:mm end is inclusive through its final second.
    const endSecond = toMinutes(acc.endTime)! * 60 + 59
    const currentSecond = secondsNow(this.tz, now)
    const left = endSecond >= currentSecond
      ? endSecond - currentSecond + 1
      : endSecond + 24 * 3600 - currentSecond + 1
    return this.buildLink(acc.classRoom.id, left)
  }

  // ---------- FFmpeg ----------

  touch(classRoomId: number) {
    const r = this.running.get(classRoomId)
    if (r) r.lastAccess = Date.now()
  }

  /** Stop the camera process and clear HLS files when its URL changes or its classroom is deleted. */
  async invalidate(classRoomId: number): Promise<void> {
    const pending = this.starting.get(classRoomId)
    if (pending) await pending.catch(() => undefined)
    await this.stop(classRoomId)
  }

  fileDir(classRoomId: number) {
    return join(this.baseDir, String(classRoomId))
  }

  private async ensureRunning(classRoomId: number, cameraUrl: string): Promise<Running> {
    // Prevent a new FFmpeg process from writing into a directory while its previous owner exits.
    const stopping = this.stopping.get(classRoomId)
    if (stopping) await stopping

    const existing = this.running.get(classRoomId)
    if (existing) {
      existing.lastAccess = Date.now()
      return existing
    }
    let pending = this.starting.get(classRoomId)
    if (!pending) {
      pending = this.start(classRoomId, cameraUrl).finally(() => this.starting.delete(classRoomId))
      this.starting.set(classRoomId, pending)
    }
    return pending
  }

  private start(classRoomId: number, cameraUrl: string): Promise<Running> {
    const dir = this.fileDir(classRoomId)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })

    const args = [
      '-hide_banner', '-loglevel', 'warning',
      ...(cameraUrl.toLowerCase().startsWith('rtsp') ? ['-rtsp_transport', 'tcp'] : []),
      '-i', cameraUrl,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k',
      '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+omit_endlist',
      '-hls_segment_filename', join(dir, 'seg_%05d.ts'),
      join(dir, 'index.m3u8'),
    ]
    const proc = spawn(this.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    const entry: Running = { proc, dir, lastAccess: Date.now() }
    let stderrTail = ''
    proc.stderr?.on('data', (d: Buffer) => (stderrTail = (stderrTail + d.toString()).slice(-500)))

    return new Promise<Running>((resolve, reject) => {
      let settled = false
      const fail = (err: Error) => {
        if (settled) return
        settled = true
        clearInterval(poll)
        clearTimeout(timer)
        proc.kill('SIGKILL')
        rmSync(dir, { recursive: true, force: true })
        reject(err)
      }
      proc.on('error', (e: NodeJS.ErrnoException) =>
        fail(new ServiceUnavailableException(e.code === 'ENOENT' ? 'FFmpeg не установлен на сервере' : `Не удалось запустить FFmpeg: ${e.message}`)),
      )
      proc.on('exit', (code) => {
        if (this.running.get(classRoomId) === entry) this.running.delete(classRoomId)
        if (!settled) {
          this.logger.warn(`FFmpeg (класс ${classRoomId}) завершился с кодом ${code}: ${stderrTail.trim()}`)
          fail(new BadGatewayException('Не удалось подключиться к камере'))
        } else {
          this.logger.log(`FFmpeg (класс ${classRoomId}) остановлен`)
        }
      })
      const poll = setInterval(() => {
        // плейлист появляется после первого готового сегмента
        if (existsSync(join(dir, 'index.m3u8')) && !settled) {
          settled = true
          clearInterval(poll)
          clearTimeout(timer)
          this.running.set(classRoomId, entry)
          this.logger.log(`FFmpeg (класс ${classRoomId}) запущен`)
          resolve(entry)
        }
      }, 300)
      const timer = setTimeout(() => fail(new BadGatewayException('Камера не отвечает')), START_TIMEOUT_MS)
    })
  }

  private stop(classRoomId: number): Promise<void> {
    const pending = this.stopping.get(classRoomId)
    if (pending) return pending

    const r = this.running.get(classRoomId)
    if (!r) return Promise.resolve()
    this.running.delete(classRoomId)

    const stopping = new Promise<void>((resolve) => {
      let settled = false
      let forceKill: NodeJS.Timeout | undefined
      const finish = () => {
        if (settled) return
        settled = true
        if (forceKill) clearTimeout(forceKill)
        r.proc.off('exit', finish)
        rmSync(r.dir, { recursive: true, force: true })
        resolve()
      }

      if (r.proc.exitCode !== null || r.proc.signalCode !== null) {
        finish()
        return
      }

      r.proc.once('exit', finish)
      forceKill = setTimeout(() => {
        r.proc.kill('SIGKILL')
        // Prefer the real exit event before deleting files; keep a bounded fallback in case the OS never reports it.
        forceKill = setTimeout(finish, 1000)
      }, 2000)
      r.proc.kill('SIGTERM')
    })

    const tracked = stopping.finally(() => this.stopping.delete(classRoomId))
    this.stopping.set(classRoomId, tracked)
    return tracked
  }

  private reapIdle() {
    const now = Date.now()
    for (const [id, r] of this.running) if (now - r.lastAccess > IDLE_MS) void this.stop(id)
  }
}
