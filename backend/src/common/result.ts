export class Result<T, E = string> {
  private constructor(
    public readonly isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  public get value(): T {
    if (!this.isSuccess) {
      throw new Error(`Cannot retrieve value from a failed Result: ${this._error}`);
    }
    return this._value!;
  }

  public get error(): E {
    if (this.isSuccess) {
      throw new Error(`Cannot retrieve error from a successful Result.`);
    }
    return this._error!;
  }

  public static ok<T, E = string>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  public static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }
}
