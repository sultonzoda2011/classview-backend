import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common'
import { Response } from 'express'
import { map, Observable } from 'rxjs'
import { Result } from './result'

/** Приводит все успешные ответы к формату фронта: { statusCode, data, message }. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        if (payload instanceof StreamableFile) return payload
        const res = context.switchToHttp().getResponse<Response>()
        const statusCode = res.statusCode
        if (payload instanceof Result) {
          return { statusCode, data: payload.data ?? null, message: payload.message }
        }
        return { statusCode, data: payload ?? null, message: 'Success' }
      }),
    )
  }
}
