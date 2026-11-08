import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  User,
  Sparkles,
  Copy,
  Check,
  Share2,
  Play,
  Square,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Pencil,
} from 'lucide-react';

export interface Message {
  role: 'user' | 'model';
  text: string;
  failed?: boolean;
  modelUsed?: string;
}

export interface ChatMessageBubbleProps {
  msg: Message;
  index: number;
  activeModelName: string;
  isLoading: boolean;
  copiedIndex: number | null;
  editingIndex: number | null;
  editText: string;
  speakingIndex: number | null;
  likedIndices: Record<number, 'up' | 'down'>;
  language?: string;
  onCopy: (text: string, index: number) => Promise<void>;
  onShare: (text: string) => Promise<void>;
  onSpeak: (text: string, index: number) => void;
  onLike: (index: number, type: 'up' | 'down') => void;
  onRetry: (index: number) => void;
  onEditStart: (index: number) => void;
  onEditTextChange: (text: string) => void;
  onEditConfirm: () => void;
  onEditCancel: () => void;
  messages: Message[];
}

export default function ChatMessageBubble({
  msg,
  index,
  activeModelName,
  isLoading,
  copiedIndex,
  editingIndex,
  editText,
  speakingIndex,
  likedIndices,
  language,
  onCopy,
  onShare,
  onSpeak,
  onLike,
  onRetry,
  onEditStart,
  onEditTextChange,
  onEditConfirm,
  onEditCancel,
  messages,
}: ChatMessageBubbleProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);

  return (
    <motion.div
      key={index}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
    >
      {/* Model badge acima da resposta da IA */}
      {msg.role === 'model' && (
        <div className="flex items-center gap-1.5 mb-1.5 ml-10">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
            Google Gemini API ({msg.modelUsed || activeModelName})
          </span>
        </div>
      )}

      {/* Balão da mensagem */}
      <div className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            msg.role === 'user'
              ? msg.failed
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-[var(--text-primary)] text-[var(--bg-app)]'
              : 'bg-[var(--accent)]/20 text-[var(--accent)]'
          }`}
        >
          {msg.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
        </div>

        <div
          className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
            msg.role === 'user'
              ? msg.failed
                ? 'bg-red-500/10 border border-red-500/30 text-[var(--text-primary)] font-medium rounded-br-sm'
                : 'bg-[var(--accent)] text-[var(--bg-app)] font-medium rounded-br-sm'
              : 'bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--text-primary)] rounded-bl-sm shadow-sm'
          }`}
        >
          {msg.role === 'user' && editingIndex === index ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => onEditTextChange(e.target.value)}
                className="w-full bg-transparent text-sm outline-none resize-none min-h-[40px] text-[var(--bg-app)] placeholder:text-[var(--bg-app)]/50"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onEditConfirm();
                  }
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={onEditCancel}
                  className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/10 text-white/70 hover:text-white transition-colors"
                >
                  {t('Cancelar', 'Cancel')}
                </button>
                <button
                  onClick={onEditConfirm}
                  disabled={!editText.trim() || isLoading}
                  className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors disabled:opacity-50"
                >
                  {t('Enviar', 'Send')}
                </button>
              </div>
            </div>
          ) : msg.role === 'user' ? (
            msg.text
          ) : (
            <ReactMarkdown
              components={{
                p: ({ node: _node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                strong: ({ node: _node, ...props }) => (
                  <strong className="font-bold text-[var(--accent)]" {...props} />
                ),
                ul: ({ node: _node, ...props }) => (
                  <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />
                ),
                li: ({ node: _node, ...props }) => <li className="pl-1" {...props} />,
              }}
            >
              {msg.text}
            </ReactMarkdown>
          )}

          {msg.role === 'user' && msg.failed && (
            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-red-500/20 text-xs">
              <span className="text-red-400 text-[11px] font-normal flex items-center gap-1">
                {t('Falha no envio', 'Failed to send')}
              </span>
              <button
                onClick={() => onRetry(index)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 hover:text-white transition-colors text-[11px] font-medium active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
                <span>{t('Atualizar', 'Retry')}</span>
              </button>
            </div>
          )}
        </div>

        {msg.role === 'user' && msg.failed && (
          <button
            onClick={() => onRetry(index)}
            disabled={isLoading}
            className="w-8 h-8 rounded-full bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-400 hover:text-red-300 flex items-center justify-center transition-all shrink-0 self-center shadow-sm active:scale-95 disabled:opacity-50"
            title={t('Reenviar mensagem', 'Retry message')}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Ações da Mensagem do Usuário */}
      {msg.role === 'user' && !msg.failed && editingIndex !== index && (
        <div className="flex items-center gap-1.5 mt-1.5 mr-10 justify-end">
          <button
            onClick={() => onCopy(msg.text, index)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              copiedIndex === index
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10'
            }`}
            title={t('Copiar mensagem', 'Copy message')}
          >
            {copiedIndex === index ? (
              <Check size={12} className="text-emerald-400" />
            ) : (
              <Copy size={12} />
            )}
            <span>{copiedIndex === index ? t('Copiado', 'Copied') : t('Copiar', 'Copy')}</span>
          </button>

          <button
            onClick={() => onEditStart(index)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all"
            title={t('Editar mensagem', 'Edit message')}
          >
            <Pencil size={12} />
            <span>{t('Editar', 'Edit')}</span>
          </button>
        </div>
      )}

      {/* Ações da Resposta da IA */}
      {msg.role === 'model' && (
        <div className="flex items-center gap-1 mt-2 ml-10 flex-wrap">
          <button
            onClick={() => onCopy(msg.text, index)}
            className={`p-1.5 rounded-lg text-[11px] transition-all flex items-center justify-center ${
              copiedIndex === index
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10'
            }`}
            title={copiedIndex === index ? t('Copiado!', 'Copied!') : t('Copiar resposta', 'Copy response')}
          >
            {copiedIndex === index ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>

          <button
            onClick={() => onShare(msg.text)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all flex items-center justify-center"
            title={t('Compartilhar', 'Share')}
          >
            <Share2 size={13} />
          </button>

          <button
            onClick={() => onSpeak(msg.text, index)}
            className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
              speakingIndex === index
                ? 'text-[var(--accent)] bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/40 animate-pulse'
                : 'text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10'
            }`}
            title={speakingIndex === index ? t('Parar áudio', 'Stop audio') : t('Reproduzir áudio', 'Play audio')}
          >
            {speakingIndex === index ? (
              <Square size={12} className="fill-current" />
            ) : (
              <Play size={13} />
            )}
          </button>

          <button
            onClick={() => onLike(index, 'up')}
            className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
              likedIndices[index] === 'up'
                ? 'text-[var(--accent)] bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/40'
                : 'text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10'
            }`}
            title={t('Gostei', 'Like')}
          >
            <ThumbsUp size={13} />
          </button>

          <button
            onClick={() => onLike(index, 'down')}
            className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
              likedIndices[index] === 'down'
                ? 'text-red-400 bg-red-400/15 ring-1 ring-red-400/40'
                : 'text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10'
            }`}
            title={t('Não gostei', 'Dislike')}
          >
            <ThumbsDown size={13} />
          </button>

          <button
            onClick={() =>
              onRetry(
                index - 1 >= 0 && messages[index - 1]?.role === 'user' ? index - 1 : index
              )
            }
            disabled={isLoading}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all disabled:opacity-50 flex items-center justify-center"
            title={t('Tentar novamente', 'Retry')}
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-[var(--accent)]' : ''} />
          </button>
        </div>
      )}
    </motion.div>
  );
}
