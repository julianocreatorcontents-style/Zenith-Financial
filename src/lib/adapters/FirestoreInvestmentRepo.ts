import type { Investment } from '../../domain/investment/Investment';
import type { InvestmentRepoPort } from '../../domain/ports/InvestmentRepoPort';
import { assetToInvestment } from './assetToInvestment';
import type { RawAssetDoc } from './assetToInvestment';

export type AssetsFetcher = () => Promise<RawAssetDoc[]>;

export class FirestoreInvestmentRepo implements InvestmentRepoPort {
  constructor(private readonly fetchAssets: AssetsFetcher) {}

  async findByUser(userId: string): Promise<Investment[]> {
    if (!userId || userId.trim() === '') {
      throw new Error('userId não pode ser vazio');
    }

    const docs = await this.fetchAssets();
    const investments: Investment[] = [];

    for (const doc of docs) {
      if (doc.uid !== userId) continue;
      const inv = assetToInvestment(doc);
      if (inv !== null) investments.push(inv);
    }

    return investments;
  }
}
