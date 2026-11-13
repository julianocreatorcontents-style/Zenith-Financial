/**
 * Zenith Financial — Deleção de Conta (LGPD / Apple Store Compliance)
 *
 * Realiza a remoção em cascata e ordenada dos dados do usuário:
 *   1. Reautenticação do usuário (ensureRecentAuth)
 *   2. Registro de intenção de exclusão (users/{uid}.pendingDeletion)
 *   3. Coleções Firestore: todas as 9 coleções (7 via query where uid == userId + 2 singletons)
 *      com verificação de ausência (count == 0).
 *   4. Firebase Auth: exclui o usuário autenticado (firebaseDeleteUser)
 *   5. Limpeza de storage local (chave Gemini, cache, biometria e preferências)
 *   6. Limpeza de intenção e confirmação final
 */

import type { User } from 'firebase/auth';
import {
  executeAccountDeletion,
  type AccountDeletionResult,
  type AccountDeletionStatus,
  type DeleteAccountOptions,
  ALL_USER_COLLECTIONS,
  USER_QUERY_COLLECTIONS,
  USER_SINGLETON_COLLECTIONS,
  ensureRecentAuth,
  clearAllLocalUserData,
  recordDeletionIntention,
  getPendingDeletionIntention,
  clearDeletionIntention,
} from './accountDeletion';

export type {
  AccountDeletionResult,
  AccountDeletionStatus,
  DeleteAccountOptions,
};

export {
  ALL_USER_COLLECTIONS,
  USER_QUERY_COLLECTIONS,
  USER_SINGLETON_COLLECTIONS,
  ensureRecentAuth,
  clearAllLocalUserData,
  recordDeletionIntention,
  getPendingDeletionIntention,
  clearDeletionIntention,
};

export type DeleteAccountResult = AccountDeletionResult;

/**
 * Exclui permanentemente a conta do usuário e todos os seus dados no Firestore.
 * Segue a ordem de contrato estrita definida no Sprint 2 / T1.
 */
export async function deleteAccount(
  user: User,
  options?: DeleteAccountOptions
): Promise<AccountDeletionResult> {
  return executeAccountDeletion(user, options);
}

export default deleteAccount;
