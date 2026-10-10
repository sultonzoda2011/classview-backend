# ClassView Backend

Backend для [classview](https://github.com/sultonzoda2011/classview) : NestJS +
Prisma 7 + PostgreSQL. Контракт API совпадает с тем, что ждёт фронт: префикс
`/api`, роуты `/Account`, `/Centers`, `/ClassRooms`, `/Users`, ответы
`{ statusCode, data, message }`.

## Быстрый старт

```bash
cp .env.example .env        # заполните JWT_SECRET, MAIL_*, SEED_*
docker compose up -d db     # или свой PostgreSQL, тогда поправьте DATABASE_URL
npm install                 # postinstall генерирует Prisma-клиент
npx prisma migrate deploy   # применить миграции (в dev: npm run prisma:migrate)
npm run seed                # создать первого SuperAdmin из SEED_* переменных
npm run start:dev           # http://localhost:5990/api, Swagger: /api/docs
```

Полный запуск в Docker: `docker compose up -d --build` (миграции применяются при
старте контейнера).

## Роли

| Роль              | Что может                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SuperAdmin`      | всё: центры (создание/удаление), любые классы, родители, сотрудники                                                      |
| `Admin`           | только свой центр: классы, родители, создание Admin-сотрудников; центр может редактировать, но не создавать и не удалять |
| `User` (родитель) | свой профиль, свой класс (без адреса камеры), просмотр потока                                                            |

SuperAdmin нельзя создать через API, только `npm run seed`. Роль и центр
проверяются по БД при каждом запросе, а не по токену.

## Эндпоинты

| Метод             | Путь                                          | Доступ                                                                                 |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| POST              | `/Account/login`                              | публичный; `{phoneOrUserName, password}`, логин по email, телефону или username        |
| POST              | `/Account/send-otp`                           | публичный; `{email}`, код на почту (Gmail SMTP), 5 минут, повтор не чаще раза в минуту |
| POST              | `/Account/verify-otp`                         | публичный; `{email, otpCode}` -> reset-токен (10 минут)                                |
| POST              | `/Account/reset-password`                     | публичный; `{email, token, newPassword, confirmNewPassword}`                           |
| POST              | `/Account/change-password`                    | авторизованный; возвращает новый токен                                                 |
| GET, POST         | `/Centers`                                    | Admin, SuperAdmin (POST только SuperAdmin)                                             |
| PUT               | `/Centers/:id`                                | Admin (свой), SuperAdmin                                                               |
| DELETE            | `/Centers/:id`                                | SuperAdmin                                                                             |
| GET               | `/ClassRooms`                                 | все (родитель видит только свой класс, `cameraUrl` скрыт)                              |
| POST, PUT, DELETE | `/ClassRooms[/:id]`                           | Admin (свой центр), SuperAdmin                                                         |
| GET, POST         | `/Users`                                      | Admin, SuperAdmin                                                                      |
| POST              | `/Users/create-employee`                      | Admin, SuperAdmin; создаёт Admin                                                       |
| GET               | `/Users/:id`                                  | свой профиль / Admin своего центра / SuperAdmin                                        |
| PUT, DELETE       | `/Users/:id`                                  | Admin своего центра, SuperAdmin                                                        |
| GET               | `/Streams/playlist.m3u8`                      | User; подписанная ссылка на HLS-поток своего класса                                    |
| GET               | `/Streams/:classRoomId/playlist.m3u8`         | Admin (свой центр), SuperAdmin                                                         |
| GET               | `/Streams/files/:classRoomId/:exp/:sig/:file` | публичный, защищён подписью                                                            |
| GET               | `/health`                                     | публичный                                                                              |

Новому пользователю генерируется временный пароль и отправляется на email. Пока
пароль не сменён, API блокирует все рабочие эндпоинты, кроме `/Account/change-password`; статус берётся из БД. `startTime`/`endTime`
у родителя это ежедневное окно просмотра в формате `HH:mm` (часовой пояс
`APP_TIMEZONE`).

Ответ `POST /Users` и `POST /Users/create-employee` содержит поле `data.mailSent:
boolean` — удалось ли отправить письмо с паролем. Это отдельное поле, а не часть
текста `message` (который всегда "Success"), чтобы фронт мог сам показать
результат на любом из своих языков, не завися от русского текста с сервера.

## Gmail для писем

Google Account -> Security -> включить 2-Step Verification -> App passwords ->
создать пароль и записать в `MAIL_APP_PASSWORD`, адрес в `MAIL_USER`. Без этих
переменных письма не отправляются, а в dev-режиме печатаются в консоль.

## Проверка

```bash
npm test          # юнит-тесты (окно доступа)
npm run build
```

### e2e

Полный прогон поверх реально поднятого API: логин, роли, центры/классы/сотрудники,
очистка. Нужен поднятый сервер с применённой миграцией и выполненным `npm run seed`:

```bash
npm run build
npm run seed
node dist/main.js &
npm run test:e2e
```

Гоняется в CI (`.github/workflows/ci.yml`) на каждый push/PR с Postgres-сервисом.

## Стримы

Камера (RTSP/HTTP) конвертируется FFmpeg в HLS (`-c:v copy`, без перекодирования
видео). Процесс стартует при первом запросе и останавливается через 60 секунд
без зрителей. Эндпоинты `playlist.m3u8` возвращают JSON
`{data: "/api/Streams/files/..."}`, а сами сегменты отдаются по ссылке с
подписью в пути (тег `<video>` не умеет слать `Authorization`). Родителю ссылка
выдаётся, только если `connect = true` и сейчас внутри его окна
`startTime-endTime`; срок ссылки не больше конца окна. Нужен установленный
`ffmpeg` (в Docker-образе уже есть). Браузеры играют только H.264: если камера
отдаёт H.265, переключите её на H.264 в настройках камеры.
