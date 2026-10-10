import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly transporter?: nodemailer.Transporter
  private readonly from: string
  private readonly isProd: boolean

  constructor(config: ConfigService) {
    const user = config.get<string>('MAIL_USER')
    const pass = config.get<string>('MAIL_APP_PASSWORD')
    this.isProd = config.get('NODE_ENV') === 'production'
    this.from = config.get<string>('MAIL_FROM') || user || 'ClassView'
    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass },
      })
    } else {
      const message = 'MAIL_USER / MAIL_APP_PASSWORD не заданы: отправка писем отключена'
      if (this.isProd) {
        // Не запускаем production с неработающим восстановлением пароля и доставкой учётных данных.
        throw new Error(`${message}. Укажите обе переменные окружения.`)
      }
      this.logger.warn(`${message}; в dev-режиме письма печатаются в консоль`)
    }
  }

  private async send(to: string, subject: string, text: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      if (this.isProd) {
        // Защита на случай изменения конфигурации/логики после старта приложения.
        throw new Error('Почтовый транспорт не настроен')
      }
      this.logger.log(`[DEV MAIL] to=${to} subject="${subject}"\n${text}`)
      return false
    }
    const info = await this.transporter.sendMail({ from: this.from, to, subject, text, html })
    // Nodemailer may resolve even when the SMTP server rejects every recipient.
    return (info.accepted?.length ?? 0) > 0
  }

  async sendOtp(email: string, code: string) {
    const text = `Ваш код для сброса пароля ClassView: ${code}\nКод действует 5 минут. Если вы не запрашивали сброс, просто проигнорируйте письмо.`
    const html = `<p>Ваш код для сброса пароля <b>ClassView</b>:</p><h2 style="letter-spacing:4px">${code}</h2><p>Код действует 5 минут. Если вы не запрашивали сброс, просто проигнорируйте письмо.</p>`
    const sent = await this.send(email, 'ClassView: код подтверждения', text, html)
    if (this.isProd && !sent) throw new Error('SMTP-сервер не принял письмо с OTP')
    return sent
  }

  async sendCredentials(email: string, fullName: string, login: string, password: string) {
    const text = `Здравствуйте, ${fullName}!\nВаш аккаунт в ClassView создан.\nЛогин: ${login} (или email, или телефон)\nВременный пароль: ${password}\nПосле первого входа смените пароль.`
    const html = `<p>Здравствуйте, ${esc(fullName)}!</p><p>Ваш аккаунт в <b>ClassView</b> создан.</p><p>Логин: <b>${esc(login)}</b> (или email, или телефон)<br>Временный пароль: <b>${esc(password)}</b></p><p>После первого входа смените пароль.</p>`
    return this.send(email, 'ClassView: данные для входа', text, html)
  }
}
