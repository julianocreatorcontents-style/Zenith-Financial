import React, { useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, AlertCircle } from 'lucide-react';

interface AuthViewProps {
  onGoogleLogin: () => Promise<void>;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  error?: string | null;
  onClearError?: () => void;
  language?: string;
}

export const AuthView: React.FC<AuthViewProps> = ({
  onGoogleLogin,
  onEmailLogin,
  onRegister,
  error,
  onClearError,
  language = 'pt-BR'
}) => {
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);

  const handleSwitchView = (view: 'login' | 'register') => {
    setAuthView(view);
    setLocalError(null);
    onClearError?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setIsSubmitting(true);
    try {
      if (authView === 'login') {
        await onEmailLogin(authForm.email, authForm.password);
      } else {
        if (!authForm.name.trim()) {
          setLocalError(t('Nome é obrigatório', 'Name is required'));
          setIsSubmitting(false);
          return;
        }
        await onRegister(authForm.name.trim(), authForm.email, authForm.password);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Erro de autenticação');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
      {/* Abstract Background Orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[var(--accent)]/10 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-[var(--accent)]/5 blur-[120px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md space-y-8 z-10"
      >
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-[var(--text-primary)] rounded-[32px] flex items-center justify-center mx-auto shadow-2xl">
            <TrendingUp size={40} className="text-[var(--bg-app)]" />
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-[var(--text-primary)] tracking-tight">Zenith</h1>
            <p className="text-[var(--accent)] text-xs uppercase tracking-[0.2em] font-black">
              {t("The Future of Wealth", "O Futuro do Patrimônio")}
            </p>
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-8 shadow-xl space-y-6">
          <div className="flex bg-[var(--bg-app)] p-1 rounded-2xl border border-[var(--border-card)]">
            {(['login', 'register'] as const).map((view) => (
              <button
                key={view}
                onClick={() => handleSwitchView(view)}
                className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${
                  authView === view 
                    ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-sm' 
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {view === 'login' ? t("Entrar", "Login") : t("Criar Conta", "Register")}
              </button>
            ))}
          </div>

          {displayError && (
            <div className="p-3 bg-[var(--trend-down)]/10 border border-[var(--trend-down)]/20 rounded-xl flex items-center gap-2 text-[var(--trend-down)] text-xs">
              <AlertCircle size={16} className="shrink-0" />
              <span className="truncate">{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {authView === 'register' && (
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest ml-1">
                  {t("Nome", "Name")}
                </label>
                <input 
                  type="text"
                  required
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder={t("Seu nome completo", "Your full name")}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest ml-1">
                {t("E-mail", "Email")}
              </label>
              <input 
                type="email"
                required
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest ml-1">
                {t("Senha", "Password")}
              </label>
              <input 
                type="password"
                required
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-[var(--text-primary)] text-[var(--bg-app)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[var(--accent)] transition-all transform active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting
                ? t("Processando...", "Processing...")
                : (authView === 'login' ? t("Acessar Painel", "Access Dashboard") : t("Finalizar Cadastro", "Complete Sign Up"))}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border-card)] opacity-50" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
              <span className="bg-[var(--bg-card)] px-4 text-[var(--text-muted)]">
                {t("Ou continue com", "Or continue with")}
              </span>
            </div>
          </div>

          <button 
            type="button"
            onClick={onGoogleLogin}
            className="w-full py-4 bg-white text-black rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 border border-[var(--border-card)] hover:bg-gray-50 transition-all active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
            Google
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthView;
