/** "HH:mm" или "HH:mm:ss" -> минуты от полуночи. null если формат неверный. */
export function toMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Текущее время суток (в минутах) в заданном часовом поясе. */
export function minutesNow(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/**
 * Попадает ли текущее время в ежедневное окно [start, end].
 * Окно через полночь (22:00-02:00) тоже поддерживается. Нет окна = доступа нет.
 */
export function isWithinWindow(start: string | null, end: string | null, timeZone: string, now = new Date()): boolean {
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s === null || e === null) return false
  const cur = minutesNow(timeZone, now)
  return s <= e ? cur >= s && cur <= e : cur >= s || cur <= e
}


/** Current local time in seconds since midnight for an exact access-window expiry. */
export function secondsNow(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const s = Number(parts.find((p) => p.type === 'second')?.value ?? 0)
  return h * 3600 + m * 60 + s
}
