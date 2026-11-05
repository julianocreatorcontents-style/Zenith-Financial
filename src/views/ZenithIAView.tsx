import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Loader2, User, Trash2, Mic, MicOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { chatWithZenithAI } from '../lib/ai';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export default function ZenithIAView({ language, transactions, assets, getGeminiApiKey, onNavigateTab }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const webRecognitionRef = useRef<any>(null);

  // Configuração do Microfone
  useEffect(() => {
    // Configura a Web Speech API para navegador (fallback)
    const SpeechRecognitionWeb = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionWeb && !Capacitor.isNativePlatform()) {
      webRecognitionRef.current = new SpeechRecognitionWeb();
      webRecognitionRef.current.continuous = false;
      webRecognitionRef.current.interimResults = false;
      webRecognitionRef.current.lang = language === 'en-US' ? 'en-US' : 'pt-BR';

      webRecognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + ' ' + transcript);
        setIsListening(false);
      };
      webRecognitionRef.current.onerror = () => setIsListening(false);
      webRecognitionRef.current.onend = () => setIsListening(false);
    }
  }, [language]);

  const toggleListening = async () => {
    if (isListening) {
      if (Capacitor.isNativePlatform()) {
        await SpeechRecognition.stop();
      } else {
        webRecognitionRef.current?.stop();
      }
      setIsListening(false);
      return;
    }

    setError(null);

    if (Capacitor.isNativePlatform()) {
      try {
        // 1. Verifica e solicita permissão de microfone no APK
        const perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted') {
          const req = await SpeechRecognition.requestPermissions();
          if (req.speechRecognition !== 'granted') {
            setError(t("Permissão de microfone negada.", "Microphone permission denied."));
            return;
          }
        }

        // 2. Inicia o reconhecimento nativo
        setIsListening(true);
        const result = await SpeechRecognition.start({
          language: language === 'en-US' ? 'en-US' : 'pt-BR',
          maxResults: 1,
          prompt: t("Fale agora...", "Speak now..."),
          partialResults: false,
        });

        if (result.matches && result.matches.length > 0) {
          setInput((prev) => prev + ' ' + result.matches[0]);
        }
      } catch (err: any) {
        console.error('Erro no microfone nativo:', err);
        setError(t("Não foi possível capturar o áudio.", "Could not capture audio."));
      } finally {
        setIsListening(false);
      }
    } else {
      // Navegador
      if (!webRecognitionRef.current) {
        setError(t("Microfone não suportado neste navegador.", "Microphone not supported in this browser."));
        return;
      }
      webRecognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Formata os dados para o contexto da IA
  const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  const buildContext = () => {
    const totalAssets = assets.reduce((acc: number, asset: any) => acc + (asset.manualBalance ?? asset.value ?? 0), 0);
    
    const topAssets = [...assets]
      .sort((a, b) => (b.manualBalance ?? b.value ?? 0) - (a.manualBalance ?? a.value ?? 0))
      .slice(0, 5)
      .map((a: any) => `${a.name}: ${formatBRL(a.manualBalance ?? a.value ?? 0)}`)
      .join(', ');

    const recentTxs = [...transactions]
      .sort((a, b) => {
        const dA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dB.getTime() - dA.getTime();
      })
      .slice(0, 10)
      .map((tx: any) => `${tx.label} (${tx.type === 'in' ? 'Entrada' : 'Saída'}): ${formatBRL(tx.value)}`)
      .join(' | ');

    return `
- Patrimônio Total: ${formatBRL(totalAssets)}
- Principais Ativos: ${topAssets || 'Nenhum ativo cadastrado'}
- Últimas Transações: ${recentTxs || 'Nenhuma transação recente'}
- Meta: Liberdade Financeira (R$ 100.000,00)
`;
  };

  const getDynamicSuggestions = () => {
    const expenses = transactions.filter((tx: any) => tx.type === 'out');
    const biggestExpense = expenses.sort((a: any, b: any) => b.value - a.value)[0];
    
    const suggestions = [
      t("Como está minha meta?", "How is my goal doing?"),
      t("Me dê dicas para economizar", "Give me saving tips")
    ];

    if (biggestExpense) {
      suggestions.push(t(`Por que gastei ${formatBRL(biggestExpense.value)} em ${biggestExpense.label}?`, `Why did I spend ${formatBRL(biggestExpense.value)} on ${biggestExpense.label}?`));
    } else {
      suggestions.push(t("Como estão meus rendimentos?", "How are my yields doing?"));
    }

    return suggestions;
  };

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', text: textToSend.trim() };
    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const apiKey = getGeminiApiKey();
      const context = buildContext();
      const aiResponse = await chatWithZenithAI(apiKey, newHistory, context);
      
      setMessages([...newHistory, { role: 'model', text: aiResponse }]);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao processar sua pergunta.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] pb-24">
      {/* Header da IA */}
      <div className="flex justify-between items-center px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] relative">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Zenith IA</h2>
            <p className="text-[var(--text-muted)] text-[9px] uppercase tracking-widest">
              {t("Consultor Pessoal", "Personal Advisor")}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="p-2 text-[var(--text-muted)] hover:text-red-400 transition-colors bg-[var(--bg-card)] border border-[var(--border-card)] rounded-full">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Área de Mensagens */}
      <div className="flex-1 overflow-y-auto space-y-4 px-4 pb-4">
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-3xl p-6 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto">
              <Sparkles size={32} className="text-[var(--accent)]" />
            </div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {t("Olá! Sou o Zenith IA. Estou conectado aos seus dados em tempo real. Como posso te ajudar hoje?", "Hi! I'm Zenith AI. I'm connected to your real-time data. How can I help you today?")}
            </p>
            <div className="flex flex-col gap-2">
              {getDynamicSuggestions().map((suggestion, i) => (
                <button 
                  key={i}
                  onClick={() => handleSend(suggestion)}
                  className="text-xs bg-[var(--bg-app)] border border-[var(--border-card)] p-3 rounded-xl text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all text-left"
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-[var(--text-primary)] text-[var(--bg-app)]' : 'bg-[var(--accent)]/20 text-[var(--accent)]'}`}>
                {msg.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
              </div>
              <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-[var(--accent)] text-[var(--bg-app)] rounded-br-sm' : 'bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--text-primary)] rounded-bl-sm shadow-sm'}`}>
                {msg.role === 'user' ? (
                  msg.text
                ) : (
                  <ReactMarkdown 
                    components={{
                      p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-[var(--accent)]" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                      li: ({node, ...props}) => <li className="pl-1" {...props} />
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[var(--accent)]">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center">
              <Sparkles size={14} />
            </div>
            <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl rounded-bl-sm p-3 flex items-center gap-2 shadow-sm">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">{t("Analisando seus dados...", "Analyzing your data...")}</span>
            </div>
          </motion.div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-xs text-red-400 text-center">
            {error}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input de Mensagem */}
      <div className="fixed bottom-[85px] left-0 right-0 px-4 pb-2 bg-gradient-to-t from-[var(--bg-app)] to-transparent pt-4">
        <div className="max-w-md mx-auto flex items-end gap-2 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[24px] p-2 shadow-lg">
          <button
            onClick={toggleListening}
            className={`p-3 rounded-full transition-colors shrink-0 ${isListening ? 'bg-red-500/20 text-red-500 animate-pulse' : 'text-[var(--text-muted)] hover:text-[var(--accent)]'}`}
          >
            {isListening ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("Pergunte algo...", "Ask something...")}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none resize-none max-h-24 p-2"
            rows={1}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="p-3 bg-[var(--accent)] text-[var(--bg-app)] rounded-full disabled:opacity-50 transition-opacity shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
