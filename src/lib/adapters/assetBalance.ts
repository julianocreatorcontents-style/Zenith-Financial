export interface AssetBalanceSnapshot {
  value?: number | null;
  valorInvestido?: number | null;
  manualBalance?: number | null;
  investmentStartDate?: unknown;
}

export interface AssetBalanceUpdate {
  value: number;
  valorInvestido: number;
  manualBalance?: number;
  investmentStartDate?: Date;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const hasNumericBalance = (value: unknown): value is number | string =>
  value !== undefined &&
  value !== null &&
  value !== '' &&
  Number.isFinite(Number(value));

/**
 * Aplica um lançamento financeiro ao saldo de um ativo.
 *
 * A data-âncora de rendimento (`investmentStartDate`) é preservada quando já
 * existe: lançamentos não devem reiniciar o histórico de rendimento do ativo.
 * A data só é semeada na primeira vez que o ativo recebe um lançamento.
 *
 * Quando o ativo possui `manualBalance` (saldo reconciliado do extrato), ele
 * também é ajustado; caso contrário o rendimento calculado continuaria usando
 * o saldo antigo e ignoraria o lançamento.
 *
 * Saídas maiores que o saldo resultam em saldo negativo (cheque especial).
 */
export function calculateAssetBalanceUpdate(
  asset: AssetBalanceSnapshot,
  amount: number,
  isAddition: boolean,
  now: Date = new Date(),
): AssetBalanceUpdate {
  const hasManualBalance = hasNumericBalance(asset.manualBalance);
  const currentValue = hasManualBalance
    ? Number(asset.manualBalance)
    : Number(asset.value) || 0;
  const currentInvested = Number(asset.valorInvestido ?? currentValue) || currentValue;
  const delta = isAddition ? amount : -amount;

  const update: AssetBalanceUpdate = {
    // Saldos podem ficar negativos (cheque especial / conta corrente).
    // Apenas o valor investido (principal) permanece limitado a zero.
    value: roundCurrency(currentValue + delta),
    valorInvestido: Math.max(0, roundCurrency(currentInvested + delta)),
  };

  if (hasManualBalance) {
    update.manualBalance = roundCurrency(Number(asset.manualBalance) + delta);
  }

  if (!asset.investmentStartDate) {
    update.investmentStartDate = now;
  }

  return update;
}

export type AssetDeltaMap = Map<string, number>;

export function addAssetDelta(deltas: AssetDeltaMap, assetId: string | undefined, delta: number) {
  if (!assetId || !Number.isFinite(delta) || delta === 0) return;
  deltas.set(assetId, (deltas.get(assetId) ?? 0) + delta);
}

export function applyAssetDeltas<T extends { id: string } & AssetBalanceSnapshot>(
  batch: { update: (ref: any, data: any) => void },
  docFn: (collectionPath: string, docId: string) => any,
  serverTimestampFn: () => any,
  deltas: AssetDeltaMap,
  assets: T[]
) {
  for (const [assetId, delta] of deltas) {
    if (delta === 0) continue;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) continue;
    const update = calculateAssetBalanceUpdate(asset, Math.abs(delta), delta > 0);
    batch.update(docFn('assets', assetId), {
      ...update,
      updatedAt: serverTimestampFn(),
    });
  }
}
