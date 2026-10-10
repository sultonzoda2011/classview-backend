import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { VerifyOtpDto } from './dto'

test('OTP DTO accepts exactly six digits', async () => {
  const dto = plainToInstance(VerifyOtpDto, { email: ' Test@Example.com ', otpCode: '123456' })
  const errors = await validate(dto)
  assert.equal(errors.length, 0)
  assert.equal(dto.email, 'test@example.com')
})

test('OTP DTO rejects letters even when the value has six characters', async () => {
  const dto = plainToInstance(VerifyOtpDto, { email: 'test@example.com', otpCode: '12a456' })
  const errors = await validate(dto)
  assert.ok(errors.some((error) => error.property === 'otpCode'))
})

test('OTP DTO rejects short codes', async () => {
  const dto = plainToInstance(VerifyOtpDto, { email: 'test@example.com', otpCode: '12345' })
  const errors = await validate(dto)
  assert.ok(errors.some((error) => error.property === 'otpCode'))
})
