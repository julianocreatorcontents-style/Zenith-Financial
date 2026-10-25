import type { Indexer } from '../yield/YieldPolicy';

export interface MarketRatePort {
  getAnnualRate(indexer: Indexer, date: Date): Promise<number>;
}
