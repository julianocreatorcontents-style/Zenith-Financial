import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyEligibleScheduledTransactions } from './useTransactionsCron';
import type { Asset, Transaction } from '../types/app';

interface MockDocRef {
  collection: string;
  id: string;
}

interface UpdateCall {
  ref: MockDocRef;
  data: Record<string, any>;
}

let batchUpdates: UpdateCall[] = [];
let commitFailNext = false;
let commitCount = 0;
let runTransactionCount = 0;
const mockAssetStore = new Map<string, Asset>();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<any>().catch(() => ({}));
  return {
    ...actual,
    Timestamp: actual.Timestamp || {
      fromDate: vi.fn((date) => ({ toDate: () => date })),
    },
    runTransaction: vi.fn(async (_db, updateFn) => {
      runTransactionCount += 1;
      if (commitFailNext) {
        throw new Error('Simulated network commit failure');
      }
      const mockTx = {
        get: vi.fn(async (ref: MockDocRef) => {
          const asset = mockAssetStore.get(ref.id);
          return {
            exists: () => Boolean(asset),
            data: () => asset,
          };
        }),
        update: vi.fn((ref: MockDocRef, data: Record<string, any>) => {
          batchUpdates.push({ ref, data });
          if (ref.collection === 'assets' && mockAssetStore.has(ref.id)) {
            mockAssetStore.set(ref.id, { ...mockAssetStore.get(ref.id)!, ...data });
          }
        }),
      };
      return await updateFn(mockTx);
    }),
  };
});

vi.mock('../firebase', () => ({
  db: { _isMockDb: true },
  collection: vi.fn((_db, name) => ({ _collection: name })),
  query: vi.fn((coll) => coll),
  where: vi.fn(),
  doc: vi.fn((_db, collectionName, id) => ({ collection: collectionName, id })),
  serverTimestamp: vi.fn(() => 'MOCK_SERVER_TIMESTAMP'),
  getDocs: vi.fn(),
  writeBatch: vi.fn(() => ({
    update: vi.fn((ref: MockDocRef, data: Record<string, any>) => {
      batchUpdates.push({ ref, data });
    }),
    commit: vi.fn(async () => {
      commitCount += 1;
      if (commitFailNext) {
        throw new Error('Simulated network commit failure');
      }
    }),
  })),
}));

const makeAsset = (id: string, name: string, value: number): Asset => ({
  id,
  name,
  value,
  type: 'liquidity',
  detail: 'Conta corrente',
  uid: 'user-1',
  createdAt: new Date('2026-01-01'),
});

const makeScheduledTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: overrides.id ?? `tx-${Math.random().toString(36).slice(2)}`,
  uid: 'user-1',
  label: 'Transferência',
  value: 1000,
  type: 'out',
  date: new Date('2026-11-12T10:00:00Z'),
  applied: false,
  status: 'Futuro',
  categoria_primaria: 'transferencia',
  assetId: 'asset-from',
  ...overrides,
});

describe('useTransactionsCron — Fase 4.1 (T5: 5 a 9)', () => {
  let rawAssets: Asset[];

  beforeEach(() => {
    vi.clearAllMocks();
    batchUpdates = [];
    commitFailNext = false;
    commitCount = 0;
    runTransactionCount = 0;
    mockAssetStore.clear();
    rawAssets = [
      makeAsset('asset-from', '99Pay - V', 5000),
      makeAsset('asset-to', '99Pay', 2000),
      makeAsset('asset-third', 'Mercado Pago', 1000),
      makeAsset('asset-fourth', 'Nubank', 3000),
    ];
    for (const a of rawAssets) {
      mockAssetStore.set(a.id, { ...a });
    }
  });

  // T5.5 — Atomicidade: mock de runTransaction valida uso estrito de 1 transação única para o par
  it('T5.5 — atomicidade: valida que usa estritamente 1 única runTransaction e que falha no commit aborta o par inteiro', async () => {
    const { runTransaction } = await import('firebase/firestore');
    const outLeg = makeScheduledTx({
      id: 'tx-out-1',
      transferId: 'atomic-transfer',
      transferRole: 'out',
      type: 'out',
      assetId: 'asset-from',
      value: 500,
    });
    const inLeg = makeScheduledTx({
      id: 'tx-in-1',
      transferId: 'atomic-transfer',
      transferRole: 'in',
      type: 'in',
      assetId: 'asset-to',
      value: 500,
    });

    commitFailNext = true;

    await expect(
      applyEligibleScheduledTransactions([outLeg, inLeg], rawAssets)
    ).rejects.toThrow('Simulated network commit failure');

    // Validação real de unicidade de transação
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(runTransactionCount).toBe(1);
  });

  // T5.5b — Prova de unicidade no caminho de sucesso (1 runTransaction × 4 updates)
  it('T5.5b — caminho de sucesso: prova estrita de 1 única runTransaction com 4 updates (2 assets + 2 tx) para o par completo', async () => {
    const { runTransaction } = await import('firebase/firestore');
    const outLeg = makeScheduledTx({
      id: 'tx-out-1',
      transferId: 'atomic-transfer-success',
      transferRole: 'out',
      type: 'out',
      assetId: 'asset-from',
      value: 500,
    });
    const inLeg = makeScheduledTx({
      id: 'tx-in-1',
      transferId: 'atomic-transfer-success',
      transferRole: 'in',
      type: 'in',
      assetId: 'asset-to',
      value: 500,
    });

    commitFailNext = false;

    const hasChanges = await applyEligibleScheduledTransactions([outLeg, inLeg], rawAssets);
    expect(hasChanges).toBe(true);

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(runTransactionCount).toBe(1);

    const txUpdates = batchUpdates.filter((u) => u.ref.collection === 'transactions');
    const assetUpdates = batchUpdates.filter((u) => u.ref.collection === 'assets');
    expect(txUpdates).toHaveLength(2);
    expect(assetUpdates).toHaveLength(2);
    expect(batchUpdates).toHaveLength(4);
    expect(txUpdates.map((u) => u.ref.id).sort()).toEqual(['tx-in-1', 'tx-out-1']);

    // Saldos recalculados
    const fromAssetUpdate = assetUpdates.find((u) => u.ref.id === 'asset-from');
    const toAssetUpdate = assetUpdates.find((u) => u.ref.id === 'asset-to');
    expect(fromAssetUpdate?.data.value).toBe(4500);
    expect(toAssetUpdate?.data.value).toBe(2500);
  });

  // T5.6 — Cron preserva transferId: após aplicação bem-sucedida, ambos os docs mantêm transferId original
  it('T5.6 — cron preserva transferId original em ambas as pernas no batch.update', async () => {
    const outLeg = makeScheduledTx({
      id: 'tx-out-t2',
      transferId: 'fixed-transfer-id-123',
      transferRole: 'out',
      type: 'out',
      assetId: 'asset-from',
      value: 300,
    });
    const inLeg = makeScheduledTx({
      id: 'tx-in-t2',
      transferId: 'fixed-transfer-id-123',
      transferRole: 'in',
      type: 'in',
      assetId: 'asset-to',
      value: 300,
    });

    const hasChanges = await applyEligibleScheduledTransactions([outLeg, inLeg], rawAssets);
    expect(hasChanges).toBe(true);
    expect(runTransactionCount).toBe(1); // 1 única runTransaction para o par

    // Confere que no update de transações o transferId foi expressamente mantido idêntico
    const txUpdates = batchUpdates.filter((u) => u.ref.collection === 'transactions');
    expect(txUpdates).toHaveLength(2);
    const outUpdate = txUpdates.find((u) => u.ref.id === 'tx-out-t2');
    const inUpdate = txUpdates.find((u) => u.ref.id === 'tx-in-t2');

    expect(outUpdate?.data).toMatchObject({
      applied: true,
      status: 'Confirmado',
      transferId: 'fixed-transfer-id-123',
      transferRole: 'out',
    });
    expect(inUpdate?.data).toMatchObject({
      applied: true,
      status: 'Confirmado',
      transferId: 'fixed-transfer-id-123',
      transferRole: 'in',
    });
  });

  // T5.7 — Cron agrupa legado Futuro: dois docs sem transferId, par inequívoco → gera transferId idêntico
  it('T5.7 — cron agrupa legado Futuro inequívoco: gera transferId idêntico nos dois docs em 1 batch atômico', async () => {
    const legacyOut = makeScheduledTx({
      id: 'legacy-out',
      type: 'out',
      assetId: 'asset-from',
      value: 750,
      transferId: undefined,
      transferRole: undefined,
    });
    const legacyIn = makeScheduledTx({
      id: 'legacy-in',
      type: 'in',
      assetId: 'asset-to',
      value: 750,
      transferId: undefined,
      transferRole: undefined,
    });

    const hasChanges = await applyEligibleScheduledTransactions([legacyOut, legacyIn], rawAssets);
    expect(hasChanges).toBe(true);
    expect(runTransactionCount).toBe(1);

    const txUpdates = batchUpdates.filter((u) => u.ref.collection === 'transactions');
    expect(txUpdates).toHaveLength(2);

    const outUpdate = txUpdates.find((u) => u.ref.id === 'legacy-out');
    const inUpdate = txUpdates.find((u) => u.ref.id === 'legacy-in');

    expect(outUpdate?.data.applied).toBe(true);
    expect(outUpdate?.data.status).toBe('Confirmado');
    expect(outUpdate?.data.transferId).toBeDefined();
    expect(outUpdate?.data.transferRole).toBe('out');
    expect(outUpdate?.data.counterpartAssetId).toBe('asset-to');

    expect(inUpdate?.data.applied).toBe(true);
    expect(inUpdate?.data.status).toBe('Confirmado');
    expect(inUpdate?.data.transferId).toBeDefined();
    expect(inUpdate?.data.transferRole).toBe('in');
    expect(inUpdate?.data.counterpartAssetId).toBe('asset-from');

    // O transferId gerado deve ser idêntico em ambos os documentos
    expect(outUpdate?.data.transferId).toBe(inUpdate?.data.transferId);
  });

  // T5.8 — Cron não agrupa legado ambíguo: aplicados isoladamente, sem transferId gerado, com log
  it('T5.8 — cron não agrupa legado ambíguo: aplica isoladamente sem gerar transferId e emite warn no log', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out1 = makeScheduledTx({ id: 'out-a', type: 'out', assetId: 'asset-from', value: 100 });
    const out2 = makeScheduledTx({ id: 'out-b', type: 'out', assetId: 'asset-third', value: 100 });
    const in1 = makeScheduledTx({ id: 'in-c', type: 'in', assetId: 'asset-to', value: 100 });
    const in2 = makeScheduledTx({ id: 'in-d', type: 'in', assetId: 'asset-fourth', value: 100 });

    const hasChanges = await applyEligibleScheduledTransactions([out1, out2, in1, in2], rawAssets);
    expect(hasChanges).toBe(true);

    const txUpdates = batchUpdates.filter((u) => u.ref.collection === 'transactions');
    expect(txUpdates).toHaveLength(4);

    // Nenhum deles pode ter transferId gerado
    for (const update of txUpdates) {
      expect(update.data.applied).toBe(true);
      expect(update.data.status).toBe('Confirmado');
      expect(update.data.transferId).toBeUndefined();
    }

    // Deve ter registrado aviso em log para cada doc isolado
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('cron: legado sem par inequívoco aplicado isoladamente')
    );
    warnSpy.mockRestore();
  });

  // T5.9 — Perna órfã no cron: doc com transferId sem contraparte → aplicado isoladamente com log
  it('T5.9 — perna órfã no cron: doc com transferId sem contraparte é aplicado isoladamente com log registrado', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const orphanLeg = makeScheduledTx({
      id: 'tx-orphan-only',
      transferId: 'tid-orphan-999',
      transferRole: 'out',
      type: 'out',
      assetId: 'asset-from',
      value: 150,
    });

    const hasChanges = await applyEligibleScheduledTransactions([orphanLeg], rawAssets);
    expect(hasChanges).toBe(true);
    expect(commitCount).toBe(1);

    const txUpdates = batchUpdates.filter((u) => u.ref.collection === 'transactions');
    expect(txUpdates).toHaveLength(1);
    expect(txUpdates[0].ref.id).toBe('tx-orphan-only');
    expect(txUpdates[0].data.applied).toBe(true);
    expect(txUpdates[0].data.transferId).toBe('tid-orphan-999');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('cron: transferência órfã aplicada isoladamente: tx-orphan-only')
    );
    warnSpy.mockRestore();
  });

  // D4 — Concorrência sobre o mesmo asset
  it('D4 — concorrência: duas transações concorrentes sobre o mesmo asset aplicam ambos os deltas via retry do runTransaction sem sobrescrita', async () => {
    // Estado inicial: asset-from tem 5000
    // Transação 1: debita 500 (vai para 4500)
    // Transação 2: debita 300 (vai para 4200)
    const tx2Out = makeScheduledTx({
      id: 'tx2-out',
      transferId: 't-concurrent-2',
      transferRole: 'out',
      type: 'out',
      assetId: 'asset-from',
      value: 300,
    });
    const tx2In = makeScheduledTx({
      id: 'tx2-in',
      transferId: 't-concurrent-2',
      transferRole: 'in',
      type: 'in',
      assetId: 'asset-third',
      value: 300,
    });

    let callbackAttempts = 0;

    const concurrentRunTx = vi.fn(async (_db, updateFn) => {
      // Loop de retry simulando o comportamento nativo do Firestore runTransaction
      while (true) {
        callbackAttempts += 1;
        const attemptUpdates: UpdateCall[] = [];
        const attemptAssetStoreChanges = new Map<string, any>();

        const mockTx = {
          get: vi.fn(async (ref: MockDocRef) => {
            const asset = mockAssetStore.get(ref.id);
            return {
              exists: () => Boolean(asset),
              data: () => asset,
            };
          }),
          update: vi.fn((ref: MockDocRef, data: Record<string, any>) => {
            attemptUpdates.push({ ref, data });
            if (ref.collection === 'assets') {
              attemptAssetStoreChanges.set(ref.id, data);
            }
          }),
        };

        await updateFn(mockTx);

        // Na 1ª tentativa, simula que um cliente concorrente comitou uma alteração no asset-from (-500)
        // antes de esta tentativa finalizar, gerando conflito de versão e acionando o retry do Firestore.
        if (callbackAttempts === 1) {
          const fromAsset = mockAssetStore.get('asset-from')!;
          mockAssetStore.set('asset-from', {
            ...fromAsset,
            value: fromAsset.value - 500,
          });
          // Aborta e descarta os updates da tentativa 1, re-invocando o callback
          continue;
        }

        // Na 2ª tentativa (sucesso): comita os updates definitivos
        batchUpdates.push(...attemptUpdates);
        for (const [assetId, data] of attemptAssetStoreChanges) {
          const current = mockAssetStore.get(assetId)!;
          mockAssetStore.set(assetId, { ...current, ...data });
        }
        return;
      }
    });

    const ok = await applyEligibleScheduledTransactions(
      [tx2Out, tx2In],
      rawAssets,
      undefined,
      undefined,
      concurrentRunTx as any
    );

    expect(ok).toBe(true);
    // Comprova que o callback de transação foi estritamente re-invocado 2 vezes no retry
    expect(callbackAttempts).toBe(2);

    // Saldo final de asset-from DEVE ser 4200 (5000 - 500 concorrente - 300 da tx2)
    // Se usasse rawAssets desatualizado (5000), o resultado seria 4700 (sobrescrevendo e perdendo 500)
    const finalAssetFrom = mockAssetStore.get('asset-from');
    expect(finalAssetFrom?.value).toBe(4200);

    const assetUpdates = batchUpdates.filter((u) => u.ref.id === 'asset-from');
    const lastUpdate = assetUpdates[assetUpdates.length - 1];
    expect(lastUpdate.data.value).toBe(4200);
  });
});
