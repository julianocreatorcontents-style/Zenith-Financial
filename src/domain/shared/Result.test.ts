import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr } from './Result';

describe('ok / err', () => {
  it('ok(42) tem ok=true e value=42', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('err preserva o erro', () => {
    const e = new Error('falhou');
    const r = err(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(e);
  });
});

describe('isOk / isErr', () => {
  it('isOk(ok) = true, isErr(ok) = false', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
  });

  it('isOk(err) = false, isErr(err) = true', () => {
    const r = err(new Error('x'));
    expect(isOk(r)).toBe(false);
    expect(isErr(r)).toBe(true);
  });

  it('refinamento de tipo funciona', () => {
    const r = ok('hello');
    if (isOk(r)) {
      expect(r.value.toUpperCase()).toBe('HELLO');
    }
  });
});

import { unwrap, unwrapOr, map } from './Result';

describe('unwrap / unwrapOr', () => {
  it('unwrap(ok(42)) = 42', () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it('unwrap(err) lança o erro', () => {
    expect(() => unwrap(err(new Error('falhou')))).toThrow('falhou');
  });

  it('unwrapOr(ok(42), 0) = 42', () => {
    expect(unwrapOr(ok(42), 0)).toBe(42);
  });

  it('unwrapOr(err, 0) = 0', () => {
    expect(unwrapOr(err(new Error('x')), 0)).toBe(0);
  });
});

describe('map', () => {
  it('map(ok(2), x => x * 2) = ok(4)', () => {
    const r = map(ok(2), (x) => x * 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(4);
  });

  it('map(err, fn) NÃO executa fn e preserva o erro', () => {
    const e = new Error('x');
    const result = map(err(e), () => {
      throw new Error('não deveria executar');
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(e);
  });
});
