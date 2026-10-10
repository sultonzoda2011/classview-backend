#!/usr/bin/env node
/**
 * Интеграционный e2e-прогон поверх реально поднятого API (см. README -> "Тесты").
 * Требует: PostgreSQL с применённой миграцией, сервер запущен на $PORT (по умолчанию 5990)
 * с SEED_SUPERADMIN_EMAIL=admin@example.com и SEED_SUPERADMIN_PASSWORD=ChangeMe123 (из .env.test),
 * и выполненный `npm run seed`.
 * Запуск: node test/e2e.mjs
 */
const PORT = process.env.PORT ?? 5990
const B = `http://localhost:${PORT}/api`
const SA_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@example.com'
const SA_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe123'

let fails = 0
const ok = (name, cond, extra = '') => {
  if (!cond) fails++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`)
}
const req = async (method, path, body, token) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { s: r.status, j: await r.json().catch(() => null) }
}
const unique = () => Math.random().toString(36).slice(2, 8)
const uniqueDigits = () => String(Math.floor(100000 + Math.random() * 900000))

async function main() {
  let r = await req('GET', '/health')
  ok('health -> 200', r.s === 200, JSON.stringify(r))

  r = await req('POST', '/Account/login', { phoneOrUserName: SA_EMAIL, password: 'wrong' })
  ok('login wrong password -> 401', r.s === 401)

  r = await req('POST', '/Account/login', { phoneOrUserName: SA_EMAIL, password: SA_PASSWORD })
  const SA = r.j?.data
  ok('login SuperAdmin -> token', r.s === 200 && typeof SA === 'string', JSON.stringify(r))
  if (!SA) {
    console.log(`\n${fails} FAILED (нет токена SuperAdmin, дальнейшие тесты пропущены)`)
    process.exit(1)
  }

  const suffix = unique()
  r = await req('POST', '/Centers', { name: `E2E Center ${suffix}`, address: 'Addr' }, SA)
  ok('create center', r.s < 300, JSON.stringify(r))
  const centerId = r.j?.data?.id

  r = await req('GET', '/Centers', null, SA)
  ok('list centers includes created', r.s === 200 && r.j.data.some((c) => c.id === centerId))

  r = await req('POST', '/ClassRooms', { name: `Room ${suffix}`, cameraUrl: 'rtsp://10.0.0.1/stream', centerId }, SA)
  ok('create classroom', r.s < 300, JSON.stringify(r))
  const roomId = r.j?.data?.id

  r = await req('POST', '/ClassRooms', { name: 'bad', cameraUrl: 'not-a-url', centerId }, SA)
  ok('invalid cameraUrl -> 400', r.s === 400)

  r = await req('POST', '/Users/create-employee', {
    fullName: 'E2E Employee',
    phoneNumber: `+992${uniqueDigits()}`,
    email: `employee.${suffix}@example.com`,
    role: 'Admin',
    centerId,
  }, SA)
  ok('create employee (Admin)', r.s < 300 && r.j.data.role === 'Admin', JSON.stringify(r))
  ok('response exposes mailSent as a field, not baked into a Russian message', typeof r.j?.data?.mailSent === 'boolean', JSON.stringify(r))
  const employeeId = r.j?.data?.id

  r = await req('GET', '/Users', null, SA)
  ok('GET /Users requires Admin/SuperAdmin role (SuperAdmin ok)', r.s === 200)

  r = await req('GET', '/ClassRooms')
  ok('no token -> 401', r.s === 401)

  // центр с привязанными аккаунтами удалить нельзя (сервер это намеренно запрещает) —
  // сначала убираем сотрудника и класс, только потом сам центр
  r = await req('DELETE', `/Users/${employeeId}`, null, SA)
  ok('cleanup: delete employee', r.s === 200, JSON.stringify(r))
  r = await req('DELETE', `/ClassRooms/${roomId}`, null, SA)
  ok('cleanup: delete classroom', r.s === 200)
  r = await req('DELETE', `/Centers/${centerId}`, null, SA)
  ok('cleanup: delete center', r.s === 200, JSON.stringify(r))

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
  process.exit(fails ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
