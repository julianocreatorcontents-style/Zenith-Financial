/**
 * Zenith Financial — Deleção de Conta (LGPD / Apple Store Compliance)
 *
 * Realiza a remoção em cascata dos dados do usuário:
 *   1. Coleções Firestore: users, settings, assets, transactions, ddas, notifications
 *   2. Firebase Auth: exclui o usuário autenticado
 *
 * LIMITAÇÃO IMPORTANTE (Firestore Spark Plan):
 * A deleção client-side é feita em batches de 500 documentos por vez usando `writeBatch`.
 * Para coleções com > 500 documentos, múltiplos batches são executados sequencialmente.
 * Se o usuário tiver volumes muito grandes de dados, recomenda-se implementar uma
 * Cloud Function (Firebase Functions) acionada via HTTPS que faça a deleção server-side.
 * Ver: https://firebase.google.com/docs/firestore/solutions/delete-collections
 */

import { db, collection, doc, query, where, getDocs, writeBatch } from '../firebase';
import { deleteUser as firebaseDeleteUser } from 'firebase/auth';
import type { User } from 'firebase/auth';

/** Coleções do Firestore que pertencem ao usuário (filtradas por campo `uid`) */
const USER_COLLECTIONS = [
  'assets',
  'transactions',
  'ddas',
  'notifications',
] as const;

/** Coleções com documento único identificado pelo UID (doc ID = uid) */
const USER_SINGLETON_COLLECTIONS = [
  'users',
  'settings',
] as const;

const BATCH_LIMIT = 500;

/**
 * Deleta todos os documentos de uma coleção onde `uid == userId`.
 * Usa batches de até 500 para respeitar o limite do Firestore.
 */
async function deleteCollectionByUid(collectionName: string, userId: string): Promise<void> {
  const q = query(collection(db, collectionName), where('uid', '==', userId));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return;

  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * Deleta o documento singleton do usuário em coleções com doc ID = uid.
 */
async function deleteSingletonDoc(collectionName: string, userId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(collection(db, collectionName), userId));
  await batch.commit();
}

export interface DeleteAccountResult {
  success: boolean;
  error?: string;
}

/**
 * Exclui permanentemente a conta do usuário e todos os seus dados no Firestore.
 *
 * NOTA SOBRE REAUTENTICAÇÃO:
 * O Firebase Auth exige que o usuário tenha se autenticado recentemente para
 * executar `deleteUser`. Se o token estiver expirado (> ~5 minutos desde o login),
 * o Firebase lançará um erro `auth/requires-recent-login`.
 * Neste caso, você deve solicitar ao usuário que faça login novamente antes de excluir.
 * Para uma implementação completa de reautenticação, implemente via Firebase UI
 * ou uma Cloud Function com privilégios de Admin SDK.
 */
export async function deleteAccount(user: User): Promise<DeleteAccountResult> {
  const userId = user.uid;

  try {
    // 1. Deletar documentos em coleções com campo `uid`
    for (const col of USER_COLLECTIONS) {
      await deleteCollectionByUid(col, userId);
    }

    // 2. Deletar documentos singleton (doc ID = uid)
    for (const col of USER_SINGLETON_COLLECTIONS) {
      try {
        await deleteSingletonDoc(col, userId);
      } catch {
        // Documento pode não existir; continua
      }
    }

    // 3. Limpar localStorage / cache local
    try {
      const keysToRemove = [
        `zenith_config_${userId}`,
        `zenith_gemini_api_key`,
        `biometry_${userId}`,
        `biometry_active_${userId}`,
        'zenith_visual_settings',
      ];
      keysToRemove.forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
    } catch {
      // Falha silenciosa no localStorage
    }

    // 4. Deletar usuário no Firebase Auth (deve ser a última ação)
    await firebaseDeleteUser(user);

    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
