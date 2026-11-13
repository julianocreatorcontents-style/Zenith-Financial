/**
 * Sprint 2 / T1 — Testes da orquestração de exclusão de conta
 * Arquivo: src/lib/deleteAccount.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks de módulos externos ───────────────────────────────────────────────

vi.mock('../firebase', () => ({
  db: {},
  collection: (db: unknown, name: string) => ({ _name: name }),
  doc: (_col: unknown, id: string) => ({ _id: id }),
  query: (...args: unknown[]) => ({ _query: args }),
  where: (...args: unknown[]) => ({ _where: args }),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  deleteUser: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  GoogleAuthProvider: class { static credential() { return {}; } },
  EmailAuthProvider: { credential: vi.fn(() => ({})) },
}));

vi.mock('../lib/ai', () => ({
  clearAIApiKey: vi.fn(),
}));

vi.mock('../lib/authSession', () => ({
  clearCachedUser: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

// ─── Importações após mocks ───────────────────────────────────────────────────

import { deleteAccount, clearAllLocalUserData } from './deleteAccount';
import { clearAIApiKey } from './ai';
import { clearCachedUser } from './authSession';
import * as firebaseAuth from 'firebase/auth';
import * as firebaseModule from '../firebase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'test-uid-123',
    email: 'test@example.com',
    providerData: [{ providerId: 'google.com' }],
    getIdTokenResult: vi.fn(async () => ({
      // Simula login recente: authTime há 30 segundos
      authTime: new Date(Date.now() - 30_000).toISOString(),
    })),
    ...overrides,
  } as unknown as import('firebase/auth').User;
}

function makeEmptySnapshot() {
  return { empty: true, docs: [], size: 0, exists: () => false };
}

function makeNonEmptySnapshot(count = 1) {
  const docs = Array.from({ length: count }, (_, i) => ({
    ref: { _id: `doc-${i}` },
  }));
  return { empty: false, docs, size: count };
}

function makeExistsSnapshot(exists: boolean) {
  return { exists: () => exists };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('deleteAccount — Sprint 2 / T1', () => {
  const localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]);

    // Mock localStorage
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => localStorageMock[k] ?? null,
      setItem: (k: string, v: string) => { localStorageMock[k] = v; },
      removeItem: (k: string) => { delete localStorageMock[k]; },
    });

    // Setup padrão: batch vazio (writeBatch.commit não falha)
    const mockBatch = { delete: vi.fn(), commit: vi.fn(async () => {}) };
    vi.mocked(firebaseModule.writeBatch).mockReturnValue(mockBatch as any);

    // Sem intenção pendente por padrão
    vi.mocked(firebaseModule.getDoc).mockResolvedValue(makeExistsSnapshot(false) as any);
    vi.mocked(firebaseModule.setDoc).mockResolvedValue(undefined);

    // Reauth Google OK por padrão
    vi.mocked(firebaseAuth.reauthenticateWithPopup).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── Teste 1: Sucesso completo ─────────────────────────────────────────────
  it('T1.1 — Sucesso completo: 9 coleções excluídas, auth deletado, storage limpo', async () => {
    const user = makeUser();

    // getDocs: retorna vazio (nada a deletar → verificação passa)
    vi.mocked(firebaseModule.getDocs).mockResolvedValue(makeEmptySnapshot() as any);
    // getDoc para singletons: não existem
    vi.mocked(firebaseModule.getDoc).mockResolvedValue(makeExistsSnapshot(false) as any);
    vi.mocked(firebaseAuth.deleteUser).mockResolvedValue(undefined);

    const result = await deleteAccount(user);

    expect(result.status).toBe('success');
    expect(result.success).toBe(true);
    expect(firebaseAuth.deleteUser).toHaveBeenCalledWith(user);
    expect(clearAIApiKey).toHaveBeenCalled();
    expect(clearCachedUser).toHaveBeenCalled();
  });

  // ─── Teste 2: requires-recent-login ───────────────────────────────────────
  it('T1.2 — requires-recent-login: ensureRecentAuth invocado, Firestore intocado', async () => {
    // Login expirado (> 5 min)
    const user = makeUser({
      getIdTokenResult: vi.fn(async () => ({
        authTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })),
    });

    // Google reauth falha com requires-recent-login (código diferente dos "cancelados")
    vi.mocked(firebaseAuth.reauthenticateWithPopup).mockRejectedValue(
      Object.assign(new Error('requires-recent-login'), { code: 'auth/requires-recent-login' })
    );

    const result = await deleteAccount(user);

    expect(result.status).toBe('reauth-required');
    // Nenhum dado do Firestore foi tocado
    expect(firebaseModule.getDocs).not.toHaveBeenCalled();
    expect(firebaseModule.writeBatch).not.toHaveBeenCalled();
    expect(firebaseAuth.deleteUser).not.toHaveBeenCalled();
  });

  // ─── Teste 3: Usuário cancela reauth ──────────────────────────────────────
  it('T1.3 — Reauth cancelada: retorna reauth-required sem tocar Firestore', async () => {
    const user = makeUser({
      getIdTokenResult: vi.fn(async () => ({
        authTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })),
    });

    vi.mocked(firebaseAuth.reauthenticateWithPopup).mockRejectedValue(
      Object.assign(new Error('popup-closed'), { code: 'auth/popup-closed-by-user' })
    );

    const result = await deleteAccount(user);

    expect(result.status).toBe('reauth-required');
    expect(firebaseModule.getDocs).not.toHaveBeenCalled();
    expect(firebaseAuth.deleteUser).not.toHaveBeenCalled();
  });

  // ─── Teste 4: Falha no meio da exclusão de dados ──────────────────────────
  it('T1.4 — Falha na 3ª coleção: retorna partial-data, intenção mantida', async () => {
    const user = makeUser();
    let callCount = 0;

    vi.mocked(firebaseModule.getDocs).mockImplementation(async () => {
      callCount++;
      // Coloca 2 chamadas OK (coleções 1 e 2 retornam vazias direto)
      // Na 3ª chamada (primeira "getDocs" para deletar), retorna docs
      // mas na verificação ("getDocs" de verificação) falha com itens remanescentes
      if (callCount === 3) {
        // Primeira query da 3ª coleção: retorna 1 doc para deletar
        return makeNonEmptySnapshot(1) as any;
      }
      if (callCount === 4) {
        // Verificação da 3ª coleção: ainda existe (simula falha de exclusão)
        return makeNonEmptySnapshot(1) as any;
      }
      return makeEmptySnapshot() as any;
    });

    // Singleton docs: não existem
    vi.mocked(firebaseModule.getDoc).mockResolvedValue(makeExistsSnapshot(false) as any);

    const result = await deleteAccount(user);

    expect(result.status).toBe('partial-data');
    expect(result.success).toBe(false);
    // firebaseDeleteUser não foi chamado
    expect(firebaseAuth.deleteUser).not.toHaveBeenCalled();
    // Intenção foi gravada (setDoc foi chamado para registrar intenção)
    expect(firebaseModule.setDoc).toHaveBeenCalled();
  });

  // ─── Teste 5: firebaseDeleteUser falha após dados excluídos ───────────────
  it('T1.5 — Auth delete falha: partial-auth, intenção com dataDone=true, chave limpa', async () => {
    const user = makeUser();

    // Dados excluídos com sucesso (tudo vazio)
    vi.mocked(firebaseModule.getDocs).mockResolvedValue(makeEmptySnapshot() as any);
    vi.mocked(firebaseModule.getDoc).mockResolvedValue(makeExistsSnapshot(false) as any);

    // firebaseDeleteUser falha
    vi.mocked(firebaseAuth.deleteUser).mockRejectedValue(
      new Error('Firebase: auth/network-request-failed')
    );

    const result = await deleteAccount(user);

    expect(result.status).toBe('partial-auth');
    expect(result.success).toBe(false);
    // Chave Gemini deve ser removida mesmo em partial-auth
    expect(clearAIApiKey).toHaveBeenCalled();
    expect(clearCachedUser).toHaveBeenCalled();
    // Intenção marcada como dataDone: true
    const setDocCall = vi.mocked(firebaseModule.setDoc).mock.calls;
    const intentionCall = setDocCall.find((c) =>
      JSON.stringify(c).includes('dataDone')
    );
    expect(intentionCall).toBeTruthy();
  });

  it('T1.5b — partial-auth preserva intenção local para retry', async () => {
    const user = makeUser();
    vi.mocked(firebaseModule.getDocs).mockResolvedValue(makeEmptySnapshot() as any);
    vi.mocked(firebaseModule.getDoc).mockResolvedValue(makeExistsSnapshot(false) as any);
    vi.mocked(firebaseAuth.deleteUser).mockRejectedValue(new Error('Firebase: auth/network-request-failed'));

    const result = await deleteAccount(user);
    expect(result.status).toBe('partial-auth');

    const raw = localStorage.getItem(`zenith_pending_deletion_${user.uid}`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.dataDone).toBe(true);
  });

  it('T1.5c — clearAllLocalUserData NÃO remove a intenção de retry', async () => {
    const uid = 'test-uid-123';
    localStorage.setItem(`zenith_pending_deletion_${uid}`, JSON.stringify({ dataDone: true }));

    await clearAllLocalUserData(uid);

    expect(localStorage.getItem(`zenith_pending_deletion_${uid}`)).not.toBeNull();
  });

  // ─── Teste 6: Chave Gemini removida em sucesso e partial-auth ─────────────
  it('T1.6 — Chave Gemini removida: em sucesso', async () => {
    const user = makeUser();
    vi.mocked(firebaseModule.getDocs).mockResolvedValue(makeEmptySnapshot() as any);
    vi.mocked(firebaseModule.getDoc).mockResolvedValue(makeExistsSnapshot(false) as any);
    vi.mocked(firebaseAuth.deleteUser).mockResolvedValue(undefined);

    await deleteAccount(user);

    expect(clearAIApiKey).toHaveBeenCalled();
  });

  it('T1.6b — Chave Gemini removida: em partial-auth', async () => {
    const user = makeUser();
    vi.mocked(firebaseModule.getDocs).mockResolvedValue(makeEmptySnapshot() as any);
    vi.mocked(firebaseModule.getDoc).mockResolvedValue(makeExistsSnapshot(false) as any);
    vi.mocked(firebaseAuth.deleteUser).mockRejectedValue(new Error('auth/network-failed'));

    await deleteAccount(user);

    expect(clearAIApiKey).toHaveBeenCalled();
  });
});
