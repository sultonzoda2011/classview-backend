import { Transform } from 'class-transformer'

export const TrimString = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
export const NormalizeEmail = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
export const NormalizePhone = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s\-()]/g, '') : value))
/** "09:30:00" -> "09:30" */
export const NormalizeTime = () =>
  Transform(({ value }) => (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value) ? value.slice(0, 5) : value))

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/
export const PHONE_REGEX = /^\+?\d{7,15}$/
