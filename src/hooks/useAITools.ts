import { useCallback } from 'react';
import type { Transaction, Asset } from '../types/app';
import { parseTransactionAmount } from '../lib/finance';
import type { FinancialGoalTargets } from '../lib/finance';

export interface UseAIToolsParams {
  assets: Asset[];
  transactions: Transaction[];
  goals?: FinancialGoalTargets | Record<string, unknown>;
  onAddTransaction: (data: Omit<Transaction, 'id' | 'uid' | 'createdAt'> & { uid?: string; applied?: boolean }) => Promise<unknown>;
  onUpdateTransaction?: (selectedTx: Transaction, data: Partial<Transaction>) => Promise<unknown>;
  onDeleteTransaction?: (item: Transaction) => Promise<unknown>;
  onCreateAsset?: (data: Omit<Asset, 'id' | 'uid' | 'createdAt'>) => Promise<unknown>;
  onUpdateAsset?: (id: string, data: Partial<Asset>) => Promise<unknown>;
  onDeleteAsset?: (item: Asset) => Promise<unknown>;
  onUpdateGoals?: (next: Record<string, number>) => Promise<unknown>;
  onNavigateTab?: (tab: string) => void;
  setActionFeedback: (msg: string | null) => void;
}

const formatBRL = (value: number): string => 
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function useAITools({
  assets,
  transactions,
  goals,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onCreateAsset,
  onUpdateAsset,
  onDeleteAsset,
  onUpdateGoals,
  onNavigateTab,
  setActionFeedback,
}: UseAIToolsParams) {
  const matchAsset = useCallback((nameOrId?: string): Asset | undefined => {
    if (!nameOrId) return undefined;
    const q = nameOrId.toLowerCase().trim();
    if (!q) return undefined;

    // 1. Busca exata por ID, nome ou emissor
    const exact = assets.find((a) => 
      a.id === nameOrId || 
      a.name?.toLowerCase() === q || 
      a.emissor?.toLowerCase() === q
    );
    if (exact) return exact;

    // 2. Busca bidirecional (ex: "99Pay" coincide com "Cofrinho 99Pay" e vice-versa)
    const substring = assets.find((a) => {
      const name = a.name?.toLowerCase() || '';
      const emissor = a.emissor?.toLowerCase() || '';
      return (name && (name.includes(q) || q.includes(name))) ||
             (emissor && (emissor.includes(q) || q.includes(emissor)));
    });
    if (substring) return substring;

    // 3. Busca por palavras-chave (tokens)
    const qWords = q.split(/\s+/).filter((w: string) => w.length > 2);
    let best: Asset | undefined = undefined;
    let maxScore = 0;
    for (const a of assets) {
      const haystack = `${a.name || ''} ${a.emissor || ''} ${a.detail || ''} ${a.subcategoria || ''}`.toLowerCase();
      let score = 0;
      for (const w of qWords) {
        if (haystack.includes(w)) score++;
      }
      if (score > maxScore) {
        maxScore = score;
        best = a;
      }
    }
    if (maxScore > 0) return best;

    return undefined;
  }, [assets]);

  const executeTool = useCallback(async (name: string, args: Record<string, unknown>): Promise<string> => {
    console.log('[Zenith IA] Tool call requested:', name, args);

    // --- 1. FERRAMENTAS DE LEITURA ---
    if (name === 'get_balances') {
      const total = assets.reduce((acc, a) => acc + Number(a.currentValue ?? a.manualBalance ?? a.value ?? 0), 0);
      return `[SISTEMA OBRIGATÓRIO: Você DEVE incluir 'Fonte: banco Zenith. Última sincronização: Firestore em tempo real' na sua resposta final]. Dados reais: Patrimonio Total: ${formatBRL(total)}. Ativos: ${JSON.stringify(assets.map(a => ({ nome: a.name, saldo: a.currentValue ?? a.manualBalance ?? a.value })))}`;
    }
    if (name === 'get_goals') {
      return `Fonte: banco Zenith. Metas: ${JSON.stringify(goals || {})}`;
    }
    if (name === 'get_transactions') {
      const recent = [...transactions].slice(0, 10);
      return `Fonte: banco Zenith. Transacoes recentes: ${JSON.stringify(recent)}`;
    }

    // --- 2. TRAVA DE SEGURANCA (ESCRITA) ---
    if (['createTransaction', 'updateAssetBalance', 'deleteTransaction', 'updateFinancialGoals', 'updateTransaction'].includes(name)) {
      if (!args.confirmation) {
        return `Aviso: Acao bloqueada. Voce deve perguntar ao usuario se ele confirma a operacao antes de executar.`;
      }
    }

    // --- 3. EXECUCAO REAL ---
    if (name === 'createTransaction') {
      try {
        const targetAsset = matchAsset(args.assetName as string | undefined);
        const nowStr = new Date().toISOString().split('T')[0];
        const txDate = (args.date as string | undefined) || nowStr;
        const val = parseTransactionAmount((args.value as number | string | undefined) ?? 0);
        const label = String(args.label || 'Sem descrição');
        const type = (args.type as 'in' | 'out' | 'yield' | undefined) || 'out';

        await onAddTransaction({
          label,
          value: val,
          type,
          date: txDate,
          categoria_primaria: (args.category as string | undefined) || 'Outros',
          assetId: targetAsset ? targetAsset.id : undefined,
          applied: true,
          uid: '',
        });

        setActionFeedback(`Lançamento criado: ${label} (${formatBRL(val)})`);
        return `Transação "${label}" de ${formatBRL(val)} (${type === 'in' ? 'Receita' : 'Despesa'}) cadastrada com sucesso${targetAsset ? ` associada à conta ${targetAsset.name}` : ''}.`;
      } catch (e: unknown) {
        return `Erro ao criar transação: ${(e as Error).message}`;
      }
    }

    if (name === 'deleteTransaction') {
      try {
        if (!onDeleteTransaction) return 'Operação de exclusão não disponível.';
        let targetTx: Transaction | undefined = undefined;
        if (args.transactionId) {
          targetTx = transactions.find((t) => t.id === args.transactionId);
        }
        if (!targetTx && args.searchLabel) {
          const q = String(args.searchLabel).toLowerCase().trim();
          targetTx = [...transactions]
            .filter((t) => t.label.toLowerCase().includes(q) || (t.categoria_primaria && t.categoria_primaria.toLowerCase().includes(q)))
            .sort((a, b) => {
              const dateValA = a.date as { toDate?: () => Date } | string | Date;
              const dateValB = b.date as { toDate?: () => Date } | string | Date;
              const dA = typeof dateValA === 'object' && dateValA !== null && 'toDate' in dateValA && typeof dateValA.toDate === 'function' ? dateValA.toDate() : new Date(dateValA as string | Date);
              const dB = typeof dateValB === 'object' && dateValB !== null && 'toDate' in dateValB && typeof dateValB.toDate === 'function' ? dateValB.toDate() : new Date(dateValB as string | Date);
              return dB.getTime() - dA.getTime();
            })[0];
        }

        if (!targetTx) {
          return `Nenhum lançamento encontrado correspondente a "${String(args.searchLabel || args.transactionId)}".`;
        }

        await onDeleteTransaction(targetTx);
        setActionFeedback(`Lançamento excluído: ${targetTx.label}`);
        return `Lançamento "${targetTx.label}" no valor de ${formatBRL(targetTx.value)} foi movido para a lixeira com sucesso.`;
      } catch (e: unknown) {
        return `Erro ao excluir lançamento: ${(e as Error).message}`;
      }
    }

    if (name === 'updateTransaction') {
      try {
        if (!onUpdateTransaction) return 'Operação de alteração não disponível.';
        let targetTx: Transaction | undefined = undefined;
        if (args.transactionId) {
          targetTx = transactions.find((t) => t.id === args.transactionId);
        }
        if (!targetTx && args.searchLabel) {
          const q = String(args.searchLabel).toLowerCase().trim();
          targetTx = [...transactions]
            .filter((t) => t.label.toLowerCase().includes(q))
            .sort((a, b) => {
              const dateValA = a.date as { toDate?: () => Date } | string | Date;
              const dateValB = b.date as { toDate?: () => Date } | string | Date;
              const dA = typeof dateValA === 'object' && dateValA !== null && 'toDate' in dateValA && typeof dateValA.toDate === 'function' ? dateValA.toDate() : new Date(dateValA as string | Date);
              const dB = typeof dateValB === 'object' && dateValB !== null && 'toDate' in dateValB && typeof dateValB.toDate === 'function' ? dateValB.toDate() : new Date(dateValB as string | Date);
              return dB.getTime() - dA.getTime();
            })[0];
        }

        if (!targetTx) {
          return `Nenhum lançamento encontrado para alteração correspondente a "${String(args.searchLabel || args.transactionId)}".`;
        }

        const updatedPayload: Partial<Transaction> = {
          ...targetTx,
          ...(args.newLabel ? { label: String(args.newLabel) } : {}),
          ...(args.newValue !== undefined ? { value: parseTransactionAmount(args.newValue as number | string) } : {}),
          ...(args.newCategory ? { categoria_primaria: String(args.newCategory) } : {}),
          ...(args.newType ? { type: args.newType as 'in' | 'out' | 'yield' } : {}),
          ...(args.newDate ? { date: args.newDate } : {}),
        };

        await onUpdateTransaction(targetTx, updatedPayload);
        setActionFeedback(`Lançamento atualizado: ${updatedPayload.label || targetTx.label}`);
        return `Lançamento "${targetTx.label}" atualizado com sucesso.`;
      } catch (e: unknown) {
        return `Erro ao atualizar lançamento: ${(e as Error).message}`;
      }
    }

    if (name === 'createAsset') {
      try {
        if (!onCreateAsset) return 'Operação de criação de ativo não disponível.';
        const val = parseTransactionAmount((args.value as number | string | undefined) ?? 0);
        const nameVal = String(args.name || 'Novo Ativo');
        const typeVal = (args.type as Asset['type']) || 'investment';
        const subcategoriaVal = (args.subcategoria as string | undefined) || (typeVal === 'liquidity' ? 'Conta Corrente' : 'Outros');
        const assetPayload: Omit<Asset, 'id' | 'uid' | 'createdAt'> = {
          name: nameVal,
          type: typeVal,
          value: val,
          manualBalance: val,
          valorInvestido: val,
          subcategoria: subcategoriaVal,
          emissor: String(args.institution || ''),
          detail: (args.subcategoria as string | undefined) || nameVal,
          manualBalanceDate: new Date().toISOString().split('T')[0],
        };

        await onCreateAsset(assetPayload);
        setActionFeedback(`Ativo criado: ${nameVal} (${formatBRL(val)})`);
        return `Ativo "${nameVal}" cadastrado com sucesso com saldo de ${formatBRL(val)}.`;
      } catch (e: unknown) {
        return `Erro ao criar ativo: ${(e as Error).message}`;
      }
    }

    if (name === 'updateAssetBalance') {
      try {
        if (!onUpdateAsset) return 'Operação de atualização de ativo não disponível.';
        const targetAsset = matchAsset((args.assetName as string | undefined) || (args.assetId as string | undefined));

        const newBalance = parseTransactionAmount((args.newBalance as number | string | undefined) ?? 0);
        const dailyYield = args.dailyYield !== undefined && args.dailyYield !== null ? parseTransactionAmount(args.dailyYield as number | string) : undefined;
        const nowStr = new Date().toISOString().split('T')[0];
        const updateDate = (args.yieldDate as string | undefined) || nowStr;

        if (!targetAsset) {
          if (onCreateAsset && args.assetName) {
            const assetNameStr = String(args.assetName);
            console.log('[Zenith IA] Ativo não cadastrado, criando automaticamente:', assetNameStr);
            await onCreateAsset({
              name: assetNameStr,
              type: 'liquidity',
              value: newBalance,
              manualBalance: newBalance,
              valorInvestido: newBalance,
              subcategoria: 'Conta / Cofrinho',
              emissor: assetNameStr.toLowerCase().includes('99') ? '99Pay' : assetNameStr,
              detail: assetNameStr,
              manualBalanceDate: updateDate,
              ...(dailyYield !== undefined && dailyYield > 0 ? { manualDailyYield: dailyYield } : {}),
            });

            if (dailyYield && dailyYield > 0) {
              await onAddTransaction({
                label: assetNameStr || 'Rendimento',
                value: dailyYield,
                type: 'yield',
                date: updateDate,
                categoria_primaria: 'Rendimentos',
                applied: true,
                uid: '',
              });
            }

            setActionFeedback(`Ativo criado e atualizado: ${assetNameStr} (${formatBRL(newBalance)})`);
            return `O ativo "${assetNameStr}" não estava cadastrado, então eu o criei com saldo de ${formatBRL(newBalance)}${dailyYield ? ` e registrei o rendimento de ${formatBRL(dailyYield)}` : ''}.`;
          }

          return `Ativo correspondente a "${String(args.assetName || args.assetId)}" não foi encontrado na carteira.`;
        }

        const updatePayload: Partial<Asset> = {
          value: newBalance,
          manualBalance: newBalance,
          manualBalanceDate: updateDate,
        };
        if (dailyYield !== undefined && dailyYield > 0) {
          updatePayload.manualDailyYield = dailyYield;
          updatePayload.lastYieldUpdate = updateDate;
        }

        await onUpdateAsset(targetAsset.id, updatePayload);

        if (dailyYield !== undefined && dailyYield > 0) {
          await onAddTransaction({
            label: targetAsset.name || 'Rendimento',
            value: dailyYield,
            type: 'yield',
            date: updateDate,
            categoria_primaria: 'Rendimentos',
            assetId: targetAsset.id,
            applied: true,
            uid: '',
          });
        }

        setActionFeedback(`Saldo atualizado: ${targetAsset.name} → ${formatBRL(newBalance)}`);
        return `Saldo do ativo "${targetAsset.name}" atualizado para ${formatBRL(newBalance)}${dailyYield ? ` com rendimento de ${formatBRL(dailyYield)} registrado no dia ${updateDate}` : ''} com sucesso.`;
      } catch (e: unknown) {
        return `Erro ao atualizar saldo: ${(e as Error).message}`;
      }
    }

    if (name === 'batchUpdateAssetBalances') {
      try {
        const updates = Array.isArray(args.updates) ? (args.updates as Record<string, unknown>[]) : [];
        if (updates.length === 0) return 'Nenhum ativo especificado para atualização.';

        const results: string[] = [];
        const nowStr = new Date().toISOString().split('T')[0];

        for (const item of updates) {
          if (!item.assetName) continue;
          const assetNameStr = String(item.assetName);
          const targetAsset = matchAsset(assetNameStr);
          const newBalance = parseTransactionAmount((item.newBalance as number | string | undefined) ?? 0);
          const dailyYield = item.dailyYield !== undefined && item.dailyYield !== null ? parseTransactionAmount(item.dailyYield as number | string) : undefined;
          const updateDate = (item.yieldDate as string | undefined) || nowStr;

          if (!targetAsset) {
            if (onCreateAsset) {
              await onCreateAsset({
                name: assetNameStr,
                type: 'liquidity',
                value: newBalance,
                manualBalance: newBalance,
                valorInvestido: newBalance,
                subcategoria: 'Conta / Cofrinho',
                emissor: assetNameStr.toLowerCase().includes('99') ? '99Pay' : (assetNameStr.toLowerCase().includes('mercado') ? 'Mercado Pago' : assetNameStr),
                detail: assetNameStr,
                manualBalanceDate: updateDate,
                ...(dailyYield !== undefined && dailyYield > 0 ? { manualDailyYield: dailyYield } : {}),
              });

              if (dailyYield && dailyYield > 0) {
                await onAddTransaction({
                  label: assetNameStr || 'Rendimento',
                  value: dailyYield,
                  type: 'yield',
                  date: updateDate,
                  categoria_primaria: 'Rendimentos',
                  applied: true,
                  uid: '',
                });
              }

              results.push(`Criado "${assetNameStr}": ${formatBRL(newBalance)}${dailyYield ? ` (+${formatBRL(dailyYield)})` : ''}`);
            }
          } else {
            const updatePayload: Partial<Asset> = {
              value: newBalance,
              manualBalance: newBalance,
              manualBalanceDate: updateDate,
            };
            if (dailyYield !== undefined && dailyYield > 0) {
              updatePayload.manualDailyYield = dailyYield;
              updatePayload.lastYieldUpdate = updateDate;
            }

            if (onUpdateAsset) {
              await onUpdateAsset(targetAsset.id, updatePayload);
            }

            if (dailyYield !== undefined && dailyYield > 0) {
              await onAddTransaction({
                label: targetAsset.name || 'Rendimento',
                value: dailyYield,
                type: 'yield',
                date: updateDate,
                categoria_primaria: 'Rendimentos',
                assetId: targetAsset.id,
                applied: true,
                uid: '',
              });
            }

            results.push(`Atualizado "${targetAsset.name}": ${formatBRL(newBalance)}${dailyYield ? ` (+${formatBRL(dailyYield)})` : ''}`);
          }
        }

        setActionFeedback(`Atualizados ${results.length} ativos em lote.`);
        return `Atualização em lote concluída com sucesso (${results.length} ativos processados):\n` + results.join('\n');
      } catch (e: unknown) {
        return `Erro ao processar atualização em lote: ${(e as Error).message}`;
      }
    }

    if (name === 'deleteAsset') {
      try {
        if (!onDeleteAsset) return 'Operação de exclusão de ativo não disponível.';
        let targetAsset: Asset | undefined = undefined;
        if (args.assetId) {
          targetAsset = assets.find((a) => a.id === args.assetId);
        }
        if (!targetAsset && args.assetName) {
          const q = String(args.assetName).toLowerCase().trim();
          targetAsset = assets.find((a) => 
            a.name.toLowerCase() === q || 
            a.name.toLowerCase().includes(q)
          );
        }

        if (!targetAsset) {
          return `Ativo "${String(args.assetName || args.assetId)}" não encontrado para exclusão.`;
        }

        await onDeleteAsset(targetAsset);
        setActionFeedback(`Ativo excluído: ${targetAsset.name}`);
        return `Ativo "${targetAsset.name}" movido para a lixeira com sucesso.`;
      } catch (e: unknown) {
        return `Erro ao excluir ativo: ${(e as Error).message}`;
      }
    }

    if (name === 'updateFinancialGoals') {
      try {
        if (!onUpdateGoals) return 'Operação de metas não disponível.';
        const nextGoals: Record<string, number> = {};
        if (args.emergencyReserve !== undefined) {
          nextGoals.emergencyReserve = Number(args.emergencyReserve);
        }
        if (args.financialFreedom !== undefined) {
          nextGoals.financialFreedom = Number(args.financialFreedom);
        }

        await onUpdateGoals(nextGoals);
        setActionFeedback(`Metas atualizadas com sucesso!`);
        return `Metas financeiras atualizadas com sucesso! ${
          args.emergencyReserve ? `Reserva de emergência: ${formatBRL(Number(args.emergencyReserve))}. ` : ''
        }${
          args.financialFreedom ? `Liberdade Financeira: ${formatBRL(Number(args.financialFreedom))}.` : ''
        }`;
      } catch (e: unknown) {
        return `Erro ao atualizar metas: ${(e as Error).message}`;
      }
    }

    if (name === 'navigateToTab') {
      try {
        if (!onNavigateTab) return 'Navegação não disponível.';
        const allowedTabs: Record<string, string> = {
          'Início': 'Início',
          'inicio': 'Início',
          'Carteira': 'Carteira',
          'carteira': 'Carteira',
          'Investimentos': 'Investimentos',
          'investimentos': 'Investimentos',
          'Armazenamento': 'Armazenamento',
          'armazenamento': 'Armazenamento',
          'Lixeira': 'Armazenamento',
          'lixeira': 'Armazenamento',
        };
        const target = allowedTabs[String(args.tab)] || 'Início';
        onNavigateTab(target);
        setActionFeedback(`Navegando para ${target}...`);
        return `Navegando para a aba ${target}...`;
      } catch (e: unknown) {
        return `Erro ao navegar: ${(e as Error).message}`;
      }
    }

    return 'Ferramenta não reconhecida.';
  }, [
    assets,
    transactions,
    goals,
    matchAsset,
    onAddTransaction,
    onUpdateTransaction,
    onDeleteTransaction,
    onCreateAsset,
    onUpdateAsset,
    onDeleteAsset,
    onUpdateGoals,
    onNavigateTab,
    setActionFeedback
  ]);

  return { executeTool, matchAsset };
}
