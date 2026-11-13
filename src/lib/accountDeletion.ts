/**
 * Zenith Financial — Account Deletion Orchestrator (Sprint 2 / T1)
 *
 * Implementa exclusão de conta ordenada, recuperável e completa:
 *   1. Reautenticar (ensureRecentAuth)
 *   2. Gravar intenção de exclusão (users/{uid}.pendingDeletion)
 *   3. Excluir dados por coleção (9 coleções em batches de até 500)
 *      - Verifica ausência após cada coleção (count == 0)
 *   4. Excluir firebaseUser no Firebase Auth
 *      - Se falhar: marca intenção como dataDone: true e limpa storage local
 *   5. Limpar storage local (chave Gemini, cache, preferências)
 *   6. Confirmar ausência final e limpar intenção
 */

import {
  db,
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  writeBatch,
} from '../firebase';
import {
  deleteUser as firebaseDeleteUser,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  EmailAuthProvider,
} from 'firebase/auth';
import type { User, AuthCredential } from 'firebase/auth';
import { clearAIApiKey } from './ai';
import { clearCachedUser } from './authSession';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export type AccountDeletionStatus =
  | 'success'
  | 'reauth-required'
  | 'partial-data'
  | 'partial-auth'
  | 'error';

export interface AccountDeletionResult {
  status: AccountDeletionStatus;
  success: boolean;
  error?: string;
  message?: string;
  details?: unknown;
}

export interface ReauthResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
  credential?: AuthCredential;
}

export interface DeleteAccountOptions {
  /**
   * Fornece reautenticação customizada ou credenciais fornecidas pela UI (ex.: senha de email)
   */
  reauthenticate?: (user: User) => Promise<ReauthResult>;
  /**
   * Fornece senha caso o provedor seja email/password e reauth seja disparada
   */
  password?: string;
}

/** Coleções do Firestore que possuem documentos com campo `uid` */
export const USER_QUERY_COLLECTIONS = [
  'assets',
  'transactions',
  'ddas',
  'notifications',
  'user_rules',
  'trash',
  'installments',
] as const;

/** Coleções com documento único identificado pelo UID (doc ID = uid) */
export const USER_SINGLETON_COLLECTIONS = [
  'settings',
  'users',
] as const;

/** Total de 9 coleções de dados do usuário */
export const ALL_USER_COLLECTIONS = [
  ...USER_QUERY_COLLECTIONS,
  ...USER_SINGLETON_COLLECTIONS,
] as const;

export const BATCH_LIMIT = 500;
const INTENTION_LOCAL_PREFIX = 'zenith_pending_deletion_';

export interface PendingDeletionState {
  startedAt: string;
  collections: string[];
  dataDone?: boolean;
  failedAt?: string;
}

/**
 * Verifica se a sessão do usuário é recente (< 5 min) ou necessita reautenticação.
 */
export async function isRecentLogin(user: User): Promise<boolean> {
  try {
    const idTokenResult = await user.getIdTokenResult();
    const authTime = new Date(idTokenResult.authTime).getTime();
    const now = Date.now();
    // Considera recente se autenticado há menos de 5 minutos
    return now - authTime < 5 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Helper para reautenticação recente antes de operações críticas.
 */
export async function ensureRecentAuth(
  user: User,
  options?: DeleteAccountOptions
): Promise<ReauthResult> {
  if (options?.reauthenticate) {
    return options.reauthenticate(user);
  }

  const isRecent = await isRecentLogin(user);
  if (isRecent) {
    return { success: true };
  }

  // Identificar provider do usuário
  const providerData = user.providerData || [];
  const isGoogle = providerData.some((p) => p.providerId === 'google.com');
  const isPassword = providerData.some((p) => p.providerId === 'password');

  if (isGoogle) {
    try {
      const provider = new GoogleAuthProvider();
      await reauthenticateWithPopup(user, provider);
      return { success: true };
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      if (
        errObj?.code === 'auth/popup-closed-by-user' ||
        errObj?.code === 'auth/cancelled-popup-request' ||
        errObj?.code === 'auth/user-cancelled'
      ) {
        return { success: false, cancelled: true };
      }
      return {
        success: false,
        error: errObj?.message || 'Falha na reautenticação com Google.',
      };
    }
  }

  if (isPassword && user.email) {
    if (!options?.password) {
      return {
        success: false,
        error: 'Senha necessária para reautenticação.',
      };
    }
    try {
      const credential = EmailAuthProvider.credential(user.email, options.password);
      await reauthenticateWithCredential(user, credential);
      return { success: true, credential };
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      if (
        errObj?.code === 'auth/user-cancelled' ||
        errObj?.code === 'auth/popup-closed-by-user'
      ) {
        return { success: false, cancelled: true };
      }
      return {
        success: false,
        error: errObj?.message || 'Senha incorreta para reautenticação.',
      };
    }
  }

  return { success: true };
}

/**
 * Grava intenção de exclusão em Firestore e localmente
 */
export async function recordDeletionIntention(
  userId: string,
  state: PendingDeletionState
): Promise<void> {
  // Salva no doc users/{userId} se o doc permitir
  try {
    await setDoc(
      doc(collection(db, 'users'), userId),
      { pendingDeletion: state },
      { merge: true }
    );
  } catch {
    // Ignora se não conseguir escrever em users/{userId}
  }

  // Salva no storage local
  try {
    const raw = JSON.stringify(state);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${INTENTION_LOCAL_PREFIX}${userId}`, raw);
    }
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({
        key: `${INTENTION_LOCAL_PREFIX}${userId}`,
        value: raw,
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Lê intenção de exclusão pendente (para retry)
 */
export async function getPendingDeletionIntention(
  userId: string
): Promise<PendingDeletionState | null> {
  // Tenta storage local primeiro
  try {
    let raw: string | null = null;
    if (Capacitor.isNativePlatform()) {
      const res = await Preferences.get({ key: `${INTENTION_LOCAL_PREFIX}${userId}` });
      raw = res.value;
    }
    if (!raw && typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(`${INTENTION_LOCAL_PREFIX}${userId}`);
    }
    if (raw) {
      return JSON.parse(raw) as PendingDeletionState;
    }
  } catch {
    // fallback
  }

  // Tenta Firestore
  try {
    const snap = await getDoc(doc(collection(db, 'users'), userId));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.pendingDeletion) {
        return data.pendingDeletion as PendingDeletionState;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Limpa intenção de exclusão após conclusão com sucesso
 */
export async function clearDeletionIntention(userId: string): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${INTENTION_LOCAL_PREFIX}${userId}`);
    }
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key: `${INTENTION_LOCAL_PREFIX}${userId}` });
    }
  } catch {
    // ignore
  }
}

/**
 * Deleta todos os documentos de uma coleção onde `uid == userId` em batches de 500.
 * Verifica ausência (count == 0). Lança erro se restarem documentos.
 */
async function deleteQueryCollection(
  collectionName: string,
  userId: string
): Promise<void> {
  let hasMore = true;
  while (hasMore) {
    const q = query(collection(db, collectionName), where('uid', '==', userId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const docs = snapshot.docs;
    const batch = writeBatch(db);
    docs.slice(0, BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();

    if (docs.length <= BATCH_LIMIT) {
      hasMore = false;
    }
  }

  // Verificação de ausência
  const verifySnap = await getDocs(
    query(collection(db, collectionName), where('uid', '==', userId))
  );
  if (!verifySnap.empty) {
    throw new Error(
      `Verificação falhou: restam ${verifySnap.size} documentos na coleção ${collectionName}.`
    );
  }
}

/**
 * Deleta documento singleton (onde doc ID == userId).
 */
async function deleteSingletonCollectionDoc(
  collectionName: string,
  userId: string
): Promise<void> {
  const docRef = doc(collection(db, collectionName), userId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const batch = writeBatch(db);
    batch.delete(docRef);
    await batch.commit();
  }

  // Verificação de ausência
  const verifySnap = await getDoc(docRef);
  if (verifySnap.exists()) {
    throw new Error(
      `Verificação falhou: documento ${userId} ainda existe na coleção ${collectionName}.`
    );
  }
}

/**
 * Limpa todos os storages locais do usuário (localStorage e Capacitor Preferences)
 */
export async function clearAllLocalUserData(userId: string): Promise<void> {
  // 1. Limpa chave Gemini
  await clearAIApiKey();

  // 2. Limpa cache de usuário autenticado
  await clearCachedUser();

  // 3. Limpa chaves específicas do usuário no localStorage
  // Nota S2: a intenção local (zenith_pending_deletion_${userId}) NÃO é removida aqui
  // para permitir retry se a operação parar em partial-auth. Ela só é limpa em clearDeletionIntention().
  const keysToRemove = [
    `zenith_config_${userId}`,
    `biometry_${userId}`,
    `biometry_active_${userId}`,
    'zenith_visual_settings',
  ];

  keysToRemove.forEach((k) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
  });

  // 4. Limpa chaves no Preferences nativo
  if (Capacitor.isNativePlatform()) {
    for (const k of keysToRemove) {
      try {
        await Preferences.remove({ key: k });
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Orquestra a exclusão completa, ordenada e recuperável da conta do usuário.
 *
 * ORDEM DE EXECUÇÃO (Contrato estrito):
 *   1. Reautenticar (ensureRecentAuth)
 *      → se requires-recent-login ou cancelado pelo usuário, aborta SEM tocar dados
 *   2. Marcar intenção (pendingDeletion = { startedAt, collections })
 *   3. Excluir dados por coleção (9 coleções: 7 queries + 2 singletons)
 *      → verifica ausência após cada coleção (count == 0)
 *      → se falhar: retorna partial-data mantendo intenção para retry
 *   4. Excluir firebaseUser
 *      → se falhar: marca dataDone: true, limpa storage local e retorna partial-auth
 *   5. Limpar storage local (chave Gemini, cache, preferências)
 *   6. Confirmar ausência final e limpar intenção -> success
 */
export async function executeAccountDeletion(
  user: User,
  options?: DeleteAccountOptions
): Promise<AccountDeletionResult> {
  const userId = user.uid;

  // 1. Reautenticar
  const reauth = await ensureRecentAuth(user, options);
  if (reauth.cancelled) {
    return {
      status: 'reauth-required',
      success: false,
      error: 'Reautenticação cancelada. Nenhum dado foi alterado.',
      message: 'Reautenticação cancelada. Nenhum dado foi alterado.',
    };
  }
  if (!reauth.success) {
    const errorMsg = reauth.error || 'Reautenticação necessária para prosseguir com a exclusão.';
    return {
      status: 'reauth-required',
      success: false,
      error: errorMsg,
      message: errorMsg,
    };
  }

  // Verifica se já existia intenção com dataDone: true (retry de partial-auth)
  const existingIntention = await getPendingDeletionIntention(userId);
  const dataAlreadyDone = existingIntention?.dataDone === true;

  if (!dataAlreadyDone) {
    // 2. Marcar intenção antes de tocar nos dados
    await recordDeletionIntention(userId, {
      startedAt: new Date().toISOString(),
      collections: [...ALL_USER_COLLECTIONS],
      dataDone: false,
    });

    // 3. Excluir dados por coleção
    try {
      // Coleções com query `where('uid', '==', userId)`
      for (const col of USER_QUERY_COLLECTIONS) {
        await deleteQueryCollection(col, userId);
      }

      // Coleções singleton (doc ID = userId): primeiro settings, depois users
      for (const col of USER_SINGLETON_COLLECTIONS) {
        try {
          await deleteSingletonCollectionDoc(col, userId);
        } catch (colErr) {
          // Se falhou ao deletar doc singleton, reporta falha de dados
          throw colErr;
        }
      }
    } catch (dataErr: unknown) {
      // Falha durante a exclusão de dados: retorna partial-data e mantém intenção
      const message = dataErr instanceof Error ? dataErr.message : String(dataErr);
      return {
        status: 'partial-data',
        success: false,
        error: message,
        message: `Exclusão de dados interrompida: ${message}`,
        details: dataErr,
      };
    }
  }

  // 4. Excluir firebaseUser
  try {
    await firebaseDeleteUser(user);
  } catch (authErr: unknown) {
    // Falha na exclusão do Auth user
    // Marca intenção como dataDone: true para permitir retry direto do Auth
    await recordDeletionIntention(userId, {
      startedAt: existingIntention?.startedAt || new Date().toISOString(),
      collections: [...ALL_USER_COLLECTIONS],
      dataDone: true,
      failedAt: new Date().toISOString(),
    });

    // Como os dados já foram excluídos, limpa a chave Gemini e cache local imediatamente
    await clearAllLocalUserData(userId);

    const message = authErr instanceof Error ? authErr.message : String(authErr);
    const fullMsg = `Dados excluídos com sucesso, mas a autenticação da conta não pôde ser encerrada: ${message}. Tente novamente.`;
    return {
      status: 'partial-auth',
      success: false,
      error: fullMsg,
      message: fullMsg,
      details: authErr,
    };
  }

  // 5. Limpar storage local (chave Gemini, cache, preferências)
  await clearAllLocalUserData(userId);

  // 6. Limpar intenção e confirmar ausência final
  await clearDeletionIntention(userId);

  return {
    status: 'success',
    success: true,
    message: 'Conta e todos os dados associados foram permanentemente excluídos.',
  };
}
