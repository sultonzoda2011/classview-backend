import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { Response } from 'express'

const PRISMA_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Запись с такими данными уже существует' },
  P2003: { status: HttpStatus.CONFLICT, message: 'Есть связанные записи, сначала удалите или перенесите их' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Запись не найдена' },
}

/** Все ошибки отдаём в том же формате: { statusCode, data: null, message }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception')

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Внутренняя ошибка сервера'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse()
      const raw = typeof body === 'string' ? body : (body as { message?: string | string[] }).message
      message = Array.isArray(raw) ? raw.join('; ') : (raw ?? exception.message)
    } else {
      const code = (exception as { code?: string })?.code
      const mapped = code ? PRISMA_MAP[code] : undefined
      if (mapped) {
        status = mapped.status
        message = mapped.message
      } else {
        this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception))
      }
    }

    res.status(status).json({ statusCode: status, data: null, message })
  }
}
