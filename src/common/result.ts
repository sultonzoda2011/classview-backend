/** Ответ контроллера с кастомным сообщением. Обычные значения оборачиваются автоматически. */
export class Result<T = unknown> {
  constructor(
    public readonly data: T,
    public readonly message = 'Success',
  ) {}
}
