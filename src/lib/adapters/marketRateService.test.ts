import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCachedCdiRate,
  fetchLiveCdiRate,
  CDI_STORAGE_KEY,
} from './marketRateService';
import type { BcbFetcher } from './BcbMarketRateAdapter';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, value); }
}

describe('marketRateService', () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  describe('getCachedCdiRate', () => {
    it('retorna valor padrão 13.65 se armazenamento vazio', () => {
      const state = getCachedCdiRate(mockStorage);
      expect(state.cdiAnnualPercent).toBe(13.65);
      expect(state.source).toBe('default');
      expect(state.updatedAt).toBeNull();
    });

    it('retorna taxa em cache se válida', () => {
      mockStorage.setItem(
        CDI_STORAGE_KEY,
        JSON.stringify({ rate: 12.5, updatedAt: '2026-10-25T10:00:00Z' }),
      );
      const state = getCachedCdiRate(mockStorage);
      expect(state.cdiAnnualPercent).toBe(12.5);
      expect(state.source).toBe('cache');
      expect(state.updatedAt).toBe('2026-10-25T10:00:00Z');
    });

    it('faz fallback para padrão se json for inválido', () => {
      mockStorage.setItem(CDI_STORAGE_KEY, 'invalid-json');
      const state = getCachedCdiRate(mockStorage);
      expect(state.cdiAnnualPercent).toBe(13.65);
      expect(state.source).toBe('default');
    });
  });

  describe('fetchLiveCdiRate', () => {
    it('busca taxa do BCB, arredonda e salva no cache', async () => {
      const mockFetcher: BcbFetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ data: '24/10/2026', valor: '0.050788' }],
      });

      const state = await fetchLiveCdiRate(
        mockFetcher,
        mockStorage,
        new Date('2026-10-24'),
      );

      expect(state.cdiAnnualPercent).toBe(13.65);
      expect(state.source).toBe('bcb');
      expect(state.updatedAt).toBeTruthy();

      const cached = JSON.parse(mockStorage.getItem(CDI_STORAGE_KEY)!);
      expect(cached.rate).toBe(13.65);
    });

    it('faz fallback suave para cache caso o BCB falhe', async () => {
      mockStorage.setItem(
        CDI_STORAGE_KEY,
        JSON.stringify({ rate: 14.15, updatedAt: '2026-10-20T10:00:00Z' }),
      );

      const failingFetcher: BcbFetcher = vi.fn().mockRejectedValue(
        new Error('Network error'),
      );

      const state = await fetchLiveCdiRate(
        failingFetcher,
        mockStorage,
        new Date('2026-10-24'),
      );

      expect(state.cdiAnnualPercent).toBe(14.15);
      expect(state.source).toBe('cache');
    });
  });
});
