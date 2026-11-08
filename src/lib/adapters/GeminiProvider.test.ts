import { describe, it, expect, vi } from 'vitest';
import {
  GeminiProvider,
  MissingApiKeyError,
  InvalidApiKeyError,
  GEMINI_PRIMARY_MODELS,
} from './GeminiProvider';

describe('GeminiProvider Adapter', () => {
  it('lança MissingApiKeyError se apiKey estiver vazia', () => {
    expect(() => new GeminiProvider({ apiKey: '' })).toThrow(MissingApiKeyError);
    expect(() => new GeminiProvider({ apiKey: '   ' })).toThrow(MissingApiKeyError);
  });

  it('inicializa com chave válida e expõe metadados id/name', () => {
    const provider = new GeminiProvider({ apiKey: 'test-api-key-12345' });
    expect(provider.id).toBe('gemini');
    expect(provider.name).toBe('Google Gemini');
  });

  it('lança InvalidApiKeyError se a chave for rejeitada pela API (401)', async () => {
    const provider = new GeminiProvider({ apiKey: 'invalid-dummy-key-401' });
    await expect(provider.listSupportedModels()).rejects.toThrow(InvalidApiKeyError);
  });

  it('expõe a lista de modelos padrão primários da série Flash', () => {
    expect(GEMINI_PRIMARY_MODELS).toContain('gemini-2.5-flash');
    expect(GEMINI_PRIMARY_MODELS).toContain('gemini-2.5-flash-lite');
  });
});
