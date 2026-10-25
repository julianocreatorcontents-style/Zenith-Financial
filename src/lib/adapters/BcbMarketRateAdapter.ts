import type { Indexer } from '../../domain/yield/YieldPolicy';
import type { MarketRatePort } from '../../domain/ports/MarketRatePort';

export interface BcbFetcher {
  (url: string): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
}

interface BcbEntry {
  data: string;
  valor: string;
}

const SERIE_BY_INDEXER: Record<Indexer, number> = {
  CDI: 12,
  SELIC: 11,
  PRE: -1,
};

export class BcbMarketRateAdapter implements MarketRatePort {
  private readonly cache = new Map<string, number>();

  constructor(private readonly fetcher: BcbFetcher) {}

  async getAnnualRate(indexer: Indexer, date: Date): Promise<number> {
    if (indexer === 'PRE') {
      throw new Error('PRE não tem taxa de mercado — use policy.rateValue');
    }
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new Error('data inválida');
    }

    const key = `${indexer}:${toISODate(date)}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const serie = SERIE_BY_INDEXER[indexer];
    const start = new Date(date.getTime() - 7 * 86_400_000);
    const url =
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados` +
      `?formato=json&dataInicial=${toBcbDate(start)}&dataFinal=${toBcbDate(date)}`;

    let res;
    try {
      res = await this.fetcher(url);
    } catch (e) {
      throw new Error(
        `BCB request falhou: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) {
      throw new Error(`BCB HTTP ${res.status}`);
    }

    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error(
        `BCB não retornou dados para ${indexer} em ${toISODate(date)}`,
      );
    }

    const entries = raw as BcbEntry[];
    const last = entries[entries.length - 1];
    if (!last || typeof last.valor !== 'string') {
      throw new Error('BCB retornou entrada inválida');
    }

    const dailyPercent = parseFloat(last.valor);
    if (!Number.isFinite(dailyPercent)) {
      throw new Error(`BCB retornou valor não numérico: ${last.valor}`);
    }

    const annualPercent =
      ((1 + dailyPercent / 100) ** 252 - 1) * 100;

    this.cache.set(key, annualPercent);
    return annualPercent;
  }
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toBcbDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}
