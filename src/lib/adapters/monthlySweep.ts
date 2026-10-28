import type { RawAssetDoc } from './assetToInvestment';
import { enrichAsset } from './assetYieldService';

export interface SweepUpdate {
  id: string;
  value: number;
  valorInvestido: number;
  createdAt: string;
}

export interface SweepResult {
  needsSweep: boolean;
  updates: SweepUpdate[];
  totalYieldCollected: number;
}

/**
 * Verifica se o "Sweep" (varredura mensal) deve ser executado.
 * Regra: Se o mês atual for maior que o mês de criação do ativo (ex: criado em 25/10, hoje é 01/11).
 */
export function detectAndPrepareSweep(assets: RawAssetDoc[], cdiRate: number): SweepResult {
  const today = new Date();
  // Data de corte: último dia do mês anterior
  const lastDayOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  
  // Data que será cravada nos ativos (1º dia do mês atual)
  const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  firstDayOfCurrentMonth.setHours(3, 0, 0, 0); // Fuso horário Brasil (UTC-3)
  const newCreatedAtISO = firstDayOfCurrentMonth.toISOString();

  let needsSweep = false;
  const updates: SweepUpdate[] = [];
  let totalYieldCollected = 0;

  // O "Coletor" é a conta Mercado Pago · Saldo (sem sufixos)
  const collector = assets.find(a => a.name === 'Mercado Pago · Saldo');
  if (!collector) return { needsSweep: false, updates: [], totalYieldCollected: 0 };

  for (const asset of assets) {
    if (asset.type !== 'investment') continue;

    const assetDate = new Date(asset.createdAt as any);
    
    // Verifica se o ativo foi criado em um mês anterior
    if (assetDate.getMonth() < today.getMonth() || assetDate.getFullYear() < today.getFullYear()) {
      needsSweep = true;
      
      // Calcula o rendimento até o último dia do mês anterior
      const enriched = enrichAsset(asset, cdiRate, lastDayOfPrevMonth);
      const yieldAmount = enriched.currentValue - enriched.baseBalance;
      
      const isCollector = asset.name === 'Mercado Pago · Saldo';
      const isCofrinho = asset.name.toLowerCase().includes('cofrinho');

      if (isCollector) {
        // O coletor recebe o rendimento dele mesmo e continuará somando os outros
        totalYieldCollected += yieldAmount;
        // Não reseta o coletor agora, faremos isso no final somando o totalYield
      } else {
        totalYieldCollected += yieldAmount;
        // Reseta as outras contas para o valor base
        const basePrincipal = isCofrinho ? 10000 : 5000;
        updates.push({
          id: asset.id,
          value: basePrincipal,
          valorInvestido: basePrincipal,
          createdAt: newCreatedAtISO
        });
      }
    }
  }

  // Atualiza o coletor com a soma de todos os rendimentos + o valor atual dele
  if (needsSweep && collector) {
    const collectorEnriched = enrichAsset(collector, cdiRate, lastDayOfPrevMonth);
    updates.push({
      id: collector.id,
      value: collectorEnriched.currentValue + totalYieldCollected,
      valorInvestido: collectorEnriched.currentValue + totalYieldCollected, // Ancora no novo saldo
      createdAt: newCreatedAtISO
    });
  }

  return { needsSweep, updates, totalYieldCollected };
}
