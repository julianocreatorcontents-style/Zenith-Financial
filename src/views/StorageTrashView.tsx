import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { ArrowUpRight, History, Loader2, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { User } from 'firebase/auth';

interface StorageTrashViewProps {
  user: User;
  language?: string;
  embedded?: boolean;
}

const COLLECTION_LABELS: Record<string, { pt: string; en: string }> = {
  transactions: { pt: 'Transação', en: 'Transaction' },
  assets: { pt: 'Ativo', en: 'Asset' }
};

export default function StorageTrashView({ user, language, embedded = false }: StorageTrashViewProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'trash'),
      where('uid', '==', user.uid),
      orderBy('deletedAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setTrashItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setLoading(false);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'trash'));
    return unsub;
  }, [user]);

  const restoreItem = async (item: any) => {
    if (!item.originalCollection || !item.originalId) return;
    setBusyId(item.id);
    try {
      const { id: _id, ref: _ref, ...data } = item.data || {};
      const batch = writeBatch(db);
      batch.set(doc(db, item.originalCollection, item.originalId), data);
      batch.delete(doc(db, 'trash', item.id));
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `restore/${item.id}`);
    } finally {
      setBusyId(null);
    }
  };

  const permanentDelete = async (id: string) => {
    if (!confirm(t('Excluir permanentemente? Esta ação não pode ser desfeita.', 'Delete permanently? This action cannot be undone.'))) return;
    setBusyId(id);
    await deleteDoc(doc(db, 'trash', id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `trash/${id}`));
    setBusyId(null);
  };

  return (
    <div className={embedded ? 'space-y-4 pb-2' : 'space-y-6'}>
      {!embedded && (
        <header>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('Armazenamento e Lixeira', 'Storage & Trash')}</h2>
          <p className="text-[var(--text-muted)] text-sm">
            {t('Itens excluídos ficam aqui até você restaurar ou apagar permanentemente.', 'Deleted items stay here until you restore or permanently delete them.')}
          </p>
        </header>
      )}

      <div className={`bg-[var(--bg-app)] border border-[var(--border-card)] flex items-center justify-between ${embedded ? 'rounded-2xl p-3' : 'rounded-[28px] p-5'}`}>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('Itens na lixeira', 'Items in trash')}</p>
          <p className={`${embedded ? 'text-lg' : 'text-2xl'} font-bold text-[var(--text-primary)]`}>{trashItems.length}</p>
        </div>
        <div className={`${embedded ? 'w-9 h-9 rounded-xl' : 'w-12 h-12 rounded-2xl'} bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center`}>
          <History size={embedded ? 18 : 22} />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-[var(--accent)]" /></div>
      ) : trashItems.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-[var(--border-card)] rounded-[40px]">
          <Trash2 size={40} className="mx-auto text-[var(--text-muted)] mb-4 opacity-20" />
          <p className="text-[var(--text-muted)] text-sm font-bold uppercase tracking-widest">{t('Lixeira Vazia', 'Trash Empty')}</p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${embedded ? 'gap-3' : 'gap-4'}`}>
          {trashItems.map((item) => {
            const label = item.data?.label || item.data?.name || t('Sem título', 'Untitled');
            const typeLabel = item.originalCollection
              ? t(COLLECTION_LABELS[item.originalCollection]?.pt || item.originalCollection, COLLECTION_LABELS[item.originalCollection]?.en || item.originalCollection)
              : '';
            const deletedAt = item.deletedAt?.toDate ? item.deletedAt.toDate().toLocaleString() : '';
            return (
              <div key={item.id} className={`bg-[var(--bg-app)] border border-[var(--border-card)] flex items-center justify-between gap-2 ${embedded ? 'p-3 rounded-2xl' : 'p-6 rounded-[32px] gap-4'}`}>
                <div className={`flex items-center min-w-0 ${embedded ? 'gap-2' : 'gap-4'}`}>
                  <div className={`${embedded ? 'w-8 h-8' : 'w-10 h-10'} shrink-0 bg-white/5 rounded-xl flex items-center justify-center text-[var(--text-muted)]`}>
                    <History size={20} />
                  </div>
                  <div className="min-w-0">
                    <h4 className={`${embedded ? 'text-xs' : 'text-sm'} font-medium text-[var(--text-primary)] truncate`}>{label}</h4>
                    <p className={`${embedded ? 'text-[8px]' : 'text-[10px]'} text-[var(--text-muted)] uppercase font-bold tracking-widest truncate`}>
                      {typeLabel}{deletedAt ? ` • ${deletedAt}` : ''}
                    </p>
                  </div>
                </div>
                <div className={`flex shrink-0 ${embedded ? 'gap-1' : 'gap-2'}`}>
                  <button
                    onClick={() => restoreItem(item)}
                    disabled={busyId === item.id}
                    className={`${embedded ? 'p-2' : 'p-3'} bg-[var(--accent)]/10 text-[var(--accent)] rounded-xl hover:bg-[var(--accent)] hover:text-[var(--bg-app)] transition-all disabled:opacity-50`}
                    title={t('Restaurar', 'Restore')}
                  >
                    <ArrowUpRight size={embedded ? 15 : 18} />
                  </button>
                  <button
                    onClick={() => permanentDelete(item.id)}
                    disabled={busyId === item.id}
                    className={`${embedded ? 'p-2' : 'p-3'} bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50`}
                    title={t('Excluir permanentemente', 'Delete permanently')}
                  >
                    <Trash2 size={embedded ? 15 : 18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
