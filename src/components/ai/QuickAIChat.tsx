import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, ArrowRight, Loader2, Bot, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import { chatWithZenithAI, getAiErrorMessage } from '../../lib/ai';
import type { Asset, Transaction } from '../../types/app';
import type { FinancialGoalTargets } from '../../lib/finance';
import { useAITools } from '../../hooks/useAITools';

export interface QuickAIChatProps {
  isOpen: boolean;
  onClose: () => void;
  getGeminiApiKey: () => string;
  transactions?: Transaction[];
  assets?: Asset[];
  goals?: FinancialGoalTargets | Record<string, unknown>;
  language?: string;
  onNavigateFullAI: (initialPrompt?: string) => void;
  onAddTransaction?: (data: Omit<Transaction, 'id' | 'uid' | 'createdAt'> & { uid?: string; applied?: boolean }) => Promise<unknown>;
  onUpdateTransaction?: (selectedTx: Transaction, data: Partial<Transaction>) => Promise<unknown>;
  onDeleteTransaction?: (item: Transaction) => Promise<unknown>;
  onCreateAsset?: (data: Omit<Asset, 'id' | 'uid' | 'createdAt'>) => Promise<unknown>;
  onUpdateAsset?: (id: string, data: Partial<Asset>) => Promise<unknown>;
  onDeleteAsset?: (item: Asset) => Promise<unknown>;
}

export function QuickAIChat({
  isOpen,
  onClose,
  getGeminiApiKey,
  transactions = [],
  assets = [],
  goals,
  language = 'pt-BR',
  onNavigateFullAI,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onCreateAsset,
  onUpdateAsset,
  onDeleteAsset,
}: QuickAIChatProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { executeTool } = useAITools({
    transactions,
    assets,
    goals,
    setActionFeedback: () => {},
    onAddTransaction: onAddTransaction ?? (() => Promise.resolve()),
    onUpdateTransaction,
    onDeleteTransaction,
    onCreateAsset,
    onUpdateAsset,
    onDeleteAsset,
    onNavigateTab: (tab) => {
      onClose();
      onNavigateFullAI(tab);
    },
  });

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (textToSend?: string) => {
    const query = (textToSend ?? prompt).trim();
    if (!query || loading) return;

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      setError(
        t(
          'Chave de API não configurada. Configure sua chave Gemini nas Configurações.',
          'API key not configured. Set up your Gemini key in Settings.'
        )
      );
      return;
    }

    setLoading(true);
    setError(null);
    setStatusText(t('Consultando Zenith IA...', 'Consulting Zenith AI...'));
    setLastQuestion(query);
    setPrompt('');

    try {
      const userContext = `Dados atuais do usuário:
- Total de ativos cadastrados: ${assets.length}
- Total de transações recentes: ${transactions.length}
- Ativos principais: ${assets.slice(0, 5).map((a) => `${a.name} (R$ ${a.value || 0})`).join(', ')}`;

      const result = await chatWithZenithAI(
        apiKey,
        [{ role: 'user', text: query }],
        userContext,
        executeTool,
        (s) => setStatusText(s)
      );

      setResponse(result.text);
    } catch (err) {
      setError(getAiErrorMessage(err, language));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const quickSuggestions = [
    t('Qual meu saldo este mês?', 'What is my balance this month?'),
    t('Resumo dos meus rendimentos', 'Summary of my yields'),
    t('Lançar gasto: Almoço R$ 35', 'Add expense: Lunch R$ 35'),
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      variant="sheet"
      showHandle={true}
      title={
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center">
            <Sparkles size={16} />
          </div>
          <span className="text-base font-bold text-[var(--text-primary)]">Zenith IA Express</span>
        </div>
      }
      subtitle={t(
        'Perguntas rápidas, consultas ou comandos sem sair da tela.',
        'Quick questions, queries, or commands without leaving the screen.'
      )}
      className="max-w-lg w-full"
    >
      <div className="space-y-4 pt-1">
        {/* Histórico curto de pergunta/resposta */}
        {lastQuestion && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <div className="bg-[var(--accent)] text-[var(--bg-app)] font-medium text-xs px-3.5 py-2 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm">
                {lastQuestion}
              </div>
            </div>

            {loading && (
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-card)] text-xs text-[var(--text-muted)] animate-pulse">
                <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                <span>{statusText || t('Processando...', 'Processing...')}</span>
              </div>
            )}

            {response && !loading && (
              <div className="flex gap-2.5 items-start">
                <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={16} />
                </div>
                <div className="flex-1 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl rounded-tl-none p-3.5 text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                  {response}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mensagem de Erro */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Sugestões Rápidas (quando não há resposta ainda) */}
        {!lastQuestion && !loading && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {t('Sugestões rápidas', 'Quick suggestions')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickSuggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSubmit(s)}
                  className="px-3 py-1.5 bg-[var(--bg-app)] border border-[var(--border-card)] hover:border-[var(--accent)]/50 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition-all active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-center gap-2 pt-2"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('Pergunte ou comande a IA...', 'Ask or command AI...')}
              disabled={loading}
              className="w-full py-3 px-4 bg-[var(--bg-app)] border border-[var(--border-card)] focus:border-[var(--accent)] text-xs text-[var(--text-primary)] rounded-2xl outline-none transition-colors pr-10"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            aria-label={t('Enviar pergunta', 'Send question')}
            className="w-11 h-11 bg-[var(--accent)] disabled:opacity-40 text-[var(--bg-app)] rounded-2xl flex items-center justify-center shrink-0 active:scale-95 transition-all shadow-md shadow-[var(--accent)]/20"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>

        {/* Rodapé: Link para Tela Completa da IA */}
        <div className="pt-2 border-t border-[var(--border-card)] flex justify-between items-center text-[11px]">
          <span className="text-[var(--text-muted)]">
            {t('Para conversas longas e histórico:', 'For long chats and history:')}
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateFullAI(lastQuestion || prompt);
            }}
            className="font-bold text-[var(--accent)] hover:underline flex items-center gap-1 active:scale-95"
          >
            <span>{t('Abrir Zenith IA Completa', 'Open Full Zenith AI')}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default QuickAIChat;
