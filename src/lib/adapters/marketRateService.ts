import { BcbMarketRateAdapter } from './BcbMarketRateAdapter';
import type { BcbFetcher } from './BcbMarketRateAdapter';
import { DEFAULT_CDI_ANNUAL_PERCENT } from './netWorthProjection';

export const CDI_STORAGE_KEY = 'zenith_market_rate_cdi';

export interface MarketRateState {
  cdiAnnualPercent: number;
  source: 'bcb' | 'cache' | 'default';
  updatedAt: string | null;
}

export function getCachedCdiRate(storage?: Storage): MarketRateState {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (s) {
      const raw = s.getItem(CDI_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data.rate === 'number' && Number.isFinite(data.rate) && data.rate > 0) {
          return {
            cdiAnnualPercent: data.rate,
            source: 'cache',
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
          };
        }
      }
    }
  } catch {
    // fallback se localStorage estiver inacessível
  }

  return {
    cdiAnnualPercent: DEFAULT_CDI_ANNUAL_PERCENT,
    source: 'default',
    updatedAt: null,
  };
}

export async function fetchLiveCdiRate(
  fetcher?: BcbFetcher,
  storage?: Storage,
  date: Date = new Date(),
): Promise<MarketRateState> {
  const customFetcher: BcbFetcher =
    fetcher ??
    (typeof window !== 'undefined'
      ? (url: string) => window.fetch(url)
      : async () => {
          throw new Error('fetch indisponível');
        });

  try {
    const adapter = new BcbMarketRateAdapter(customFetcher);
    const rawRate = await adapter.getAnnualRate('CDI', date);
    const roundedRate = Math.round(rawRate * 100) / 100;
    const now = new Date().toISOString();

    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (s) {
      try {
        s.setItem(
          CDI_STORAGE_KEY,
          JSON.stringify({ rate: roundedRate, updatedAt: now }),
        );
      } catch {
        // ignora se localStorage estiver bloqueado
      }
    }

    return {
      cdiAnnualPercent: roundedRate,
      source: 'bcb',
      updatedAt: now,
    };
  } catch {
    return getCachedCdiRate(storage);
  }
}
