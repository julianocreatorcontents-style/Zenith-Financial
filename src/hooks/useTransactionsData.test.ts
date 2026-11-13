/**
 * Sprint 3 — Testes T1 (B1) e T2 (A4+B2)
 *
 * T1: recalculateBalances resiliente a histórico >500.
 *     Exercita o código REAL: `calculatePartialBalances` (lib/finance/calculators.ts)
 *     e `commitInChunks` (este hook), não cópias da lógica.
 *
 * T2: validação uniforme de escrita nos write points de `transactions`.
 *
 * As dependências de infraestrutura do hook (Firebase, Capacitor, IA, cron) são
 * mockadas porque os testes exercitam apenas as funções puras exportadas.
 */

import { describe, it, expect, vi } from 'vitest';
import { calculatePartialBalances } from '../lib/finance';
import {
  ValidationError,
  TransactionSchema,
  assertValidTransactionPayloads,
  getTransactionIssues,
  validateTransactionForWrite,
  validateTransactionImportRow,
} from '../lib/validations';
import { buildTransferLegs } from '../lib/finance/transfers';
import type { Asset, Transaction } from '../types/app';

vi.mock('../firebase', () => ({
  db: {},
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', LIST: 'LIST', WRITE: 'WRITE' },
  doc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('./useTransactionsCron', () => ({
  useTransactionsCron: vi.fn(),
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn() },
}));

vi.mock('../lib/ai', () => ({
  extractDocument: vi.fn(),
  getAiErrorMessage: (error: unknown) => String(error),
  GEMINI_API_KEY_STORAGE: 'gemini-key',
}));

import {
  BALANCE_BATCH_CHUNK_SIZE,
  commitInChunks,
  getRestoreIntegrityIssues,
} from './useTransactionsData';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeValidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: 'Salário',
    value: 5000,
    type: 'in',
    date: new Date(),
    uid: 'user-123',
    assetId: 'asset-abc',
    applied: true,
    status: 'Confirmado',
    ...overrides,
  };
}

function makeTransactions(count: number, value = 10): Array<{ type: string; value: number }> {
  return Array.from({ length: count }, () => ({ type: 'in', value }));
}

/** Executa commitInChunks sobre números e registra o estado final "persistido". */
async function runChunks(
  total: number,
  options: {
    chunkSize?: number;
    retries?: number;
    failChunks?: number[];
    persisted?: Set<number>;
  } = {}
) {
  const persisted = options.persisted ?? new Set<number>();
  const failing = new Set(options.failChunks ?? []);
  const items = Array.from({ length: total }, (_, i) => i);

  const result = await commitInChunks(items, {
    chunkSize: options.chunkSize ?? BALANCE_BATCH_CHUNK_SIZE,
    retries: options.retries ?? 1,
    apply: async (slice, chunkIndex) => {
      if (failing.has(chunkIndex)) {
        throw new Error(`falha simulada no chunk ${chunkIndex}`);
      }
      slice.forEach((item) => persisted.add(item));
    },
  });

  return { result, persisted };
}

// ---------------------------------------------------------------------------
// T1 — Cálculo puro de partialBalance
// ---------------------------------------------------------------------------

describe('T1 — calculatePartialBalances: cálculo puro (B1.a / B1.b)', () => {
  it('T1.1 — 100 transações: 1 batch de commit, saldo progressivo correto', async () => {
    const txs = Array.from({ length: 100 }, (_, i) => ({
      type: i % 3 === 0 ? 'out' : 'in',
      value: 100,
    }));

    const balances = calculatePartialBalances(txs);
    expect(balances).toHaveLength(100);

    const outs = txs.filter((t) => t.type === 'out').length;
    const ins = txs.filter((t) => t.type === 'in').length;
    expect(balances[balances.length - 1]).toBeCloseTo((ins - outs) * 100, 2);

    // O saldo é cumulativo: cada posição reflete todas as anteriores.
    const recomputed = txs.reduce<number[]>((acc, t) => {
      const previous = acc.length > 0 ? acc[acc.length - 1] : 0;
      acc.push(Math.round((previous + (t.type === 'in' ? t.value : -t.value)) * 100) / 100);
      return acc;
    }, []);
    expect(balances).toEqual(recomputed);

    const { result } = await runChunks(100);
    expect(result.totalChunks).toBe(1);
    expect(result.appliedChunks).toEqual([0]);
  });

  it('T1.2 — 501 transações: 2 batches, ambos aplicados e todos os docs atualizados', async () => {
    const balances = calculatePartialBalances(makeTransactions(501));
    expect(balances).toHaveLength(501);
    expect(balances[500]).toBeCloseTo(5010, 2);

    const { result, persisted } = await runChunks(501);
    expect(result.totalChunks).toBe(2);
    expect(result.appliedChunks).toEqual([0, 1]);
    expect(result.ok).toBe(true);
    expect(persisted.size).toBe(501);
  });

  it('T1.3a — falha no lote 2 de 3: retry interno recupera e converge', async () => {
    const { result, persisted } = await runChunks(1500, { failChunks: [] });

    // Agora o cenário de falha: o chunk 1 falha na 1ª tentativa.
    // commitInChunks tenta novamente (retries=1) e a falha é "transitória".
    const persisted2 = new Set<number>();
    let attemptsOnChunk1 = 0;
    const items = Array.from({ length: 1500 }, (_, i) => i);
    const result2 = await commitInChunks(items, {
      chunkSize: 500,
      retries: 1,
      apply: async (slice, chunkIndex) => {
        if (chunkIndex === 1) {
          attemptsOnChunk1++;
          if (attemptsOnChunk1 === 1) throw new Error('falha transitória no chunk 1');
        }
        slice.forEach((item) => persisted2.add(item));
      },
    });

    expect(result.totalChunks).toBe(3);
    expect(result.ok).toBe(true);
    expect(result2.ok).toBe(true);
    expect(result2.appliedChunks).toEqual([0, 1, 2]);
    expect(attemptsOnChunk1).toBe(2);
    expect(persisted2.size).toBe(1500);
  });

  it('T1.3b — falha persistente no lote 2 de 3: relata lotes aplicados e re-execução converge', async () => {
    // 1ª execução: chunk 1 falha nas duas tentativas
    const persisted = new Set<number>();
    const items = Array.from({ length: 1500 }, (_, i) => i);
    const first = await commitInChunks(items, {
      chunkSize: 500,
      retries: 1,
      apply: async (slice, chunkIndex) => {
        if (chunkIndex >= 1) throw new Error(`falha persistente no chunk ${chunkIndex}`);
        slice.forEach((item) => persisted.add(item));
      },
    });

    expect(first.ok).toBe(false);
    expect(first.failedChunk).toBe(1);
    expect(first.appliedChunks).toEqual([0]);
    expect(first.totalChunks).toBe(3);
    expect(persisted.size).toBe(500); // apenas o lote 1

    // Re-execução (idempotente) com a falha resolvida: converge para tudo aplicado
    const second = await commitInChunks(items, {
      chunkSize: 500,
      retries: 1,
      apply: async (slice) => {
        slice.forEach((item) => persisted.add(item));
      },
    });

    expect(second.ok).toBe(true);
    expect(second.appliedChunks).toEqual([0, 1, 2]);
    expect(persisted.size).toBe(1500);
  });

  it('T1.4 — idempotência: 2 execuções com o mesmo input produzem o mesmo output', async () => {
    const txs: Array<{ type: string; value: number }> = [
      { type: 'in', value: 1000 },
      { type: 'out', value: 300 },
      { type: 'yield', value: 50.75 },
      { type: 'out', value: 200.25 },
      { type: 'in', value: 500 },
    ];

    const run1 = calculatePartialBalances(txs);
    const run2 = calculatePartialBalances(txs);
    expect(run1).toEqual(run2);

    // Commit 2× sobre o mesmo estado (mapa) não altera o resultado
    const stored = new Map<number, number>();
    const balances = calculatePartialBalances(txs);
    for (let round = 0; round < 2; round++) {
      await commitInChunks(
        balances.map((partialBalance, index) => ({ index, partialBalance })),
        {
          chunkSize: 2,
          apply: async (slice) => {
            slice.forEach(({ index, partialBalance }) => stored.set(index, partialBalance));
          },
        }
      );
    }
    expect([...stored.values()]).toEqual(balances);
  });

  it('T1.5 — bordas: saldo negativo, zero, decimais e transferências neutras', () => {
    const txs = [
      { type: 'out', value: 1000 },                                     // -1000
      { type: 'in', value: 500 },                                       // -500
      { type: 'out', value: 1 },                                        // -501
      { type: 'in', value: 0.01 },                                      // -500.99
      { type: 'out', value: 100, transferId: 'tid-1' },                 // neutro
      { type: 'in', value: 100, transferId: 'tid-1' },                   // neutro
      { type: 'in', value: 500.99 },                                    // 0
      { type: 'out', value: 0.1 },                                      // -0.1
      { type: 'in', value: 0.2 },                                       // 0.1
    ];

    const balances = calculatePartialBalances(txs);
    expect(balances[0]).toBeCloseTo(-1000, 2);
    expect(balances[1]).toBeCloseTo(-500, 2);
    expect(balances[2]).toBeCloseTo(-501, 2);
    expect(balances[3]).toBeCloseTo(-500.99, 2);
    expect(balances[4]).toBeCloseTo(-500.99, 2); // transferência não move saldo
    expect(balances[5]).toBeCloseTo(-500.99, 2);
    expect(balances[6]).toBeCloseTo(0, 2);
    expect(balances[7]).toBeCloseTo(-0.1, 2);
    expect(balances[8]).toBeCloseTo(0.1, 2);

    // Saldo final bate com o cálculo puro refeito sobre as mesmas entradas
    expect(balances[balances.length - 1]).toBe(calculatePartialBalances(txs)[8]);
  });

  it('T1.5b — saldo é determinístico também em somas longas (1000 itens decimais)', () => {
    const txs = Array.from({ length: 1000 }, () => ({ type: 'in', value: 0.01 }));
    const balances = calculatePartialBalances(txs);
    expect(balances).toHaveLength(1000);
    // 1000 × 0.01 com arredondamento por passo = 10.00 exato
    expect(balances[999]).toBe(10);
    expect(Number.isInteger(balances[999] * 100)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T1 — Chunking
// ---------------------------------------------------------------------------

describe('T1 — commitInChunks: limites de lote', () => {
  it('500 transações → 1 chunk (limite exato do writeBatch)', async () => {
    const { result } = await runChunks(500);
    expect(result.totalChunks).toBe(1);
  });

  it('1000 transações → 2 chunks', async () => {
    const { result, persisted } = await runChunks(1000);
    expect(result.totalChunks).toBe(2);
    expect(persisted.size).toBe(1000);
  });

  it('0 transações → nenhum chunk e sucesso', async () => {
    const { result, persisted } = await runChunks(0);
    expect(result.totalChunks).toBe(0);
    expect(result.appliedChunks).toEqual([]);
    expect(result.ok).toBe(true);
    expect(persisted.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T2 — validateTransactionForWrite
// ---------------------------------------------------------------------------

describe('T2 — A4+B2: validateTransactionForWrite', () => {
  it('T2.1a — updateTransaction: valor negativo é rejeitado antes do write', () => {
    expect(() =>
      validateTransactionForWrite(makeValidPayload({ value: -100 }))
    ).toThrow(ValidationError);
  });

  it('T2.1b — updateTransaction: valor zero é rejeitado', () => {
    expect(() => validateTransactionForWrite(makeValidPayload({ value: 0 }))).toThrow(
      ValidationError
    );
  });

  it('T2.1c — updateTransaction: tipo desconhecido é rejeitado', () => {
    expect(() =>
      validateTransactionForWrite(makeValidPayload({ type: 'invalid_type' }))
    ).toThrow(ValidationError);
  });

  it('T2.1d — updateTransaction: label vazio/ausente é rejeitado', () => {
    expect(() => validateTransactionForWrite(makeValidPayload({ label: '' }))).toThrow(
      ValidationError
    );
    const withoutLabel = makeValidPayload();
    delete withoutLabel['label'];
    expect(() => validateTransactionForWrite(withoutLabel)).toThrow(ValidationError);
  });

  it('T2.1e — updateTransaction: in/out sem assetId é rejeitado', () => {
    expect(() =>
      validateTransactionForWrite(makeValidPayload({ type: 'in', assetId: undefined }))
    ).toThrow(ValidationError);
  });

  it('T2.1f — data inválida é rejeitada (Sprint 4a/R1: schema deixou de usar z.any)', () => {
    expect(() =>
      validateTransactionForWrite(makeValidPayload({ date: 'não-é-data' }))
    ).toThrow(ValidationError);

    try {
      validateTransactionForWrite(makeValidPayload({ date: '2026-13-45' }));
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const issues = (error as ValidationError).issues;
      expect(issues.some((issue) => issue.path[0] === 'date')).toBe(true);
      expect(issues.find((issue) => issue.path[0] === 'date')?.message).toMatch(/Data inválida/);
    }
  });

  it('T2.1g — date: undefined/null é rejeitado com mensagem clara (T2.5)', () => {
    const withoutDate = makeValidPayload();
    delete withoutDate['date'];
    expect(() => validateTransactionForWrite(withoutDate)).toThrow(ValidationError);
    expect(() => validateTransactionForWrite(makeValidPayload({ date: null }))).toThrow(
      ValidationError
    );
  });

  it('T2.1h — date ISO é aceita e NORMALIZADA para Date (T2.2)', () => {
    const parsed = validateTransactionForWrite(makeValidPayload({ date: '2026-11-13' }));
    expect(parsed.date).toBeInstanceOf(Date);
    expect((parsed.date as Date).getFullYear()).toBe(2026);
    expect((parsed.date as Date).getMonth()).toBe(10);
    expect((parsed.date as Date).getDate()).toBe(13);
  });

  it('T2.1i — date como Date é aceita (T2.3)', () => {
    const date = new Date('2026-11-13T12:00:00.000Z');
    const parsed = validateTransactionForWrite(makeValidPayload({ date }));
    expect(parsed.date).toBeInstanceOf(Date);
    expect((parsed.date as Date).getTime()).toBe(date.getTime());
  });

  it('T2.1j — date como timestamp epoch e Firestore Timestamp são aceitos (T2.4)', () => {
    // epoch em segundos
    const fromSeconds = validateTransactionForWrite(makeValidPayload({ date: 1763000000 }));
    expect(fromSeconds.date).toBeInstanceOf(Date);
    expect((fromSeconds.date as Date).getTime()).toBe(1763000000 * 1000);

    // epoch em milissegundos
    const fromMillis = validateTransactionForWrite(makeValidPayload({ date: 1763000000000 }));
    expect((fromMillis.date as Date).getTime()).toBe(1763000000000);

    // Firestore Timestamp (formato que chega de getDocs) — motivo da decisão D1
    const ts = { toDate: () => new Date('2026-11-13T00:00:00.000Z') };
    const fromTimestamp = validateTransactionForWrite(makeValidPayload({ date: ts }));
    expect(fromTimestamp.date).toBeInstanceOf(Date);
    expect((fromTimestamp.date as Date).toISOString()).toBe('2026-11-13T00:00:00.000Z');

    // Timestamp serializado { seconds }
    const fromSerialized = validateTransactionForWrite(makeValidPayload({ date: { seconds: 1763000000 } }));
    expect((fromSerialized.date as Date).getTime()).toBe(1763000000 * 1000);
  });

  it('T2.2 — payload válido é aceito e normalizado', () => {
    const parsed = validateTransactionForWrite(makeValidPayload());
    expect(parsed.label).toBe('Salário');
    expect(parsed.value).toBe(5000);
    expect(parsed.type).toBe('in');
  });

  it('T2.2b — update válido preserva o cálculo de partialBalance (sem regressão)', () => {
    const before: Array<{ type: string; value: number }> = [
      { type: 'in', value: 1000 },
      { type: 'out', value: 250 },
    ];
    const beforeBalances = calculatePartialBalances(before);

    // Simula updateTransaction: { ...selectedTx, ...data } com novo valor
    const updated = validateTransactionForWrite(
      makeValidPayload({ type: 'out', value: 400, label: 'Aluguel' })
    );
    expect(updated.value).toBe(400);

    const afterBalances = calculatePartialBalances([
      before[0],
      { type: updated.type, value: updated.value },
    ]);
    expect(beforeBalances[1]).toBe(750);
    expect(afterBalances[1]).toBe(600);
  });

  it('T2.3 — addTransaction: payload inválido é rejeitado com issues tipadas', async () => {
    try {
      validateTransactionForWrite(makeValidPayload({ value: -50, type: 'out' }));
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.name).toBe('ValidationError');
      expect(validationError.issues.length).toBeGreaterThan(0);
      expect(validationError.issues[0]).toHaveProperty('path');
      expect(validationError.issues[0]).toHaveProperty('message');
    }
  });

  it('T2.4a — confirmPendingTransaction: o mesmo schema rejeita payload inválido', () => {
    // confirmPendingTransaction usa TransactionSchema.parse (mesmo schema).
    expect(() =>
      TransactionSchema.parse({
        label: '',
        value: 100,
        type: 'in',
        assetId: 'asset-1',
        date: new Date(),
        applied: true,
        status: 'Confirmado',
      })
    ).toThrow();
  });

  it('T2.4b — addTransfer: pernas válidas passam; perna sem assetId é rejeitada', () => {
    const fromAsset = { id: 'from', name: 'Conta' } as Asset;
    const toAsset = { id: 'to', name: 'Cofre' } as Asset;
    const [outLeg, inLeg] = buildTransferLegs({
      transferId: 'tid-1',
      fromAsset,
      toAsset,
      value: 150.5,
      date: '2026-01-10',
    });

    expect(() =>
      validateTransactionForWrite({ ...outLeg, uid: 'user-1', applied: true, status: 'Confirmado' })
    ).not.toThrow();
    expect(() =>
      validateTransactionForWrite({ ...inLeg, uid: 'user-1', applied: true, status: 'Confirmado' })
    ).not.toThrow();

    expect(() =>
      validateTransactionForWrite({
        ...outLeg,
        assetId: undefined,
        uid: 'user-1',
        applied: true,
        status: 'Confirmado',
      })
    ).toThrow(ValidationError);
  });

  it('T2.5 — doc legado: issues detectadas mas cálculo continua (aceitar com warning)', () => {
    // Decisão registrada: useTransactionsCron/recalc aceitam doc legado com warning —
    // NÃO rejeitam e NÃO migram. getTransactionIssues é o detector usado no aviso.
    const legacyDoc = { ...makeValidPayload({ value: '1000' }) };
    expect(getTransactionIssues(legacyDoc)).not.toBeNull();
    // O recálculo continua usando o valor (parseTransactionAmount aceita string)
    expect(calculatePartialBalances([{ type: 'in', value: '1000' }])).toEqual([1000]);
  });

  it('T2.5b — importação: schema reduzido aceita linha sem assetId (não-regressão do CSV)', () => {
    const row = {
      label: 'Mercado',
      value: 120.5,
      type: 'out',
      date: new Date(),
      categoria_primaria: 'Alimentação',
    };

    // O schema completo rejeitaria (sem assetId) — foi o bug identificado no diagnóstico.
    expect(() => validateTransactionForWrite(row)).toThrow(ValidationError);
    // O schema de importação aceita, preservando a funcionalidade de importar planilhas.
    expect(() => validateTransactionImportRow(row)).not.toThrow();
  });

  it('T2.5c — importação: linha sem label ou com valor inválido é rejeitada', () => {
    expect(() =>
      validateTransactionImportRow({ label: '', value: 10, type: 'in' })
    ).toThrow(ValidationError);
    expect(() =>
      validateTransactionImportRow({ label: 'X', value: -10, type: 'in' })
    ).toThrow(ValidationError);
    expect(() =>
      validateTransactionImportRow({ label: 'X', value: 10, type: 'entrada' })
    ).toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// T3 — R5: lixeira (moveToTrash / restoreFromTrash)
// ---------------------------------------------------------------------------

describe('T3 — R5: lixeira não valida payload (decisão registrada)', () => {
  it('T3.1 — moveToTrash: doc válido não gera aviso (operação não valida por design)', () => {
    // moveToTrash não recebe payload novo: apenas copia o doc existente para /trash
    // e apaga o original. Não há payload a validar — o doc já foi validado na criação
    // (ou é legado, e aí a decisão é não bloquear a remoção).
    expect(getRestoreIntegrityIssues('transactions', makeValidPayload())).toBeNull();
  });

  it('T3.2 — restoreFromTrash: doc válido é restaurado sem aviso', () => {
    expect(getRestoreIntegrityIssues('transactions', makeValidPayload())).toBeNull();
  });

  it('T3.3 — restoreFromTrash: doc legado inválido é restaurado COM aviso (decisão A)', () => {
    const legacyDoc = {
      uid: 'user-123',
      label: 'Legado',
      value: '1000',
      type: 'entrada',
      date: new Date(),
    };

    const issues = getRestoreIntegrityIssues('transactions', legacyDoc);
    expect(issues).not.toBeNull();
    expect(issues!.length).toBeGreaterThan(0);

    // Decisão A: a função é apenas diagnóstico — não lança, não bloqueia o restore.
    expect(() => getRestoreIntegrityIssues('transactions', legacyDoc)).not.toThrow();
  });

  it('T3.3b — doc legado com date em Firestore Timestamp não gera falso aviso (R1)', () => {
    const docWithTimestamp = {
      ...makeValidPayload(),
      date: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    };
    expect(getRestoreIntegrityIssues('transactions', docWithTimestamp)).toBeNull();
  });

  it('T3.3c — coleções fora de transactions não são validadas no restore', () => {
    expect(getRestoreIntegrityIssues('assets', { anything: true })).toBeNull();
    expect(getRestoreIntegrityIssues(undefined, { anything: true })).toBeNull();
    expect(getRestoreIntegrityIssues('transactions', undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T4 — R4: updateTransaction do par de transferência
// ---------------------------------------------------------------------------

describe('T4 — R4: validação atômica do par de transferência', () => {
  /** Payload que o branch de transferência monta para cada perna. */
  function makeTransferLegPayload(
    type: 'out' | 'in',
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      uid: 'user-123',
      label: 'Transferência Conta → Cofre',
      value: 150.5,
      categoria_primaria: 'transferencia',
      applied: true,
      status: 'Confirmado',
      date: new Date('2026-01-10T12:00:00.000Z'),
      transferId: 'tid-1',
      type,
      transferRole: type,
      assetId: type === 'out' ? 'asset-from' : 'asset-to',
      counterpartAssetId: type === 'out' ? 'asset-to' : 'asset-from',
      ...overrides,
    };
  }

  it('T4.1 — par com payload inválido em uma perna é rejeitado', () => {
    expect(() =>
      assertValidTransactionPayloads([
        makeTransferLegPayload('out'),
        makeTransferLegPayload('in', { value: -10 }),
      ])
    ).toThrow(ValidationError);
  });

  it('T4.2 — par válido passa e mantém os campos normalizados', () => {
    expect(() =>
      assertValidTransactionPayloads([
        makeTransferLegPayload('out'),
        makeTransferLegPayload('in'),
      ])
    ).not.toThrow();

    const out = validateTransactionForWrite(makeTransferLegPayload('out'));
    const incoming = validateTransactionForWrite(makeTransferLegPayload('in'));
    expect(out.value).toBe(150.5);
    expect(out.type).toBe('out');
    expect(incoming.type).toBe('in');
    expect(out.transferId).toBe(incoming.transferId);
  });

  it('T4.3 — válida em uma perna e inválida na outra: rejeita o par (atomicidade)', () => {
    // A validação é um único gate antes do writeBatch: se lançar, nenhuma perna
    // chega a ser escrita. Aqui verificamos que o gate rejeita e aponta a perna certa.
    let error: unknown;
    try {
      assertValidTransactionPayloads([
        makeTransferLegPayload('out'),
        makeTransferLegPayload('in', { assetId: undefined }),
      ]);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const issues = (error as ValidationError).issues;
    expect(issues.some((issue) => issue.path[0] === 1)).toBe(true);
    expect(issues.some((issue) => issue.path[0] === 0)).toBe(false);
  });

  it('T4.3b — ambas as pernas inválidas: todas as issues são reportadas', () => {
    let error: unknown;
    try {
      assertValidTransactionPayloads([
        makeTransferLegPayload('out', { label: '' }),
        makeTransferLegPayload('in', { value: 0 }),
      ]);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const issues = (error as ValidationError).issues;
    expect(issues.some((issue) => issue.path[0] === 0)).toBe(true);
    expect(issues.some((issue) => issue.path[0] === 1)).toBe(true);
  });

  it('T4.3c — par sem alteração de valor continua válido (não-regressão do branch)', () => {
    expect(() =>
      assertValidTransactionPayloads([
        makeTransferLegPayload('out', { value: 0.01 }),
        makeTransferLegPayload('in', { value: 0.01 }),
      ])
    ).not.toThrow();
  });

  it('T4.3d — date como Firestore Timestamp (formato real do branch) é aceita', () => {
    // O branch monta `date: Timestamp.fromDate(txDate)`. O parser do domínio precisa
    // reconhecer o Timestamp para a validação atômica não rejeitar o par.
    const firestoreTimestamp = { toDate: () => new Date('2026-01-10T12:00:00.000Z') };

    expect(() =>
      assertValidTransactionPayloads([
        makeTransferLegPayload('out', { date: firestoreTimestamp }),
        makeTransferLegPayload('in', { date: firestoreTimestamp }),
      ])
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Não-regressão
// ---------------------------------------------------------------------------

describe('Não-regressão T1+T2', () => {
  it('TransactionSchema continua exportado e compatível', async () => {
    const mod = await import('../lib/validations');
    expect(mod.TransactionSchema).toBeDefined();
    expect(mod.ValidationError).toBeDefined();
    expect(mod.validateTransactionForWrite).toBeDefined();
    expect(mod.validateTransactionImportRow).toBeDefined();
  });

  it('ValidationError extends Error', () => {
    const err = new ValidationError([{ path: ['value'], message: 'positivo' }]);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('calculatePartialBalances não depende do formato Transaction completo', () => {
    expect(calculatePartialBalances([])).toEqual([]);
    const minimal = [{ type: 'in', value: 10 }] as Transaction[];
    expect(calculatePartialBalances(minimal)).toEqual([10]);
  });
});
