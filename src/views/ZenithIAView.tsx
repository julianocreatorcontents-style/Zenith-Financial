import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Loader2, 
  Trash2, 
  CheckCircle2, 
  History, 
  ArrowLeft, 
  Plus, 
  RefreshCw 
} from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { chatWithZenithAI } from '../lib/ai';
import type { ChatAIResult } from '../lib/ai';
import type { FinancialGoalTargets } from '../lib/finance';
import { usePersistentState } from '../hooks/usePersistentState';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
import { useAITools } from '../hooks/useAITools';
import ChatMessageBubble from '../components/ai/ChatMessageBubble';
import type { Message } from '../components/ai/ChatMessageBubble';
import ChatInputBar from '../components/ai/ChatInputBar';
import type { GeminiModel } from '../components/ai/ChatInputBar';
import type { Transaction, Asset } from '../types/app';

const AVAILABLE_GEMINI_MODELS: GeminiModel[] = [
  { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', desc: 'Padrão / Mais Rápido' },
  { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite', desc: 'Ultra Leve' },
  { id: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview', desc: 'Nova Geração Flash' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'gemini-3.1-flash-lite-preview', desc: 'Preview Flash Lite' },
  { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', desc: 'Raciocínio Avançado' },
];

interface ChatSession {
  id: string;
  title: string;
  date: string;
  messages: Message[];
}

const MAX_SESSIONS = 30;

interface ZenithIAViewProps {
  user?: unknown;
  language?: string;
  transactions: Transaction[];
  assets: Asset[];
  goals?: FinancialGoalTargets | Record<string, unknown>;
  getGeminiApiKey: () => string;
  onAddTransaction: (data: Omit<Transaction, 'id' | 'uid' | 'createdAt'> & { uid?: string; applied?: boolean }) => Promise<unknown>;
  onUpdateTransaction?: (selectedTx: Transaction, data: Partial<Transaction>) => Promise<unknown>;
  onDeleteTransaction?: (item: Transaction) => Promise<unknown>;
  onCreateAsset?: (data: Omit<Asset, 'id' | 'uid' | 'createdAt'>) => Promise<unknown>;
  onUpdateAsset?: (id: string, data: Partial<Asset>) => Promise<unknown>;
  onDeleteAsset?: (item: Asset) => Promise<unknown>;
  onUpdateGoals?: (next: Record<string, number>) => Promise<unknown>;
  onNavigateTab?: (tab: string) => void;
  onApiKeyError?: (error: unknown) => void;
  userRules?: unknown[];
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
}

export default function ZenithIAView({
  language,
  transactions = [],
  assets = [],
  goals,
  getGeminiApiKey,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onCreateAsset,
  onUpdateAsset,
  onDeleteAsset,
  onUpdateGoals,
  onNavigateTab,
  onApiKeyError,
  initialPrompt,
  onClearInitialPrompt,
}: ZenithIAViewProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatSessions, setChatSessions] = usePersistentState<ChatSession[]>('zenith_ia_chat_sessions', []);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [likedIndices, setLikedIndices] = useState<Record<number, 'up' | 'down'>>({});
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [activeModelName, setActiveModelName] = useState('gemini-2.5-flash');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isListening, toggleListening } = useVoiceRecognition({ language });

  // Auto-ajuste de altura da textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Carrega prompt inicial se redirecionado de outro componente (ex: FAB Central Inteligente)
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setInput(initialPrompt.trim());
      onClearInitialPrompt?.();
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [initialPrompt, onClearInitialPrompt]);

  // Gera título da sessão a partir da primeira mensagem do usuário
  const generateSessionTitle = (msgs: Message[]) => {
    const first = msgs.find(m => m.role === 'user');
    if (!first) return t('Nova conversa', 'New conversation');
    const text = first.text.trim();
    return text.length > 50 ? text.substring(0, 50) + '…' : text;
  };

  // Salvar sessão atual no histórico
  const archiveCurrentSession = useCallback(() => {
    if (messages.length < 2) return; // Precisa de pelo menos 1 pergunta e 1 resposta
    const sessionId = activeSessionId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!activeSessionId) {
      setActiveSessionId(sessionId);
    }
    const session: ChatSession = {
      id: sessionId,
      title: generateSessionTitle(messages),
      date: new Date().toISOString(),
      messages: [...messages],
    };
    setChatSessions((prev: ChatSession[]) => {
      const filtered = prev.filter((s: ChatSession) => s.id !== session.id);
      return [session, ...filtered].slice(0, MAX_SESSIONS);
    });
    return session.id;
  }, [messages, activeSessionId, setChatSessions]);

  // Auto-salvar a conversa ativa quando mensagens mudam (com pelo menos 2 mensagens)
  useEffect(() => {
    if (messages.length >= 2) {
      const savedId = archiveCurrentSession();
      if (!activeSessionId && savedId) {
        setActiveSessionId(savedId);
      }
    }
  }, [messages, activeSessionId, archiveCurrentSession]);

  // Copiar texto da mensagem
  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback para navegadores sem clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  // Editar mensagem do usuário: abre o campo de edição inline
  const handleEditStart = (index: number) => {
    const msg = messages[index];
    if (!msg || msg.role !== 'user') return;
    setEditingIndex(index);
    setEditText(msg.text);
  };

  // Confirmar edição: trunca o histórico e reenvia
  const handleEditConfirm = async () => {
    if (editingIndex === null || !editText.trim() || isLoading) return;
    const newHistory: Message[] = messages.slice(0, editingIndex).map(m => ({ ...m, failed: undefined }));
    newHistory.push({ role: 'user', text: editText.trim() });
    setMessages(newHistory);
    setEditingIndex(null);
    setEditText('');
    setIsLoading(true);
    setLoadingStatus(t('Consultando Zenith IA...', 'Consulting Zenith IA...'));
    setError(null);
    setActionFeedback(null);

    try {
      const apiKey = getGeminiApiKey();
      const context = buildContext();
      const result: ChatAIResult = await chatWithZenithAI(
        apiKey,
        newHistory,
        context,
        executeTool,
        (status) => setLoadingStatus(status),
        activeModelName
      );
      setActiveModelName(result.modelUsed || activeModelName);
      setMessages([...newHistory, { role: 'model', text: result.text, modelUsed: result.modelUsed }]);
    } catch (err: unknown) {
      const e = err as Error & { name?: string };
      if (onApiKeyError && (e.name === 'MissingApiKeyError' || e.name === 'InvalidApiKeyError')) onApiKeyError(err);
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 && m.role === 'user' ? { ...m, failed: true } : m));
      setError(e.message || 'Ocorreu um erro.');
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  // Compartilhar resposta da IA
  const handleShare = async (text: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Zenith IA', text });
      } else {
        await navigator.clipboard.writeText(text);
        setActionFeedback(t('Texto copiado para compartilhar!', 'Text copied to share!'));
      }
    } catch {
      // Ignora se o usuário cancelou
    }
  };

  // Reproduzir resposta da IA em áudio (TTS do navegador)
  const handleSpeak = (text: string, index: number) => {
    if (!('speechSynthesis' in window)) {
      setActionFeedback(t('Áudio não suportado neste navegador.', 'Audio not supported in this browser.'));
      return;
    }
    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*_#`~\[\]()>-]/g, ' ').replace(/\s+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language === 'en-US' ? 'en-US' : 'pt-BR';
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  // Like / Dislike
  const handleLike = (index: number, type: 'up' | 'down') => {
    setLikedIndices(prev => {
      const copy = { ...prev };
      if (copy[index] === type) {
        delete copy[index];
      } else {
        copy[index] = type;
      }
      return copy;
    });
  };

  // Carregar sessão do histórico
  const loadSession = (session: ChatSession) => {
    setMessages(session.messages);
    setActiveSessionId(session.id);
    setShowHistory(false);
    setError(null);
    setActionFeedback(null);
  };

  // Deletar sessão do histórico
  const deleteSession = (sessionId: string) => {
    setChatSessions((prev: ChatSession[]) => prev.filter((s: ChatSession) => s.id !== sessionId));
  };

  // Formatar data para exibição
  const formatSessionDate = (isoDate: string) => {
    const d = new Date(isoDate);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (mins < 1) return t('Agora', 'Now');
    if (mins < 60) return `${mins}min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString(language === 'en-US' ? 'en-US' : 'pt-BR', { day: '2-digit', month: 'short' });
  };

  const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  const buildContext = () => {
    return `Data Atual do Sistema: ${new Date().toISOString().split('T')[0]}`;
  };

  const getDynamicSuggestions = () => {
    const suggestions: string[] = [
      t("Adicione um café de R$ 8 na padaria", "Add an $8 coffee at bakery"),
      t("Quanto tenho de patrimônio total?", "What is my total net worth?"),
      t("Defina minha meta de reserva para R$ 25.000", "Set my emergency reserve goal to R$ 25,000"),
      t("Me leve para a tela de Carteira", "Take me to the Wallet screen"),
    ];

    if (assets.length > 0) {
      const first = assets[0];
      if (first) {
        suggestions.push(t(`Atualize o saldo do ${first.name}`, `Update balance for ${first.name}`));
      }
    } else {
      suggestions.push(t("Cadastre um CDB de R$ 5.000 no Inter", "Add a R$ 5,000 CDB at Inter"));
    }

    return suggestions;
  };

  const { executeTool } = useAITools({
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
  });

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    setShowQuickActions(false);
    setShowModelSelector(false);
    const userMessage: Message = { role: 'user', text: textToSend.trim() };
    const newHistory: Message[] = [...messages.map(m => ({ ...m, failed: undefined })), userMessage];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    setLoadingStatus(t('Consultando Zenith IA...', 'Consulting Zenith IA...'));
    setError(null);
    setActionFeedback(null);

    try {
      const apiKey = getGeminiApiKey();
      const context = buildContext();
      const result: ChatAIResult = await chatWithZenithAI(
        apiKey,
        newHistory,
        context,
        executeTool,
        (status) => setLoadingStatus(status),
        activeModelName
      );
      setActiveModelName(result.modelUsed || activeModelName);
      setMessages([...newHistory, { role: 'model', text: result.text, modelUsed: result.modelUsed }]);
    } catch (err: unknown) {
      const e = err as Error & { name?: string };
      if (onApiKeyError && (e.name === 'MissingApiKeyError' || e.name === 'InvalidApiKeyError')) {
        onApiKeyError(err);
      }
      setMessages(prev => prev.map((m, i) => 
        i === prev.length - 1 && m.role === 'user' ? { ...m, failed: true } : m
      ));
      setError(e.message || 'Ocorreu um erro.');
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  // Retry: reenvia a mensagem que falhou
  const handleRetry = async (index: number) => {
    const failedMsg = messages[index];
    if (!failedMsg || failedMsg.role !== 'user' || isLoading) return;

    setShowQuickActions(false);
    setShowModelSelector(false);
    // Remove a mensagem falha e tudo depois dela, depois reenvia
    const historyBefore = messages.slice(0, index);
    const retryHistory: Message[] = [...historyBefore.map(m => ({ ...m, failed: undefined })), { role: 'user' as const, text: failedMsg.text }];
    setMessages(retryHistory);
    setIsLoading(true);
    setLoadingStatus(t('Reenviando mensagem...', 'Resending message...'));
    setError(null);
    setActionFeedback(null);

    try {
      const apiKey = getGeminiApiKey();
      const context = buildContext();
      const result: ChatAIResult = await chatWithZenithAI(
        apiKey,
        retryHistory,
        context,
        executeTool,
        (status) => setLoadingStatus(status),
        activeModelName
      );
      setActiveModelName(result.modelUsed || activeModelName);
      setMessages([...retryHistory, { role: 'model', text: result.text, modelUsed: result.modelUsed }]);
    } catch (err: unknown) {
      const e = err as Error & { name?: string };
      if (onApiKeyError && (e.name === 'MissingApiKeyError' || e.name === 'InvalidApiKeyError')) {
        onApiKeyError(err);
      }
      setMessages(prev => prev.map((m, i) => 
        i === prev.length - 1 && m.role === 'user' ? { ...m, failed: true } : m
      ));
      setError(e.message || 'Ocorreu um erro.');
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const clearChat = () => { 
    if (messages.length >= 2) archiveCurrentSession(); 
    setMessages([]); 
    setActiveSessionId(null);
    setError(null); 
    setActionFeedback(null); 
  };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] pb-24">
      {/* Top Header */}
      <div className="flex justify-between items-center px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] relative">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Zenith IA</h2>
            <p className="text-[var(--text-muted)] text-[9px] uppercase tracking-widest">{t("Agente Financeiro Autônomo", "Autonomous Financial Agent")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHistory(true)} 
            className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] bg-[var(--bg-card)] border border-[var(--border-card)] rounded-full transition-colors relative"
            title={t("Histórico", "History")}
          >
            <History size={16} />
            {chatSessions.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--accent)] text-[var(--bg-app)] text-[8px] font-bold rounded-full flex items-center justify-center">
                {chatSessions.length > 9 ? '9+' : chatSessions.length}
              </span>
            )}
          </button>
          {messages.length > 0 && (
            <button onClick={clearChat} className="p-2 text-[var(--text-muted)] hover:text-red-400 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-full transition-colors">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Action Toast Feedback */}
      <AnimatePresence>
        {actionFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-4 mb-2 bg-[var(--accent)]/15 border border-[var(--accent)]/30 rounded-2xl p-2.5 flex items-center gap-2 text-xs text-[var(--accent)] font-medium"
          >
            <CheckCircle2 size={15} className="shrink-0" />
            <span className="flex-1 truncate">{actionFeedback}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Messages */}
      <div 
        className="flex-1 overflow-y-auto space-y-4 px-4 pb-48"
        onClick={() => {
          setShowQuickActions(false);
          setShowModelSelector(false);
        }}
      >
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-3xl p-6 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto">
              <Sparkles size={32} className="text-[var(--accent)]" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] text-base mb-1">
                {t("O que posso fazer por você hoje?", "What can I do for you today?")}
              </h3>
              <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
                {t(
                  "Posso cadastrar despesas, criar investimentos, atualizar saldos, ajustar suas metas ou levá-lo a qualquer tela.",
                  "I can record expenses, create investments, update balances, adjust your goals or navigate anywhere."
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              {getDynamicSuggestions().map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(suggestion)}
                  className="text-xs bg-[var(--bg-app)] border border-[var(--border-card)] p-3 rounded-xl text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all text-left flex items-center justify-between group"
                >
                  <span>"{suggestion}"</span>
                  <span className="opacity-0 group-hover:opacity-100 text-[var(--accent)] text-[10px]">→</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, index) => (
            <ChatMessageBubble
              key={index}
              msg={msg}
              index={index}
              activeModelName={activeModelName}
              isLoading={isLoading}
              copiedIndex={copiedIndex}
              editingIndex={editingIndex}
              editText={editText}
              speakingIndex={speakingIndex}
              likedIndices={likedIndices}
              language={language}
              onCopy={handleCopy}
              onShare={handleShare}
              onSpeak={handleSpeak}
              onLike={handleLike}
              onRetry={handleRetry}
              onEditStart={handleEditStart}
              onEditTextChange={setEditText}
              onEditConfirm={handleEditConfirm}
              onEditCancel={() => { setEditingIndex(null); setEditText(''); }}
              messages={messages}
            />
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[var(--accent)]">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center">
              <Sparkles size={14} />
            </div>
            <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl rounded-bl-sm px-4 py-2 flex items-center shadow-sm">
              <LoadingSpinner label={loadingStatus || t("Executando tarefa...", "Executing task...")} />
            </div>
          </motion.div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-xs text-red-400 flex items-center justify-between gap-3 shadow-sm">
            <span className="flex-1 text-left">{error}</span>
            {messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
              <button
                onClick={() => handleRetry(messages.length - 1)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 hover:text-white transition-colors font-medium shrink-0 active:scale-95 disabled:opacity-50"
                title={t("○ Atualizar mensagem", "○ Retry message")}
              >
                <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
                <span>{t("Atualizar", "Retry")}</span>
              </button>
            )}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Bar Flutuante */}
      <ChatInputBar
        input={input}
        isLoading={isLoading}
        isListening={isListening}
        activeModelName={activeModelName}
        showModelSelector={showModelSelector}
        showQuickActions={showQuickActions}
        availableModels={AVAILABLE_GEMINI_MODELS}
        language={language}
        textareaRef={textareaRef}
        onInputChange={setInput}
        onSend={() => handleSend()}
        onKeyDown={handleKeyDown}
        onToggleVoice={() =>
          toggleListening(
            (transcript) => setInput((prev) => (prev ? prev + ' ' : '') + transcript),
            (msg) => setError(msg)
          )
        }
        onToggleModelSelector={() => {
          setShowModelSelector((prev) => !prev);
          setShowQuickActions(false);
        }}
        onToggleQuickActions={() => {
          setShowQuickActions((prev) => !prev);
          setShowModelSelector(false);
        }}
        onSelectModel={(modelId) => {
          setActiveModelName(modelId);
          setShowModelSelector(false);
        }}
        onSelectQuickAction={(prompt) => {
          setInput(prompt);
          setShowQuickActions(false);
          textareaRef.current?.focus();
        }}
      />

      {/* History Overlay */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-[var(--bg-app)] flex flex-col"
          >
            {/* History Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border-card)]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] border border-[var(--border-card)] rounded-full transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('Histórico', 'History')}</h2>
                  <p className="text-[var(--text-muted)] text-[9px] uppercase tracking-widest">
                    {chatSessions.length} {t('conversas', 'conversations')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  clearChat();
                  setShowHistory(false);
                }}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] bg-[var(--bg-card)] border border-[var(--border-card)] rounded-full transition-colors"
                title={t('Nova conversa', 'New conversation')}
              >
                <Plus size={16} />
              </button>
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-24">
              {chatSessions.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto">
                    <History size={28} className="text-[var(--accent)]" />
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('Nenhuma conversa salva ainda.', 'No saved conversations yet.')}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]/60">
                    {t('Suas conversas serão salvas automaticamente aqui.', 'Your conversations will be saved here automatically.')}
                  </p>
                </div>
              ) : (
                chatSessions.map((session: ChatSession) => {
                  const msgCount = session.messages.length;
                  const lastModelMsg = [...session.messages].reverse().find(m => m.role === 'model');
                  const preview = lastModelMsg?.text?.substring(0, 80) || '';
                  const isActive = activeSessionId === session.id;

                  return (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`relative bg-[var(--bg-card)] border rounded-2xl p-3.5 cursor-pointer transition-all active:scale-[0.98] ${
                        isActive
                          ? 'border-[var(--accent)]/50 shadow-md shadow-[var(--accent)]/5'
                          : 'border-[var(--border-card)] hover:border-[var(--accent)]/30'
                      }`}
                      onClick={() => loadSession(session)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />}
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{session.title}</p>
                          </div>
                          {preview && (
                            <p className="text-xs text-[var(--text-muted)] truncate leading-relaxed">
                              {preview}{preview.length >= 80 ? '…' : ''}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-[var(--text-muted)]/60">
                              {formatSessionDate(session.date)}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]/40">•</span>
                            <span className="text-[10px] text-[var(--text-muted)]/60">
                              {msgCount} {t('msgs', 'msgs')}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          className="p-1.5 text-[var(--text-muted)]/40 hover:text-red-400 rounded-full transition-colors shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
