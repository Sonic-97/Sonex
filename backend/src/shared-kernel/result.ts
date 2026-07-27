export type Success<T> = Readonly<{ ok: true; value: T }>;
export type Failure<E> = Readonly<{ ok: false; error: E }>;
export type Result<T, E> = Success<T> | Failure<E>;
export const success = <T>(value: T): Success<T> => Object.freeze({ ok: true, value });
export const failure = <E>(error: E): Failure<E> => Object.freeze({ ok: false, error });
export function unwrap<T, E>(result: Result<T, E>): T { if (result.ok === true) return result.value; throw result.error; }
