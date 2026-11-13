import React, { useState, Suspense, lazy } from 'react';
import {
  ArrowLeft,
  User as UserIcon,
  Palette,
  ShieldCheck,
  LayoutDashboard,
  Sparkles,
  KeyRound,
  Lock,
  Fingerprint,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, doc, updateDoc, handleFirestoreError, OperationType } from '../firebase';
import type { UpdateData } from 'firebase/firestore';
import { TabSwitcher, type TabOption } from '../components/ui/TabSwitcher';
import { ProfileSection, AiKeySection } from '../components/drawers/ProfileDrawer';
import { GlobalSettingsSection } from '../components/settings/GlobalSettingsSection';
import { CardSettingsPanel, type VisualSettings } from '../components/CardSettingsPanel';
import { HomeLayoutSelector } from '../components/settings/HomeLayoutSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import { mapIdiomaToLanguage } from '../hooks/useUserSettings';
import { applyTheme } from '../lib/theme';
import type { MasterStates, Settings, ZenithConfig, UserProfile } from '../types/app';

const HeritageSettings = lazy(() =>
  import('../components/HeritageSettings').then((module) => ({ default: module.HeritageSettings }))
);

export type SettingsTab = 'perfil' | 'aparencia' | 'seguranca' | 'dashboard' | 'ia';

export interface SettingsViewProps {
  user: any;
  profile?: UserProfile | null;
  settings?: Settings | null;
  currentConfig?: ZenithConfig;
  language?: string;
  visualSettings?: VisualSettings;
  onChangeVisualSettings?: (settings: VisualSettings) => void;
  onSaveProfile?: (profile: any) => Promise<void>;
  onDeleteAccount?: () => Promise<{ success: boolean; error?: string; status?: string }>;
  apiKey?: string;
  apiKeyError?: string | null;
  onSaveApiKey?: (key: string) => void;
  onClearApiKeyError?: () => void;
  chartFilter?: { period: string; month: string; day: string };
  onChartFilterChange?: (filter: { period: string; month: string; day: string }) => void;
  initialTab?: SettingsTab;
  onClose: () => void;
}

export function SettingsView({
  user,
  profile,
  settings,
  currentConfig,
  language = 'pt-BR',
  visualSettings,
  onChangeVisualSettings,
  onSaveProfile,
  onDeleteAccount,
  apiKey,
  apiKeyError,
  onSaveApiKey,
  onClearApiKeyError,
  chartFilter,
  onChartFilterChange,
  initialTab = 'perfil',
  onClose,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [resetEmailSending, setResetEmailSending] = useState(false);
  const [resetEmailMessage, setResetEmailMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com';
  const hasBiometrySupport = typeof window !== 'undefined' && !!window.PublicKeyCredential;
  const isBiometryEnabled =
    typeof window !== 'undefined' && user?.uid
      ? localStorage.getItem(`biometry_${user.uid}`) === 'active'
      : false;
  const [biometryActive, setBiometryActive] = useState(isBiometryEnabled);

  const toggleBiometry = () => {
    if (!user?.uid) return;
    const nextState = !biometryActive;
    setBiometryActive(nextState);
    try {
      localStorage.setItem(`biometry_${user.uid}`, nextState ? 'active' : 'disabled');
    } catch (e) {
      console.warn('localStorage error:', e);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setResetEmailSending(true);
    setResetEmailMessage(null);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetEmailMessage({
        type: 'success',
        text: t(
          `Link de redefinição enviado para ${user.email}. Verifique sua caixa de entrada.`,
          `Password reset link sent to ${user.email}. Check your inbox.`
        ),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResetEmailMessage({
        type: 'error',
        text: t(`Erro ao enviar email: ${msg}`, `Failed to send email: ${msg}`),
      });
    } finally {
      setResetEmailSending(false);
    }
  };

  const masterStates: MasterStates = settings?.zenith_config?.master_states || {
    modo_privacidade: settings?.privacyMode ?? false,
    insights_ia_ativo: true,
    idioma: language === 'en-US' ? 'English (US)' : language === 'es-ES' ? 'Español' : 'Português (Brasil)',
    tema_global: 'Escuro',
    dashboard_management_expanded: true,
  };

  const handleUpdateMaster = async (field: keyof MasterStates, value: MasterStates[keyof MasterStates]) => {
    if (!user?.uid) return;
    if (field === 'tema_global' && typeof value === 'string') {
      applyTheme(value);
      if (onChangeVisualSettings && visualSettings?.isCustomEnabled) {
        onChangeVisualSettings({ ...visualSettings, isCustomEnabled: false });
      }
    }
    const updates: Record<string, unknown> = {
      [`zenith_config.master_states.${field}`]: value,
    };
    if (field === 'modo_privacidade') {
      updates['privacyMode'] = Boolean(value);
    }
    if (field === 'idioma' && typeof value === 'string') {
      updates['language'] = mapIdiomaToLanguage(value);
    }
    await updateDoc(doc(db, 'settings', user.uid), updates as UpdateData<Record<string, unknown>>).catch((e) =>
      handleFirestoreError(e, OperationType.UPDATE, `settings/${user.uid}`)
    );
  };

  const tabOptions: TabOption<SettingsTab>[] = [
    { id: 'perfil', label: t('Perfil', 'Profile') },
    { id: 'aparencia', label: t('Aparência', 'Appearance') },
    { id: 'seguranca', label: t('Segurança', 'Security') },
    { id: 'dashboard', label: t('Dashboard', 'Dashboard') },
    { id: 'ia', label: t('IA', 'AI') },
  ];

  return (
    <div className="fixed inset-0 z-[150] bg-[var(--bg-app)] flex flex-col text-[var(--text-primary)] animate-in fade-in duration-200">
      {/* Header Fixo */}
      <header className="shrink-0 px-4 pt-5 pb-3 bg-[var(--bg-card)]/80 backdrop-blur-md border-b border-[var(--border-card)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              type="button"
              className="p-2 -ml-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)] transition-colors active:scale-95"
              aria-label={t('Voltar', 'Back')}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-black uppercase tracking-tight text-[var(--text-primary)]">
                {t('Central de Configurações', 'Settings Center')}
              </h1>
              <p className="text-[10px] text-[var(--text-muted)] font-medium">
                {profile?.displayName || user?.displayName || user?.email || t('Preferências do Sistema', 'System Preferences')}
              </p>
            </div>
          </div>
        </div>

        {/* TabSwitcher de 5 Abas */}
        <div className="max-w-2xl mx-auto overflow-x-auto pb-1 scrollbar-none">
          <TabSwitcher<SettingsTab>
            options={tabOptions}
            value={activeTab}
            onChange={setActiveTab}
            size="sm"
            className="min-w-[340px]"
          />
        </div>
      </header>

      {/* Conteúdo com Scroll */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6 pb-12">
          {/* ABA 1: PERFIL */}
          {activeTab === 'perfil' && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-[var(--border-card)]">
                <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                  <UserIcon size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    {t('Meu Perfil & Conta', 'My Profile & Account')}
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {t('Atualize seus dados pessoais e preferências de investidor.', 'Update your personal info and investor preferences.')}
                  </p>
                </div>
              </div>

              <ProfileSection
                profile={profile ?? {}}
                language={language}
                onSave={onSaveProfile ?? (() => Promise.resolve())}
                onDone={onClose}
                onDeleteAccount={onDeleteAccount}
              />
            </div>
          )}

          {/* ABA 2: APARÊNCIA */}
          {activeTab === 'aparencia' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                  <Palette size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    {t('Aparência & Idioma', 'Appearance & Language')}
                  </h2>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {t('Temas globais do sistema, customizações dos cards e idioma da interface.', 'Global themes, card customization and app language.')}
                  </p>
                </div>
              </div>

              {/* Temas Globais e Idioma */}
              <GlobalSettingsSection
                masterStates={masterStates}
                onUpdateMaster={handleUpdateMaster}
                showThemes={true}
                showLanguage={true}
                showPrivacy={false}
                showAiInsights={false}
              />

              {/* Customização Visual dos Cards */}
              {visualSettings && onChangeVisualSettings && (
                <CardSettingsPanel
                  settings={visualSettings}
                  onChange={onChangeVisualSettings}
                />
              )}
            </div>
          )}

          {/* ABA 3: SEGURANÇA */}
          {activeTab === 'seguranca' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    {t('Segurança & Privacidade', 'Security & Privacy')}
                  </h2>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {t('Controle a visibilidade de saldos, autenticação biométrica e credenciais.', 'Control balance visibility, biometrics, and credentials.')}
                  </p>
                </div>
              </div>

              {/* Modo Privacidade */}
              <div className="bg-[var(--bg-card)] rounded-[24px] p-5 border border-[var(--border-card)] shadow-lg space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={20} className="text-[var(--accent)]" />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest">
                        {t('Modo Privacidade', 'Privacy Mode')}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {t('Oculta valores e saldos nas telas do app para uso em locais públicos.', 'Hides balances and values across the app for public use.')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateMaster('modo_privacidade', !masterStates.modo_privacidade)}
                    className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${
                      masterStates.modo_privacidade ? 'bg-[var(--accent)]' : 'bg-[var(--bg-app)] border border-[var(--border-card)]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        masterStates.modo_privacidade ? 'left-6.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Biometria */}
              <div className="bg-[var(--bg-card)] rounded-[24px] p-5 border border-[var(--border-card)] shadow-lg space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Fingerprint size={20} className="text-[var(--accent)]" />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest">
                        {t('Autenticação Biométrica', 'Biometric Authentication')}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {hasBiometrySupport
                          ? t('Acesse rapidamente usando a biometria cadastrada no dispositivo.', 'Quickly sign in using biometrics registered on this device.')
                          : t('Biometria não suportada neste navegador/dispositivo.', 'Biometrics not supported on this browser/device.')}
                      </p>
                    </div>
                  </div>
                  {hasBiometrySupport && (
                    <button
                      type="button"
                      onClick={toggleBiometry}
                      className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${
                        biometryActive ? 'bg-[var(--accent)]' : 'bg-[var(--bg-app)] border border-[var(--border-card)]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                          biometryActive ? 'left-6.5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Redefinição de Senha */}
              <div className="bg-[var(--bg-card)] rounded-[24px] p-5 border border-[var(--border-card)] shadow-lg space-y-3">
                <div className="flex items-start gap-3">
                  <Lock size={20} className="text-[var(--accent)] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest">
                      {t('Segurança de Acesso', 'Access Security')}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {isGoogleUser
                        ? t(
                            'Sua conta é autenticada via Google. A senha e proteção de dois fatores são gerenciadas diretamente na sua conta Google.',
                            'Your account is authenticated via Google. Password and 2FA are managed in your Google account.'
                          )
                        : t(
                            'Deseja alterar sua senha? Dispare um link oficial de redefinição para o seu email cadastrado.',
                            'Want to change your password? Request an official reset link sent to your registered email.'
                          )}
                    </p>
                  </div>
                </div>

                {!isGoogleUser && user?.email && (
                  <div className="pt-2">
                    {resetEmailMessage && (
                      <div
                        className={`p-3 rounded-xl text-xs flex items-center gap-2 mb-3 ${
                          resetEmailMessage.type === 'success'
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30'
                            : 'bg-[var(--destructive)]/10 text-[var(--destructive)] border border-[var(--destructive)]/30'
                        }`}
                      >
                        {resetEmailMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        <span>{resetEmailMessage.text}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={resetEmailSending}
                      onClick={handlePasswordReset}
                      className="w-full py-3 px-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-app)] hover:border-[var(--accent)] text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {resetEmailSending ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                          <span>{t('Enviando...', 'Sending...')}</span>
                        </>
                      ) : (
                        <>
                          <Mail size={14} className="text-[var(--accent)]" />
                          <span>{t('Enviar Link de Redefinição de Senha', 'Send Password Reset Link')}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABA 4: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                  <LayoutDashboard size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    {t('Gestão do Dashboard', 'Dashboard Management')}
                  </h2>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {t('Ordene, oculte ou configure a visibilidade de cards e gráficos da página inicial.', 'Reorder, hide, and configure cards and charts visibility on the home page.')}
                  </p>
                </div>
              </div>

              {/* Seletor de Layout dos Cards */}
              <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-3xl">
                <HomeLayoutSelector language={language} />
              </div>

              <Suspense fallback={<LoadingSpinner />}>
                <HeritageSettings
                  onClose={onClose}
                  userId={user?.uid || ''}
                  currentConfig={currentConfig}
                  language={language}
                  chartFilter={chartFilter}
                  onChartFilterChange={onChartFilterChange}
                  hideGlobalSettings={true}
                />
              </Suspense>
            </div>
          )}

          {/* ABA 5: IA */}
          {activeTab === 'ia' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    {t('Inteligência Artificial (Zenith IA)', 'Artificial Intelligence (Zenith AI)')}
                  </h2>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {t('Configure sua chave de API e ative os insights proativos de IA.', 'Set up your API key and activate proactive AI insights.')}
                  </p>
                </div>
              </div>

              {/* Chave da API Gemini */}
              <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 shadow-xl">
                <AiKeySection
                  apiKey={apiKey}
                  error={apiKeyError}
                  language={language}
                  onClearError={onClearApiKeyError}
                  onSave={onSaveApiKey}
                />
              </div>

              {/* Master Switch de Insights IA */}
              <div className="bg-[var(--bg-card)] rounded-[24px] p-5 border border-[var(--border-card)] shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Sparkles size={20} className="text-[var(--accent)]" />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest">
                        {t('Insights IA Global', 'Global AI Insights')}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {t('Permite ao assistente sugerir otimizações financeiras nos cards.', 'Allows the assistant to propose financial optimizations on cards.')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateMaster('insights_ia_ativo', !masterStates.insights_ia_ativo)}
                    className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${
                      masterStates.insights_ia_ativo ? 'bg-[var(--accent)]' : 'bg-[var(--bg-app)] border border-[var(--border-card)]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        masterStates.insights_ia_ativo ? 'left-6.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default SettingsView;
