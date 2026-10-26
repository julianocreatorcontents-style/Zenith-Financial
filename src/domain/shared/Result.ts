export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(
  r: Result<T, E>,
): r is { readonly ok: true; readonly value: T } {
  return r.ok === true;
}

export function isErr<T, E>(
  r: Result<T, E>,
): r is { readonly ok: false; readonly error: E } {
  return r.ok === false;
}

export function map<T, U, E>(
  r: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (r.ok) {
    return ok(fn(r.value));
  }
  return err((r as { readonly ok: false; readonly error: E }).error);
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) {
    return r.value;
  }
  throw (r as { readonly ok: false; readonly error: E }).error;
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  if (r.ok) {
    return r.value;
  }
  return fallback;
}
