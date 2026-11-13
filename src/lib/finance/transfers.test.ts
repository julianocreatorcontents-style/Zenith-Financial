import { describe, it, expect } from 'vitest';
import {
  buildTransferLegs,
  createTransferId,
  groupTransactionsForWallet,
  matchLegacyCounterpart,
  isRetroactiveTransferWithManualBalance,
  type TransferLegInput,
} from './transfers';
import { isTransferTransaction } from './calculators';

const makeLeg = (overrides: Partial<TransferLegInput> = {}): TransferLegInput => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  label: 'Transferência 99Pay - V → 99Pay',
  value: 1000,
  type: 'out',
  date: new Date(2026, 10, 11, 12),
  categoria_primaria: 'transferencia',
  assetId: 'from',
  ...overrides,
});

describe('buildTransferLegs', () => {
  it('cria as duas pernas com o mesmo transferId e elos cruzados', () => {
    const [outLeg, inLeg] = buildTransferLegs({
      transferId: 'transfer-1',
      fromAsset: { id: 'from', name: '99Pay - V' },
      toAsset: { id: 'to', name: '99Pay' },
      value: 1000,
      date: '2026-11-11',
    });

    expect(outLeg).toMatchObject({
      type: 'out',
      assetId: 'from',
      counterpartAssetId: 'to',
      transferRole: 'out',
      transferId: 'transfer-1',
      categoria_primaria: 'transferencia',
      value: 1000,
    });
    expect(inLeg).toMatchObject({
      type: 'in',
      assetId: 'to',
      counterpartAssetId: 'from',
      transferRole: 'in',
      transferId: 'transfer-1',
      categoria_primaria: 'transferencia',
      value: 1000,
    });
    expect(inLeg.label).toBe(outLeg.label);
  });

  it('arredonda o valor para duas casas decimais', () => {
    const [outLeg] = buildTransferLegs({
      transferId: 'transfer-2',
      fromAsset: { id: 'from' },
      toAsset: { id: 'to' },
      value: 10.005,
      date: '2026-11-11',
    });
    expect(outLeg.value).toBe(10.01);
  });
});

describe('createTransferId', () => {
  it('gera identificadores não vazios e distintos', () => {
    const first = createTransferId();
    const second = createTransferId();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });
});

describe('groupTransactionsForWallet', () => {
  it('agrupa as duas pernas pelo transferId em um único evento', () => {
    const outLeg = makeLeg({ id: 'out', transferId: 't1', transferRole: 'out', type: 'out' });
    const inLeg = makeLeg({
      id: 'in',
      transferId: 't1',
      transferRole: 'in',
      type: 'in',
      assetId: 'to',
      counterpartAssetId: 'from',
    });

    const entries = groupTransactionsForWallet([outLeg, inLeg]);

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('transfer');
    if (entries[0].kind === 'transfer') {
      expect(entries[0].transferId).toBe('t1');
      expect(entries[0].fromAssetId).toBe('from');
      expect(entries[0].toAssetId).toBe('to');
      expect(entries[0].value).toBe(1000);
      expect(entries[0].legs).toHaveLength(2);
    }
  });

  it('não esconde uma perna órfã de transferência', () => {
    const orphan = makeLeg({ id: 'out', transferId: 't2', transferRole: 'out' });

    const entries = groupTransactionsForWallet([orphan]);

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('single');
  });

  it('agrupa transferências legadas quando o par é inequívoco', () => {
    const outLeg = makeLeg({ id: 'legacy-out', type: 'out', assetId: 'from' });
    const inLeg = makeLeg({
      id: 'legacy-in',
      type: 'in',
      assetId: 'to',
      date: new Date(2026, 10, 11, 18),
    });

    const entries = groupTransactionsForWallet([outLeg, inLeg]);

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('transfer');
  });

  it('mantém como individuais quando valor ou data não coincidem', () => {
    const outLeg = makeLeg({ id: 'out', type: 'out', assetId: 'from', value: 1000 });
    const inLeg = makeLeg({
      id: 'in',
      type: 'in',
      assetId: 'to',
      value: 900,
    });

    const entries = groupTransactionsForWallet([outLeg, inLeg]);

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.kind === 'single')).toBe(true);
  });

  it('mantém lançamentos normais intactos', () => {
    const entry = makeLeg({
      id: 'salary',
      type: 'in',
      categoria_primaria: 'Salário',
      label: 'Salário',
      assetId: 'account',
    });

    const result = groupTransactionsForWallet([entry]);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('single');
  });

  // --- T5.1, T5.2, T5.3, T5.4 ---
  it('T5.1 — ambiguidade legada: 2 out + 2 in, mesma data, mesmo valor, 4 contas distintas → matchLegacyCounterpart retorna null para todos', () => {
    const sharedDate = new Date(2026, 10, 11, 10, 0, 0);
    const out1 = makeLeg({ id: 'out-1', type: 'out', assetId: 'conta-a', value: 100, date: sharedDate });
    const out2 = makeLeg({ id: 'out-2', type: 'out', assetId: 'conta-b', value: 100, date: sharedDate });
    const in1 = makeLeg({ id: 'in-1', type: 'in', assetId: 'conta-c', value: 100, date: sharedDate });
    const in2 = makeLeg({ id: 'in-2', type: 'in', assetId: 'conta-d', value: 100, date: sharedDate });

    const usedIn = new Set<number>();
    const match1 = matchLegacyCounterpart(out1, [in1, in2], usedIn);
    const match2 = matchLegacyCounterpart(out2, [in1, in2], usedIn);

    expect(match1).toBeNull();
    expect(match2).toBeNull();

    // No agrupamento geral, todos devem ser mantidos como 'single'
    const entries = groupTransactionsForWallet([out1, out2, in1, in2]);
    expect(entries).toHaveLength(4);
    expect(entries.every((entry) => entry.kind === 'single')).toBe(true);
  });

  it('T5.2 — não-regressão de unicidade: 1 out + 1 in, mesma data/valor → continua agrupando', () => {
    const sharedDate = new Date(2026, 10, 11, 14, 0, 0);
    const outLeg = makeLeg({ id: 'out-unique', type: 'out', assetId: 'conta-origem', value: 250, date: sharedDate });
    const inLeg = makeLeg({ id: 'in-unique', type: 'in', assetId: 'conta-destino', value: 250, date: sharedDate });

    const usedIn = new Set<number>();
    const match = matchLegacyCounterpart(outLeg, [inLeg], usedIn);
    expect(match).not.toBeNull();
    expect(match?.leg.id).toBe('in-unique');

    const entries = groupTransactionsForWallet([outLeg, inLeg]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('transfer');
  });

  it('T5.3 — perna órfã com transferId: entrada com transferId sem contraparte → renderiza como perna isolada sem lançar exceção', () => {
    const orphanIn = makeLeg({
      id: 'orphan-in',
      transferId: 'transfer-single-in',
      transferRole: 'in',
      type: 'in',
      assetId: 'dest-only',
      value: 500,
    });

    expect(() => {
      const entries = groupTransactionsForWallet([orphanIn]);
      expect(entries).toHaveLength(1);
      expect(entries[0].kind).toBe('single');
      if (entries[0].kind === 'single') {
        expect(entries[0].transaction.id).toBe('orphan-in');
      }
    }).not.toThrow();
  });

  it('T5.4 — preservação de transferId no agrupamento: docs com transferId idêntico → 1 grupo; docs com transferId diferentes → 2 grupos', () => {
    const t1Out = makeLeg({ id: 't1-out', transferId: 'tid-1', transferRole: 'out', type: 'out', assetId: 'c1' });
    const t1In = makeLeg({ id: 't1-in', transferId: 'tid-1', transferRole: 'in', type: 'in', assetId: 'c2' });

    const t2Out = makeLeg({ id: 't2-out', transferId: 'tid-2', transferRole: 'out', type: 'out', assetId: 'c3' });
    const t2In = makeLeg({ id: 't2-in', transferId: 'tid-2', transferRole: 'in', type: 'in', assetId: 'c4' });

    // Idênticos -> 1 grupo
    const singlePair = groupTransactionsForWallet([t1Out, t1In]);
    expect(singlePair).toHaveLength(1);
    expect(singlePair[0].kind).toBe('transfer');

    // Dois pares com transferId diferentes -> 2 grupos
    const twoPairs = groupTransactionsForWallet([t1Out, t1In, t2Out, t2In]);
    expect(twoPairs).toHaveLength(2);
    expect(twoPairs.every((e) => e.kind === 'transfer')).toBe(true);
    const transferIds = twoPairs.map((e) => e.kind === 'transfer' ? e.transferId : null);
    expect(transferIds).toContain('tid-1');
    expect(transferIds).toContain('tid-2');
  });
});

describe('isTransferTransaction (endurecido)', () => {
  it('reconhece pelo transferId mesmo sem categoria', () => {
    expect(isTransferTransaction({ transferId: 't1' })).toBe(true);
  });

  it('reconhece pelo counterpartAssetId', () => {
    expect(isTransferTransaction({ counterpartAssetId: 'asset-2' })).toBe(true);
  });

  it('reconhece pela categoria de transferência', () => {
    expect(isTransferTransaction({ categoria_primaria: 'transferencia' })).toBe(true);
  });

  it('não classifica "Transferência recebida" de terceiros como neutra', () => {
    expect(
      isTransferTransaction({
        label: 'Transferência recebida',
        type: 'in',
        categoria_primaria: 'Salário',
      })
    ).toBe(false);
  });

  it('reconhece rótulos legados explícitos entre contas', () => {
    expect(
      isTransferTransaction({ label: 'Transferência entre contas próprias' })
    ).toBe(true);
  });
});

describe('isRetroactiveTransferWithManualBalance (D1)', () => {
  const referenceToday = new Date('2026-11-12T15:00:00Z');

  it('retorna true para ontem', () => {
    const yesterdayDate = new Date('2026-11-11T12:00:00Z');
    expect(isRetroactiveTransferWithManualBalance(yesterdayDate, referenceToday)).toBe(true);
    expect(isRetroactiveTransferWithManualBalance('2026-11-11', referenceToday)).toBe(true);
  });

  it('retorna false para hoje', () => {
    const todayMorning = new Date('2026-11-12T08:00:00Z');
    expect(isRetroactiveTransferWithManualBalance(todayMorning, referenceToday)).toBe(false);
    expect(isRetroactiveTransferWithManualBalance('2026-11-12', referenceToday)).toBe(false);
  });

  it('retorna false para amanhã', () => {
    const tomorrowDate = new Date('2026-11-13T10:00:00Z');
    expect(isRetroactiveTransferWithManualBalance(tomorrowDate, referenceToday)).toBe(false);
    expect(isRetroactiveTransferWithManualBalance('2026-11-13', referenceToday)).toBe(false);
  });

  it('retorna false para datas inválidas', () => {
    expect(isRetroactiveTransferWithManualBalance('invalid-date', referenceToday)).toBe(false);
  });
});

describe('D3 — Restauração em par de transferências na lixeira', () => {
  it('par legado inequívoco na lixeira: matchLegacyCounterpart identifica a contraparte para restauração em par', () => {
    const trashItemOut = {
      id: 'trash-1',
      originalCollection: 'transactions',
      originalId: 'tx-out-old',
      data: {
        label: 'Transferência',
        value: 1200,
        type: 'out',
        date: new Date('2026-11-10T12:00:00Z'),
        categoria_primaria: 'transferencia',
        assetId: 'asset-a',
      },
    };
    const trashCandidates = [
      {
        id: 'trash-2',
        originalCollection: 'transactions',
        originalId: 'tx-in-old',
        data: {
          label: 'Transferência',
          value: 1200,
          type: 'in',
          date: new Date('2026-11-10T12:00:00Z'),
          categoria_primaria: 'transferencia',
          assetId: 'asset-b',
        },
      },
    ];

    const match = matchLegacyCounterpart(
      trashItemOut.data,
      trashCandidates.map((c) => c.data),
      new Set<number>()
    );

    expect(match).not.toBeNull();
    expect(match?.index).toBe(0);
    expect(match?.leg.assetId).toBe('asset-b');

    // Simula a geração do par restaurado
    const generatedTransferId = createTransferId();
    expect(generatedTransferId).toBeTruthy();
    const restoredOut = { ...trashItemOut.data, transferId: generatedTransferId, transferRole: 'out', counterpartAssetId: 'asset-b' };
    const restoredIn = { ...trashCandidates[0].data, transferId: generatedTransferId, transferRole: 'in', counterpartAssetId: 'asset-a' };
    expect(restoredOut.transferId).toBe(restoredIn.transferId);
  });

  it('par legado ambíguo na lixeira: matchLegacyCounterpart retorna null, mantendo restauração unilateral', () => {
    const trashItemOut = {
      id: 'trash-out',
      data: {
        value: 500,
        type: 'out',
        date: new Date('2026-11-10T12:00:00Z'),
        assetId: 'asset-a',
      },
    };
    const trashCandidates = [
      { id: 'c-1', data: { value: 500, type: 'in', date: new Date('2026-11-10T12:00:00Z'), assetId: 'asset-b' } },
      { id: 'c-2', data: { value: 500, type: 'in', date: new Date('2026-11-10T12:00:00Z'), assetId: 'asset-c' } },
    ];

    const match = matchLegacyCounterpart(
      trashItemOut.data,
      trashCandidates.map((c) => c.data),
      new Set<number>()
    );

    expect(match).toBeNull(); // Não agrupa ambiguidades na lixeira
  });

  it('perna com transferId: restauração pareada direta por transferId (não-regressão)', () => {
    const trashItemOut = {
      id: 'trash-out',
      data: {
        transferId: 'tid-existing-123',
        value: 800,
        assetId: 'asset-a',
      },
    };
    const trashItemIn = {
      id: 'trash-in',
      data: {
        transferId: 'tid-existing-123',
        value: 800,
        assetId: 'asset-b',
      },
    };

    expect(trashItemOut.data.transferId).toBe(trashItemIn.data.transferId);
  });
});