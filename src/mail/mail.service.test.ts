import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { ConfigService } from '@nestjs/config'
import { MailService } from './mail.service'

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService
}

test('production requires SMTP credentials at startup', () => {
  assert.throws(
    () => new MailService(config({ NODE_ENV: 'production' })),
    /MAIL_USER \/ MAIL_APP_PASSWORD/,
  )
})

test('development may run without SMTP and logs outgoing messages locally', () => {
  assert.doesNotThrow(() => new MailService(config({ NODE_ENV: 'development' })))
})

test('production accepts configured SMTP credentials', () => {
  assert.doesNotThrow(
    () => new MailService(config({
      NODE_ENV: 'production',
      MAIL_USER: 'noreply@example.com',
      MAIL_APP_PASSWORD: 'test-app-password',
    })),
  )
})
