import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { isWithinWindow, secondsNow, toMinutes } from './access-window'

const at = (iso: string) => new Date(iso)

test('toMinutes парсит HH:mm и HH:mm:ss', () => {
  assert.equal(toMinutes('09:30'), 570)
  assert.equal(toMinutes('09:30:15'), 570)
  assert.equal(toMinutes('25:00'), null)
  assert.equal(toMinutes(null), null)
})

test('окно внутри суток (Asia/Dushanbe = UTC+5)', () => {
  assert.equal(isWithinWindow('09:00', '17:00', 'Asia/Dushanbe', at('2026-10-09T10:00:00Z')), true)
  assert.equal(isWithinWindow('09:00', '17:00', 'Asia/Dushanbe', at('2026-10-09T13:00:00Z')), false)
})

test('окно через полночь', () => {
  assert.equal(isWithinWindow('22:00', '02:00', 'Asia/Dushanbe', at('2026-10-09T18:00:00Z')), true)
  assert.equal(isWithinWindow('22:00', '02:00', 'Asia/Dushanbe', at('2026-10-09T07:00:00Z')), false)
})

test('без окна доступа нет', () => {
  assert.equal(isWithinWindow(null, null, 'Asia/Dushanbe'), false)
})


test('secondsNow keeps second-level precision in the configured timezone', () => {
  assert.equal(secondsNow('Asia/Dushanbe', at('2026-10-09T04:05:06.123Z')), 9 * 3600 + 5 * 60 + 6)
})
