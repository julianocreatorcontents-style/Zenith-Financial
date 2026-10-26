import { Money } from '../money/Money';
import { IncomeTaxPolicy } from './IncomeTaxPolicy';
import { IofPolicy } from './IofPolicy';
import type { Investment } from '../investment/Investment';

export type TaxAlertType = 'IOF_ZERO' | 'IR_DROP';

export interface TaxRegressiveAlert {
  type: TaxAlertType;
  daysRemaining: number;
  currentRate: number;
  targetRate: number;
  transitionDate: Date;
  estimatedTaxSavings: Money;
  title: {
    pt: string;
    en: string;
  };
  description: {
    pt: string;
    en: string;
  };
}

export class TaxAlertService {
  private static readonly MS_PER_DAY = 86_400_000;
  private static readonly ALERT_THRESHOLD_DAYS = 30;

  /**
   * Avalia um investimento e retorna alertas preditivos de transição tributária
   * caso falte até 30 dias para queda de faixa de IR ou zerar IOF.
   */
  static getAlertsForInvestment(
    investment: Investment,
    evaluationDate: Date = new Date(),
  ): TaxRegressiveAlert[] {
    if (investment.taxDisplayMode !== 'NET') {
      return [];
    }

    const alerts: TaxRegressiveAlert[] = [];
    const daysInvested = investment.daysInvested(evaluationDate);

    // Lucro bruto acumulado (se houver)
    const grossYield = investment.currentBalance.isGreaterThan(investment.principal)
      ? investment.currentBalance.subtract(investment.principal)
      : Money.zero();

    // 1. Alerta de IOF (dias 0 a 29)
    if (daysInvested < 30) {
      const daysRemaining = 30 - daysInvested;
      if (daysRemaining <= this.ALERT_THRESHOLD_DAYS) {
        const currentRate = daysInvested >= 1 ? IofPolicy.rateFor(daysInvested) : 1;
        const targetRate = 0;
        const transitionDate = new Date(
          investment.startDate.getTime() + 30 * this.MS_PER_DAY,
        );
        const estimatedTaxSavings = grossYield.multiply(currentRate);

        alerts.push({
          type: 'IOF_ZERO',
          daysRemaining,
          currentRate,
          targetRate,
          transitionDate,
          estimatedTaxSavings,
          title: {
            pt: `IOF zera em ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}`,
            en: `IOF drops to 0% in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`,
          },
          description: {
            pt: `Alíquota atual de ${(currentRate * 100).toFixed(0)}% será zerada. Evite resgatar agora para reter seus rendimentos.`,
            en: `Current rate of ${(currentRate * 100).toFixed(0)}% will be wiped out. Avoid withdrawing now to keep your returns.`,
          },
        });
      }
    }

    // 2. Alerta de IR Regressivo
    let nextThresholdDay: number | null = null;
    let targetRate = 0;

    if (daysInvested <= 180) {
      nextThresholdDay = 181;
      targetRate = 0.20;
    } else if (daysInvested <= 360) {
      nextThresholdDay = 361;
      targetRate = 0.175;
    } else if (daysInvested <= 720) {
      nextThresholdDay = 721;
      targetRate = 0.15;
    }

    if (nextThresholdDay !== null) {
      const daysRemaining = nextThresholdDay - daysInvested;
      if (daysRemaining > 0 && daysRemaining <= this.ALERT_THRESHOLD_DAYS) {
        const currentRate = IncomeTaxPolicy.rateFor(Math.max(1, daysInvested));
        const rateDrop = currentRate - targetRate;
        const transitionDate = new Date(
          investment.startDate.getTime() + nextThresholdDay * this.MS_PER_DAY,
        );
        const estimatedTaxSavings = grossYield.multiply(rateDrop);

        alerts.push({
          type: 'IR_DROP',
          daysRemaining,
          currentRate,
          targetRate,
          transitionDate,
          estimatedTaxSavings,
          title: {
            pt: `IR cai para ${(targetRate * 100).toFixed(1)}% em ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}`,
            en: `Income tax drops to ${(targetRate * 100).toFixed(1)}% in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`,
          },
          description: {
            pt: `Alíquota reduz de ${(currentRate * 100).toFixed(1)}% para ${(targetRate * 100).toFixed(1)}% (economia de 2,5 p.p. no imposto sobre rendimentos).`,
            en: `Tax rate drops from ${(currentRate * 100).toFixed(1)}% to ${(targetRate * 100).toFixed(1)}% (saving 2.5 p.p. on returns).`,
          },
        });
      }
    }

    return alerts;
  }
}
