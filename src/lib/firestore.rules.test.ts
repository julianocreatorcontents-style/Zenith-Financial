/**
 * Sprint 3 — T3 / Sprint 4a — T6: Testes de Regras Firestore no emulador.
 *
 * Executar com:  npm run test:rules
 * (usa `firebase emulators:exec`, que sobe o emulador e define FIRESTORE_EMULATOR_HOST)
 *
 * Cobertura:
 *   T3.1 — Cross-UID negado (leitura, escrita, update, delete)
 *   T3.2 — get vs list: query sem filtro de UID é negada; query do próprio UID filtra
 *   T3.3 — Payload inválido: uid ausente/divergente é negado. O GAP de conteúdo
 *          (type/label/value) foi FECHADO no Sprint 4a/T6 — ver describe T6.
 *   T3.4 — Campos imutáveis: uid/createdAt bloqueados em update de /transactions
 *          (inclui T3.4b.4 e T3.4b.7 para doc legado sem createdAt)
 *   T3.5 — Coleções não declaradas negadas pelo catch-all
 *   T3.6 — Acesso autorizado: CRUD no próprio doc em cada coleção declarada
 *   T6   — isValidTransactionPayload em create/update + fluxos reais do app
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const PROJECT_ID = 'demo-zenith';
const RULES_PATH = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

const makeTransaction = (uid: string, overrides: Record<string, unknown> = {}) => ({
  uid,
  label: 'Salário',
  value: 5000,
  type: 'in',
  assetId: 'asset-001',
  status: 'Confirmado',
  applied: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

// ---------------------------------------------------------------------------
// T3.1 — Cross-UID negado
// ---------------------------------------------------------------------------

describe('T3.1 — Cross-UID: acesso a dados de outro usuário negado', () => {
  it('A não pode ler documento de B em /transactions', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'transactions', 'tx-b-1'), makeTransaction('user-B'));
    });

    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(getDoc(doc(userA, 'transactions', 'tx-b-1')));
  });

  it('A não pode criar documento com uid de B em /transactions', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-forged'), makeTransaction('user-B'))
    );
  });

  it('A não pode atualizar documento de B', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'transactions', 'tx-b-3'), makeTransaction('user-B'));
    });

    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      updateDoc(doc(userA, 'transactions', 'tx-b-3'), { label: 'hack', uid: 'user-A' })
    );
  });

  it('A não pode deletar documento de B', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'transactions', 'tx-b-2'), makeTransaction('user-B'));
    });

    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(deleteDoc(doc(userA, 'transactions', 'tx-b-2')));
  });

  it('usuário não autenticado não pode ler nem escrever', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'transactions', 'tx-a-anon'), makeTransaction('user-A'));
    });

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'transactions', 'tx-a-anon')));
    await assertFails(
      setDoc(doc(anon, 'transactions', 'tx-anon'), makeTransaction('user-A'))
    );
  });
});

// ---------------------------------------------------------------------------
// T3.2 — get vs list
// ---------------------------------------------------------------------------

describe('T3.2 — get vs list: isolamento em queries', () => {
  const seedTwoUsers = async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'transactions', 'tx-a-1'), makeTransaction('user-A'));
      await setDoc(doc(db, 'transactions', 'tx-a-2'), makeTransaction('user-A'));
      await setDoc(doc(db, 'transactions', 'tx-b-1'), makeTransaction('user-B'));
    });
  };

  it('query SEM filtro de uid é negada (regra não pode provar posse de todos os docs)', async () => {
    await seedTwoUsers();
    const userA = testEnv.authenticatedContext('user-A').firestore();

    // Firestore não filtra resultados por regra: a query inteira é rejeitada.
    await assertFails(getDocs(collection(userA, 'transactions')));
  });

  it('query filtrada pelo próprio uid é aceita e retorna apenas docs do usuário', async () => {
    await seedTwoUsers();
    const userA = testEnv.authenticatedContext('user-A').firestore();

    const snapshot = await assertSucceeds(
      getDocs(query(collection(userA, 'transactions'), where('uid', '==', 'user-A')))
    );

    const returned = snapshot.docs.map((d) => d.id).sort();
    expect(returned).toEqual(['tx-a-1', 'tx-a-2']);
    expect(snapshot.docs.every((d) => d.data().uid === 'user-A')).toBe(true);
  });

  it('query filtrada pelo uid de outro usuário é negada', async () => {
    await seedTwoUsers();
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      getDocs(query(collection(userA, 'transactions'), where('uid', '==', 'user-B')))
    );
  });
});

// ---------------------------------------------------------------------------
// T3.3 / T6 — Payload: conteúdo validado pelas regras (Sprint 4a)
// ---------------------------------------------------------------------------

describe('T3.3 — Payload inválido', () => {
  it('uid ausente é negado (isWritingOwnData lê request.resource.data.uid)', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-no-uid'), {
        label: 'Sem UID',
        value: 100,
        type: 'in',
      })
    );
  });

  it('uid divergente do auth.uid é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-wrong-uid'), makeTransaction('user-X'))
    );
  });

  it('T3.3 INVERTIDO — campo de conteúdo inválido agora é REJEITADO (gap fechado no T6)', async () => {
    // Sprint 3 registrava aqui um GAP: as regras só verificavam `uid`. Com
    // isValidTransactionPayload() (Sprint 4a / T6), o gap foi fechado.
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-content-invalid'), {
        uid: 'user-A',
        type: 'tipo-desconhecido',
        value: -1,
      })
    );
  });

  it('payload completo e válido é aceito', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(doc(userA, 'transactions', 'tx-valid'), makeTransaction('user-A'))
    );
  });
});

// ---------------------------------------------------------------------------
// T6 — R2/T3.3: validação de conteúdo em create e update
// ---------------------------------------------------------------------------

describe('T6 — isValidTransactionPayload em create/update', () => {
  it('T6.1 — create com payload válido é aceito', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(doc(userA, 'transactions', 'tx-ok'), makeTransaction('user-A', { type: 'yield' }))
    );
  });

  it('T6.2 — create sem label é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    const { label: _omitted, ...withoutLabel } = makeTransaction('user-A');
    await assertFails(setDoc(doc(userA, 'transactions', 'tx-no-label'), withoutLabel));
  });

  it('T6.2b — create com label vazio é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-empty-label'), makeTransaction('user-A', { label: '' }))
    );
  });

  it('T6.3 — create com value string é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-string-value'), makeTransaction('user-A', { value: '100' }))
    );
  });

  it('T6.4 — create com type legado ("entrada") é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-legacy-type'), makeTransaction('user-A', { type: 'entrada' }))
    );
  });

  it('T6.4b — create com value zero/negativo é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-zero'), makeTransaction('user-A', { value: 0 }))
    );
    await assertFails(
      setDoc(doc(userA, 'transactions', 'tx-negative'), makeTransaction('user-A', { value: -5 }))
    );
  });

  it('T6.5 — update alterando label para vazio é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(doc(userA, 'transactions', 'tx-upd-label'), makeTransaction('user-A'))
    );
    await assertFails(updateDoc(doc(userA, 'transactions', 'tx-upd-label'), { label: '' }));
  });

  it('T6.6 — update alterando value para negativo é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(doc(userA, 'transactions', 'tx-upd-value'), makeTransaction('user-A'))
    );
    await assertFails(updateDoc(doc(userA, 'transactions', 'tx-upd-value'), { value: -1 }));
  });

  it('T6.6b — update alterando type para valor inválido é negado', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(doc(userA, 'transactions', 'tx-upd-type'), makeTransaction('user-A'))
    );
    await assertFails(updateDoc(doc(userA, 'transactions', 'tx-upd-type'), { type: 'saida' }));
  });

  it('T6.7 (O3) — doc legado sem createdAt NÃO pode ganhar createdAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const { createdAt: _omitted, ...legacy } = makeTransaction('user-A');
      await setDoc(doc(ctx.firestore(), 'transactions', 'tx-legacy-createdat'), legacy);
    });

    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      updateDoc(doc(userA, 'transactions', 'tx-legacy-createdat'), {
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('T6.8 — fluxo real do app continua passando (addTransaction e updateTransaction)', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();

    // addTransaction: label/value/type/assetId/applied/status/date/uid
    await assertSucceeds(
      setDoc(
        doc(userA, 'transactions', 'tx-flow-add'),
        makeTransaction('user-A', {
          type: 'out',
          label: 'Aluguel',
          value: 1500,
          date: new Date(),
        })
      )
    );

    // updateTransaction (branch normal): muda label e value, uid/createdAt intactos
    await assertSucceeds(
      updateDoc(doc(userA, 'transactions', 'tx-flow-add'), {
        label: 'Aluguel revisado',
        value: 1600,
      })
    );

    // updateTransaction (par de transferência): duas pernas, mesmo transferId
    const outLeg = makeTransaction('user-A', {
      type: 'out',
      transferId: 'tid-flow',
      transferRole: 'out',
      assetId: 'asset-a',
      counterpartAssetId: 'asset-b',
    });
    const inLeg = makeTransaction('user-A', {
      type: 'in',
      transferId: 'tid-flow',
      transferRole: 'in',
      assetId: 'asset-b',
      counterpartAssetId: 'asset-a',
    });
    await assertSucceeds(setDoc(doc(userA, 'transactions', 'tx-flow-out'), outLeg));
    await assertSucceeds(setDoc(doc(userA, 'transactions', 'tx-flow-in'), inLeg));
    await assertSucceeds(
      updateDoc(doc(userA, 'transactions', 'tx-flow-out'), { value: 200 })
    );
    await assertSucceeds(
      updateDoc(doc(userA, 'transactions', 'tx-flow-in'), { value: 200 })
    );
  });

  it('T6.8b — recalculateBalances (update só de partialBalance) continua permitido', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(doc(userA, 'transactions', 'tx-recalc'), makeTransaction('user-A'))
    );
    // O batch de recálculo envia apenas partialBalance: as regras avaliam o doc
    // resultante inteiro, que continua válido.
    await assertSucceeds(
      updateDoc(doc(userA, 'transactions', 'tx-recalc'), { partialBalance: 4800 })
    );
  });

  it('T6.8c — cron: create de rendimento (type yield) continua permitido', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(
        doc(userA, 'transactions', 'yield_asset-1_2026-11-13'),
        makeTransaction('user-A', {
          type: 'yield',
          label: 'CDB',
          value: 12.34,
          categoria_primaria: 'Rendimentos',
          assetId: 'asset-1',
        })
      )
    );
  });

  it('T6.8d — importação de planilha (sem applied/status) continua permitida', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(doc(userA, 'transactions', 'tx-import'), {
        uid: 'user-A',
        label: 'Mercado',
        value: 120.5,
        type: 'out',
        date: new Date(),
        createdAt: '2026-11-13T00:00:00.000Z',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// T3.4 — Campos imutáveis (GAP documentado — decisão de produto pendente)
// ---------------------------------------------------------------------------

describe('T3.4 — Campos imutáveis (uid/createdAt) em transactions', () => {
  const createOwnedTransaction = async (
    overrides: Record<string, unknown> = {}
  ): Promise<string> => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(
        doc(userA, 'transactions', 'tx-immut'),
        makeTransaction('user-A', overrides)
      )
    );
    return 'tx-immut';
  };

  it('T3.4b.1 — update alterando createdAt é negado', async () => {
    const id = await createOwnedTransaction({ createdAt: '2024-01-01T00:00:00.000Z' });
    const userA = testEnv.authenticatedContext('user-A').firestore();

    await assertFails(
      updateDoc(doc(userA, 'transactions', id), {
        createdAt: '2099-01-01T00:00:00.000Z',
      })
    );
  });

  it('T3.4b.2 — update alterando uid é negado', async () => {
    const id = await createOwnedTransaction();
    const userA = testEnv.authenticatedContext('user-A').firestore();

    await assertFails(updateDoc(doc(userA, 'transactions', id), { uid: 'user-B' }));
  });

  it('T3.4b.3 — update de campos mutáveis (label/value) continua permitido', async () => {
    const id = await createOwnedTransaction();
    const userA = testEnv.authenticatedContext('user-A').firestore();

    await assertSucceeds(
      updateDoc(doc(userA, 'transactions', id), { label: 'Salário revisado', value: 5100 })
    );

    const snapshot = await getDoc(doc(userA, 'transactions', id));
    expect(snapshot.data()?.label).toBe('Salário revisado');
    expect(snapshot.data()?.value).toBe(5100);
  });

  it('T3.4b.4 — doc legado SEM createdAt continua atualizável', async () => {
    // Seed sem createdAt (formato legado)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const { createdAt: _omitted, ...legacy } = makeTransaction('user-A');
      await setDoc(doc(ctx.firestore(), 'transactions', 'tx-legacy'), legacy);
    });

    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      updateDoc(doc(userA, 'transactions', 'tx-legacy'), { label: 'Legado editado' })
    );
  });

  it('T3.4b.5 — reenviar o doc completo com createdAt inalterado é permitido', async () => {
    // `diff()` só marca campos efetivamente alterados: reescrever o mesmo valor
    // não deve bloquear fluxos que enviam o documento inteiro.
    const id = await createOwnedTransaction({ createdAt: '2024-01-01T00:00:00.000Z' });
    const userA = testEnv.authenticatedContext('user-A').firestore();

    await assertSucceeds(
      updateDoc(doc(userA, 'transactions', id), {
        uid: 'user-A',
        createdAt: '2024-01-01T00:00:00.000Z',
        label: 'Salário',
      })
    );
  });

  it('T3.4b.6 — outras coleções (assets) NÃO foram endurecidas nesta rodada', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    const ref = doc(userA, 'assets', 'asset-scope');

    await assertSucceeds(
      setDoc(ref, { uid: 'user-A', value: 100, createdAt: '2024-01-01T00:00:00.000Z' })
    );
    // Escopo de T3.4 é apenas /transactions.
    await assertSucceeds(updateDoc(ref, { createdAt: '2099-01-01T00:00:00.000Z' }));
  });
});

// ---------------------------------------------------------------------------
// T3.5 — Coleções não declaradas negadas
// ---------------------------------------------------------------------------

describe('T3.5 — Coleções não declaradas: bloqueadas pelo catch-all', () => {
  it('escrita em coleção não declarada é negada', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(
      setDoc(doc(userA, 'undeclared_collection', 'doc-1'), { uid: 'user-A', data: 'x' })
    );
  });

  it('leitura em coleção não declarada é negada', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(getDoc(doc(userA, 'undeclared_collection', 'doc-1')));
  });

  it('escrita em /logs é negada', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertFails(setDoc(doc(userA, 'logs', 'entry-1'), { uid: 'user-A', msg: 'x' }));
  });
});

// ---------------------------------------------------------------------------
// T3.6 — Acesso autorizado funciona
// ---------------------------------------------------------------------------

describe('T3.6 — Acesso autorizado: CRUD no próprio doc', () => {
  const OWNED_COLLECTIONS = [
    'transactions',
    'assets',
    'ddas',
    'user_rules',
    'trash',
    'installments',
    'notifications',
  ] as const;

  it.each(OWNED_COLLECTIONS)('A cria, lê, atualiza e deleta doc em /%s', async (col) => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    const ref = doc(userA, col, 'doc-1');

    // Sprint 4a/T6: /transactions exige conteúdo válido (label/value/type/uid).
    const created =
      col === 'transactions' ? makeTransaction('user-A', { data: 'created' }) : { uid: 'user-A', data: 'created' };
    await assertSucceeds(setDoc(ref, created));
    const snap = await assertSucceeds(getDoc(ref));
    expect(snap.data()?.data).toBe('created');

    const updated = col === 'transactions' ? { label: 'updated' } : { uid: 'user-A', data: 'updated' };
    await assertSucceeds(updateDoc(ref, updated));
    const updatedSnap = await assertSucceeds(getDoc(ref));
    const updatedValue =
      col === 'transactions' ? updatedSnap.data()?.label : updatedSnap.data()?.data;
    expect(updatedValue).toBe('updated');

    await assertSucceeds(deleteDoc(ref));
  });

  it('/users/{uid}: apenas o próprio usuário', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(setDoc(doc(userA, 'users', 'user-A'), { uid: 'user-A', name: 'A' }));
    await assertFails(getDoc(doc(userA, 'users', 'user-B')));
  });

  it('/settings/{uid}: apenas o próprio usuário', async () => {
    const userA = testEnv.authenticatedContext('user-A').firestore();
    await assertSucceeds(
      setDoc(doc(userA, 'settings', 'user-A'), { uid: 'user-A', theme: 'dark' })
    );
    await assertFails(getDoc(doc(userA, 'settings', 'user-B')));
  });
});
