import { AnimatePresence, motion } from 'motion/react';
import {
  Plus,
  Sparkles,
  Check,
  Mic,
  MicOff,
  Loader2,
  ArrowUp,
  ChevronDown,
} from 'lucide-react';

export interface GeminiModel {
  id: string;
  label: string;
  desc: string;
}

export interface ChatInputBarProps {
  input: string;
  isLoading: boolean;
  isListening: boolean;
  activeModelName: string;
  showModelSelector: boolean;
  showQuickActions: boolean;
  availableModels: GeminiModel[];
  language?: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onToggleVoice: () => void;
  onToggleModelSelector: () => void;
  onToggleQuickActions: () => void;
  onSelectModel: (modelId: string) => void;
  onSelectQuickAction: (prompt: string) => void;
}

export default function ChatInputBar({
  input,
  isLoading,
  isListening,
  activeModelName,
  showModelSelector,
  showQuickActions,
  availableModels,
  language,
  textareaRef,
  onInputChange,
  onSend,
  onKeyDown,
  onToggleVoice,
  onToggleModelSelector,
  onToggleQuickActions,
  onSelectModel,
  onSelectQuickAction,
}: ChatInputBarProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);

  return (
    <div className="fixed bottom-[78px] md:bottom-[82px] left-0 right-0 px-3 md:px-4 pb-2 z-30 pointer-events-none">
      <div className="pointer-events-auto max-w-lg mx-auto relative">
        {/* Seletor de Modelo Gemini Popover */}
        <AnimatePresence>
          {showModelSelector && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-2 shadow-2xl z-40 space-y-1"
            >
              <div className="px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between border-b border-[var(--border-card)]/40 pb-1 mb-1">
                <span>{t('Modelo Ativo do Gemini', 'Active Gemini Model')}</span>
                <Sparkles size={11} className="text-[var(--accent)]" />
              </div>
              {availableModels.map((m) => {
                const isSelected = activeModelName === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectModel(m.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl transition-all flex items-center justify-between text-xs ${
                      isSelected
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-semibold border border-[var(--accent)]/30'
                        : 'text-[var(--text-primary)] hover:bg-[var(--border-card)]/50 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-mono text-[11px] truncate leading-tight">{m.label}</div>
                      <div className="text-[9px] text-[var(--text-muted)] truncate">{m.desc}</div>
                    </div>
                    {isSelected && <Check size={12} className="text-[var(--accent)] shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Menu de Ações Rápidas (+) Popover */}
        <AnimatePresence>
          {showQuickActions && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 mb-2 w-72 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-2 shadow-2xl z-40 space-y-1"
            >
              <div className="px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between border-b border-[var(--border-card)]/40 pb-1 mb-1">
                <span>{t('Atalhos & Anexos (+)', 'Shortcuts & Actions (+)')}</span>
                <Plus size={12} className="text-[var(--accent)]" />
              </div>
              {[
                {
                  label: t('Lançar despesa rápida', 'Quick expense'),
                  prompt: 'Lançar despesa de R$ ',
                },
                {
                  label: t('Atualizar saldo da conta', 'Update balance'),
                  prompt: 'Atualizar saldo da conta  para R$ ',
                },
                {
                  label: t('Cadastrar investimento', 'New investment'),
                  prompt: 'Criar investimento ',
                },
                {
                  label: t('Resumo do meu patrimônio', 'Net worth summary'),
                  prompt: 'Faça um resumo consolidado do meu patrimônio e rendimentos.',
                },
                {
                  label: t('Consultar minhas metas', 'Check goals'),
                  prompt: 'Como estão minhas metas de reserva e independência financeira?',
                },
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectQuickAction(item.prompt)}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl transition-all text-xs text-[var(--text-primary)] hover:bg-[var(--border-card)]/50 flex items-center justify-between group"
                >
                  <span className="truncate">{item.label}</span>
                  <span className="text-[10px] text-[var(--text-muted)] group-hover:text-[var(--accent)] font-mono shrink-0 ml-2">
                    →
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Container Flutuante */}
        <div className="bg-[var(--bg-card)]/95 border border-[var(--border-card)] rounded-[26px] p-2.5 shadow-2xl shadow-black/40 backdrop-blur-md flex flex-col gap-1.5 transition-all focus-within:border-[var(--accent)]/60 focus-within:ring-2 focus-within:ring-[var(--accent)]/20">
          <div className="w-full px-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Mensagem para o Gemini..."
              className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 outline-none resize-none min-h-[38px] max-h-32 p-1 leading-relaxed"
              rows={1}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-card)]/30">
            {/* Esquerda: (+) e Seletor de Modelo */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onToggleQuickActions}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  showQuickActions
                    ? 'bg-[var(--accent)] text-[var(--bg-app)] rotate-45'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-card)]/50 active:scale-95'
                }`}
                title={t('Ações e sugestões rápidas (+)', 'Quick actions (+)')}
              >
                <Plus size={16} />
              </button>

              <button
                type="button"
                onClick={onToggleModelSelector}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border transition-all ${
                  showModelSelector
                    ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]'
                    : 'bg-[var(--bg-app)]/70 border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 active:scale-95'
                }`}
                title={t('Alterar modelo do Google Gemini', 'Switch Google Gemini model')}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="truncate max-w-[130px] sm:max-w-[180px]">{activeModelName}</span>
                <ChevronDown
                  size={11}
                  className={`transition-transform duration-200 ${showModelSelector ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            {/* Direita: Microfone e Enviar */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onToggleVoice}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-red-500/20 text-red-500 border border-red-500/40 animate-pulse'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-card)]/50 active:scale-95'
                }`}
                title={
                  isListening
                    ? t('Parar gravação de voz', 'Stop voice recording')
                    : t('Gravar áudio / voz', 'Voice recording')
                }
              >
                {isListening ? <Mic size={17} /> : <MicOff size={17} />}
              </button>

              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim() || isLoading}
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold transition-all shadow-md active:scale-95 ${
                  !input.trim() || isLoading
                    ? 'bg-[var(--border-card)] text-[var(--text-muted)]/40 cursor-not-allowed opacity-60'
                    : 'bg-[var(--accent)] text-[var(--bg-app)] shadow-[var(--accent)]/20 hover:brightness-110'
                }`}
                title={t('Enviar mensagem', 'Send message')}
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowUp size={17} strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
