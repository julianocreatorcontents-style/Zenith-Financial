import type { Investment } from '../investment/Investment';

export interface InvestmentRepoPort {
  findByUser(userId: string): Promise<Investment[]>;
}
