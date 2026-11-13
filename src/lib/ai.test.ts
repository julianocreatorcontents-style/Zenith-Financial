/**
 * Sprint 2 / T2 — Testes do ciclo de vida da chave Gemini (clearAIApiKey)
 * Arquivo: src/lib/ai.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPreferences = {
  get: vi.fn(async () => ({ value: null })),
  set: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

// ─── SUT ─────────────────────────────────────────────────────────────────────

import { clearAIApiKey, GEMINI_API_KEY_STORAGE, redactApiKey } from './ai';

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('clearAIApiKey — Sprint 2 / T2', () => {
  const localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]);

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => localStorageMock[k] ?? null,
      setItem: (k: string, v: string) => { localStorageMock[k] = v; },
      removeItem: (k: string) => { delete localStorageMock[k]; },
    });
  });

  it('T2.1 — Remove chave do localStorage', async () => {
    localStorageMock[GEMINI_API_KEY_STORAGE] = 'AIzaTestKeyXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    await clearAIApiKey();
    expect(localStorageMock[GEMINI_API_KEY_STORAGE]).toBeUndefined();
  });

  it('T2.2 — Remove também zenith_ai_api_key (alias)', async () => {
    localStorageMock['zenith_ai_api_key'] = 'AIzaTestKeyXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    await clearAIApiKey();
    expect(localStorageMock['zenith_ai_api_key']).toBeUndefined();
  });

  it('T2.3 — Idempotente: não falha se chave ausente', async () => {
    // Sem chave no storage
    await expect(clearAIApiKey()).resolves.toBeUndefined();
  });

  it('T2.4 — Remove chave também do Preferences (Capacitor)', async () => {
    await clearAIApiKey();
    expect(mockPreferences.remove).toHaveBeenCalledWith({ key: GEMINI_API_KEY_STORAGE });
    expect(mockPreferences.remove).toHaveBeenCalledWith({ key: 'zenith_ai_api_key' });
  });
});

describe('redactApiKey — Proteção de chave em logs', () => {
  it('T2.5 — Redige chave no formato AIzaXXX em strings', () => {
    const key = 'AIzaSyB1234567890ABCDEFGHIJKLMNOPabcde';
    const result = redactApiKey(`Request failed with key=${key}`);
    expect(result).not.toContain(key);
    expect(result).toContain('[REDACTED');
  });

  it('T2.6 — Não loga a chave em erro de provider (401)', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakeApiKey = 'AIzaSyFakeKey123456789ABCDEFGHIJKLMNOPabc';
    const fakeError = new Error(`API_KEY_INVALID: key=${fakeApiKey}`);

    // Simula comportamento do ai.ts: redige antes de logar
    const redacted = redactApiKey(fakeError) as Error;
    console.error('[Zenith IA] Erro:', redacted);

    // Nenhum argumento do console.error deve conter a chave real
    const calls = consoleSpy.mock.calls.flat();
    const allText = calls
      .map((c) => (c instanceof Error ? c.message + (c.stack ?? '') : String(c)))
      .join(' ');
    expect(allText).not.toContain(fakeApiKey);

    consoleSpy.mockRestore();
  });
});
