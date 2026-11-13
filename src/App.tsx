/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, CreditCard, TrendingUp,
  LayoutGrid, Plus, AlertCircle, Sparkles, ShieldCheck, Bell, Send
} from 'lucide-react';
import { 
  MissingApiKeyError,
  InvalidApiKeyError,
  getAiErrorMessage
} from './lib/ai';
import LoadingSpinner from './components/LoadingSpinner';
import Modal from './components/ui/Modal';
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProfileDrawer } from "./components/drawers/ProfileDrawer";
import type { VisualSettings } from "./components/CardSettingsPanel";
import { IngestionHub, ReviewModal } from "./components/modals/IngestionModals";
import { NavItem } from "./components/layout/NavItem";
import { ZenithFab } from "./components/ai/ZenithFab";
import { QuickAIChat } from "./components/ai/QuickAIChat";
import type { Asset, Transaction } from "./types/app";
import { useZenithData, DEFAULT_SETTINGS } from "./hooks/useZenithData";
import { usePersistentState } from "./hooks/usePersistentState";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { applyTheme } from "./lib/theme";

const StorageTrashView = lazy(() => import('./views/StorageTrashView'));
const ZenithIAView = lazy(() => import('./views/ZenithIAView'));
const HomeView = lazy(() => import('./views/HomeView').then(m => ({ default: m.HomeView })));
const DetalhesGastosPage = lazy(() =>
  import('./views/WalletTransactionsView').then(m => ({ default: m.WalletTransactionsView }))
);
const InvestmentsView = lazy(() =>
  import('./views/InvestmentsView').then(m => ({ default: m.InvestmentsView }))
);
const SettingsView = lazy(() => import('./views/SettingsView'));
import type { SettingsTab } from './views/SettingsView';
const AuthView = lazy(() =>
  import('./views/AuthView').then(m => ({ default: m.AuthView }))
);
const AddTransactionModal = lazy(() =>
  import('./components/modals/AddTransactionModal').then(m => ({ default: m.AddTransactionModal }))
);
const AssetModal = lazy(() =>
  import('./components/modals/AssetModals').then(m => ({ default: m.AssetModal }))
);
const AssetDeepDiveModal = lazy(() =>
  import('./components/modals/AssetModals').then(m => ({ default: m.AssetDeepDiveModal }))
);
const AddAssetModal = lazy(() =>
  import('./components/modals/AssetModals').then(m => ({ default: m.AddAssetModal }))
);
const CategoryDetailModal = lazy(() =>
  import('./components/modals/CategoryDetailModal').then(m => ({ default: m.CategoryDetailModal }))
);

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

export default function ZenithApp() {
  const data = useZenithData();
  const {
    user, profile, assets, transactions, ddas, settings, privacyMode,
    isAuthReady, userRules, notifications, investorProfile,
    isBiometryModalOpen, setIsBiometryModalOpen, marketRate,
    error, setError, logoutError, firestoreIssues, setFirestoreIssues,
    geminiApiKey, apiKeyError, setApiKeyError,
    pendingTransaction, setPendingTransaction, isProcessingIA,
    metrics, chartData, projectionData, cashFlowData,
    portfolioAllocationPercent, goals, updateGoals, t, getGeminiApiKey,
    togglePrivacyMode, handleSaveProfile, handleSaveApiKey,
    handleGoogleLogin, handleEmailLogin, handleRegister, handleLogout, handleDeleteAccount,
    handleAcceptDDA, handleRejectDDA, moveToTrash, restoreFromTrash,
    createAsset, updateAsset, deleteAsset,
    addTransaction, addTransfer, updateTransaction, confirmPendingTransaction,
    handleFileUpload
  } = data;

  // Estados locais de navegação e modais da UI delegados para useAppNavigation
  const {
    currentTab,
    setCurrentTab,
    isAddMenuOpen,
    setIsAddMenuOpen,
    forceCreateInvestment,
    setForceCreateInvestment,
    selectedAsset,
    setSelectedAsset,
    selectedAssetForDeepDive,
    setSelectedAssetForDeepDive,
    isAddingAsset,
    setIsAddingAsset,
    isAddingTransaction,
    setIsAddingTransaction,
    isEditingTransaction,
    setIsEditingTransaction,
    selectedTransaction,
    setSelectedTransaction,
    isProfileDrawerOpen,
    setIsProfileDrawerOpen,
    isSettingsViewOpen,
    setIsSettingsViewOpen,
    settingsInitialTab,
    drawerPageRequest,
    setDrawerPageRequest,
    isIngestionHubOpen,
    setIsIngestionHubOpen,
    isReviewModalOpen,
    setIsReviewModalOpen,
    isCategoryDetailsOpen,
    setIsCategoryDetailsOpen,
    activeCategoryDetail,
    setActiveCategoryDetail,
    timeFilter,
    setTimeFilter,
    chartFilterValue,
    setChartFilterValue,
    evolutionView,
    setEvolutionView,
    projectionTaxMode,
    setProjectionTaxMode,
    isOnline,
    hasUnreadNotification,
    setHasUnreadNotification,
    openDrawer,
    handleOpenSettings,
    handleAiError,
    handleUniversalIngestion,
  } = useAppNavigation({
    settings,
    handleFileUpload,
    setApiKeyError,
    setError,
  });

  const [visualSettings, setVisualSettings] = usePersistentState<VisualSettings>('zenith_visual_settings', {
    isCustomEnabled: false,
    chartHeight: 'h-64',
    lineThickness: 0.5,
    showAxes: true,
    showProjections: true,
    accentColor: '#00FFA3',
    fontFamily: 'monospace',
    cardBgOpacity: 0.8,
    textColor: '#FFFFFF',
    textSizeScale: 1,
    textOpacity: 1
  });

  const [initialAIPrompt, setInitialAIPrompt] = useState<string>('');
  const [isQuickAIChatOpen, setIsQuickAIChatOpen] = useState(false);
  const [aiQuickInput, setAiQuickInput] = useState('');

  // Sincronização do tema: Tema Global vs Customização Visual
  useEffect(() => {
    const root = document.documentElement;
    const temaGlobal = settings?.zenith_config?.master_states?.tema_global || 'Escuro';
    const resolvedTheme = applyTheme(temaGlobal);

    if (visualSettings.isCustomEnabled) {
      if (resolvedTheme === 'light') {
        const cardOpacity = typeof visualSettings.cardBgOpacity === 'number' ? visualSettings.cardBgOpacity : 0.95;
        root.style.setProperty('--bg-app', '#F5F5F5');
        root.style.setProperty('--bg-card', `rgba(255, 255, 255, ${cardOpacity})`);
        root.style.setProperty('--text-primary', '#000000');
        root.style.setProperty('--text-muted', '#666666');
        root.style.setProperty('--border-card', 'rgba(0, 0, 0, 0.08)');
        if (visualSettings.accentColor) {
          root.style.setProperty('--accent', visualSettings.accentColor);
        }
      } else if (resolvedTheme === 'high-contrast') {
        if (visualSettings.accentColor) {
          root.style.setProperty('--accent', visualSettings.accentColor);
        }
      } else {
        // Escuro / dark
        const cardOpacity = typeof visualSettings.cardBgOpacity === 'number' ? visualSettings.cardBgOpacity : 0.6;
        root.style.setProperty('--bg-app', '#0a1a12');
        root.style.setProperty('--bg-card', `rgba(10, 26, 18, ${cardOpacity})`);
        root.style.setProperty('--text-primary', '#FFFFFF');
        root.style.setProperty('--text-muted', '#9CA3AF');
        root.style.setProperty('--border-card', 'rgba(0, 255, 163, 0.2)');
        root.style.setProperty('--accent', visualSettings.accentColor || '#00FFA3');
      }
    }
  }, [visualSettings.isCustomEnabled, visualSettings.accentColor, visualSettings.cardBgOpacity, settings?.zenith_config?.master_states?.tema_global]);

    if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
            <LoadingSpinner />
          </div>
        }
      >
        <AuthView
          onGoogleLogin={handleGoogleLogin}
          onEmailLogin={handleEmailLogin}
          onRegister={handleRegister}
          error={error}
          onClearError={() => setError(null)}
          language={settings?.language}
        />
      </Suspense>
    );
  }

  if (!settings && isOnline) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <LoadingSpinner label="Sincronizando Zenith Engine..." />
      </div>
    );
  }

  const activeSettings = settings || DEFAULT_SETTINGS;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans selection:bg-[var(--accent)]/30 pb-32 overflow-x-hidden">
        
        
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500/95 text-black text-center text-xs font-bold py-2 px-4 shadow-lg backdrop-blur-md">
          📡 Modo Offline — Verifique sua conexão
        </div>
      )}

        {/* --- HEADER --- */}
        <header className="px-6 py-6 sm:py-8 flex items-center gap-4 max-w-7xl mx-auto">
          <button
            onClick={() => setIsProfileDrawerOpen(true)}
            className="w-11 h-11 shrink-0 rounded-full border border-[var(--border-card)] overflow-hidden hover:border-[var(--accent)] transition-colors"
            aria-label={t('Abrir menu do perfil', 'Open profile menu')}
          >
            <img
              src={profile?.photoURL || user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`}
              alt="Perfil"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-medium text-[var(--text-primary)] truncate">
              {getGreeting()}, {(profile?.displayName || user.displayName || 'Juliano').split(' ')[0]}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 max-w-[280px] leading-tight">
              {t("Sua evolução patrimonial começa com a próxima decisão inteligente.", "Your net worth evolution starts with the next smart decision.")}
            </p>
          </div>
          <button onClick={() => { if (navigator.vibrate) navigator.vibrate([100,50,100]); try { const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const ctx = new AudioCtx(); const p = (f:number,s:number,d:number) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.1, s); g.gain.exponentialRampToValueAtTime(0.001, s+d); o.connect(g); g.connect(ctx.destination); o.start(s); o.stop(s+d); }; p(880, ctx.currentTime, 0.1); p(1108, ctx.currentTime + 0.1, 0.2); } catch(e) {} setHasUnreadNotification(false); setDrawerPageRequest("notifications"); setIsProfileDrawerOpen(true); }} className="relative p-2.5 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-full text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors shrink-0" aria-label="Notificacoes"><Bell size={20} />{hasUnreadNotification && (<span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-[var(--bg-card)] rounded-full animate-pulse" />)}</button>
        </header>

        {/* --- CONTEÚDO PRINCIPAL --- */}
        <main className="px-6 pb-32 space-y-6 max-w-7xl mx-auto">
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="text-red-500" size={18} />
                  <p className="text-xs text-red-500 font-medium">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-red-500 hover:bg-red-500/10 p-1 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {firestoreIssues.length > 0 && (
            <div className="fixed bottom-28 left-4 right-4 z-[130] mx-auto max-w-md">
              <div className="bg-[var(--bg-card)] border border-red-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-400">{t("Diagnóstico Firestore", "Firestore Diagnostics")}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const report = firestoreIssues.map(issue => `${issue.code} | ${issue.operationType} | ${issue.path || 'sem caminho'}`).join('\n');
                        if (navigator.clipboard) navigator.clipboard.writeText(report);
                      }}
                      className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-white px-2 py-1 rounded-lg bg-white/5"
                    >
                      {t("Copiar", "Copy")}
                    </button>
                    <button onClick={() => setFirestoreIssues([])} className="text-[var(--text-secondary)] hover:text-white p-1">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {firestoreIssues.map(issue => (
                    <p key={issue.id} className="text-[10px] font-mono leading-relaxed text-[var(--text-secondary)] break-all">
                      {issue.code} | {issue.operationType} | {issue.path || t("sem caminho", "no path")}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentTab === 'Armazenamento' && (
            <Suspense fallback={<LoadingSpinner />}>
              <StorageTrashView user={user} language={settings?.language} onRestore={restoreFromTrash} />
            </Suspense>
          )}

          {currentTab === 'Início' && (
            <Suspense fallback={<LoadingSpinner />}>
            <HomeView
              visualSettings={visualSettings}
              user={user}
              settings={activeSettings}
              assets={assets}
              transactions={transactions}
              ddas={ddas}
              privacyMode={privacyMode}
              onTogglePrivacy={togglePrivacyMode}
              metrics={metrics}
              chartData={chartData}
              projectionData={projectionData}
              cashFlowData={cashFlowData}
              evolutionView={evolutionView}
              setEvolutionView={setEvolutionView}
              projectionTaxMode={projectionTaxMode}
              setProjectionTaxMode={setProjectionTaxMode}
              chartFilterValue={chartFilterValue}
              setChartFilterValue={setChartFilterValue}
              marketRate={marketRate}
              forceCreateInvestment={forceCreateInvestment}
              setForceCreateInvestment={setForceCreateInvestment}
              investorProfile={investorProfile}
              portfolioAllocationPercent={portfolioAllocationPercent}
              openDrawer={openDrawer}
              onNavigateTab={setCurrentTab}
              onSelectAsset={setSelectedAsset}
              onAcceptDDA={handleAcceptDDA}
              onRejectDDA={handleRejectDDA}
              onUpdateAsset={updateAsset}
              onUpdateTransaction={updateTransaction}
              onCreateAsset={createAsset}
              goalTargets={goals}
              onSaveGoalTargets={updateGoals}
              t={t}
            />
            </Suspense>
          )}

          {currentTab === 'Carteira' && (
            <Suspense fallback={<LoadingSpinner />}>
              <DetalhesGastosPage 
                transactions={transactions}
                assets={assets}
                language={activeSettings.language}
                onEdit={(tx: Transaction) => {
                  setSelectedTransaction(tx);
                  setIsEditingTransaction(true);
                }}
                onDelete={(tx: Transaction) => moveToTrash(tx, 'transactions')}
                onAddTransaction={() => setIsAddingTransaction(true)}
                onUpdateAsset={updateAsset}
                onUpdateTransaction={updateTransaction}
              />
            </Suspense>
          )}

          {currentTab === 'Investimentos' && (
            <Suspense fallback={<LoadingSpinner />}>
              <InvestmentsView 
                assets={assets}
                investorProfile={investorProfile} 
                onAssetClick={(asset) => setSelectedAssetForDeepDive(asset)}
                language={settings?.language}
              />
            </Suspense>
          )}

          {currentTab === 'IA' && (
            <Suspense fallback={<LoadingSpinner />}>
              <ZenithIAView
                user={user}
                language={settings?.language}
                transactions={transactions}
                assets={assets}
                goals={goals}
                getGeminiApiKey={getGeminiApiKey}
                onAddTransaction={addTransaction}
                onAddTransfer={addTransfer}
                onUpdateTransaction={updateTransaction}
                onDeleteTransaction={(item: Transaction) => moveToTrash(item, 'transactions')}
                onCreateAsset={createAsset}
                onUpdateAsset={updateAsset}
                onDeleteAsset={(item: Asset) => moveToTrash(item, 'assets')}
                onUpdateGoals={updateGoals}
                onNavigateTab={(tab: string) => {
                  if (['Início', 'Carteira', 'Investimentos', 'IA', 'Armazenamento'].includes(tab)) {
                    setCurrentTab(tab as 'Início' | 'Carteira' | 'Investimentos' | 'IA' | 'Armazenamento');
                  }
                }}
                onApiKeyError={handleAiError}
                userRules={userRules}
                initialPrompt={initialAIPrompt}
                onClearInitialPrompt={() => setInitialAIPrompt('')}
              />
            </Suspense>
          )}

          {/* Profile Drawer */}
          <ProfileDrawer 
            isOpen={isProfileDrawerOpen}
            hasUnreadNotification={hasUnreadNotification}
            onClose={() => setIsProfileDrawerOpen(false)}
            initialPage={drawerPageRequest}
            profile={profile}
            user={user}
            notifications={notifications}
            language={settings?.language}
            apiKey={geminiApiKey}
            apiKeyError={apiKeyError}
            onClearApiKeyError={() => setApiKeyError(null)}
            onSaveApiKey={handleSaveApiKey}
            onSaveProfile={handleSaveProfile}
            userId={user.uid}
            onRestoreTrash={restoreFromTrash}
            currentConfig={settings?.zenith_config}
            visualSettings={visualSettings}
            onChangeVisualSettings={setVisualSettings}
            settingsLanguage={settings?.language}
            onLogout={handleLogout}
            logoutError={logoutError}
            onDeleteAccount={handleDeleteAccount}
            onOpenSettings={handleOpenSettings}
          />

          {/* Central de Configurações em Tela Cheia */}
          {isSettingsViewOpen && (
            <Suspense fallback={<LoadingSpinner />}>
              <SettingsView
                user={user}
                profile={profile}
                settings={activeSettings}
                currentConfig={settings?.zenith_config}
                language={activeSettings.language}
                visualSettings={visualSettings}
                onChangeVisualSettings={setVisualSettings}
                onSaveProfile={handleSaveProfile}
                onDeleteAccount={handleDeleteAccount}
                apiKey={geminiApiKey}
                apiKeyError={apiKeyError}
                onSaveApiKey={handleSaveApiKey}
                onClearApiKeyError={() => setApiKeyError(null)}
                initialTab={settingsInitialTab}
                onClose={() => setIsSettingsViewOpen(false)}
              />
            </Suspense>
          )}

          {/* Asset Detail / Edit Modal */}
          {selectedAsset && (
            <Suspense fallback={null}>
              <AssetModal 
                asset={selectedAsset} 
                onClose={() => setSelectedAsset(null)} 
                privacyMode={privacyMode}
                language={activeSettings.language}
                onDelete={async (id) => {
                  await deleteAsset(id);
                  setSelectedAsset(null);
                }}
                onSave={async (id, updateData) => {
                  await updateAsset(id, updateData);
                  setSelectedAsset(null);
                }}
              />
            </Suspense>
          )}

          {/* Asset Deep Dive Modal */}
          {selectedAssetForDeepDive && (
            <Suspense fallback={null}>
              <AssetDeepDiveModal 
                asset={selectedAssetForDeepDive} 
                onClose={() => setSelectedAssetForDeepDive(null)} 
                language={settings?.language} 
              />
            </Suspense>
          )}

          {/* Add Asset Modal */}
          {isAddingAsset && (
            <Suspense fallback={null}>
              <AddAssetModal 
                onClose={() => setIsAddingAsset(false)}
                language={activeSettings.language}
                investorProfile={investorProfile}
                user={user}
                getApiKey={getGeminiApiKey}
                onApiKeyError={handleAiError}
                onAdd={async (assetData) => {
                  await createAsset(assetData);
                  setIsAddingAsset(false);
                }}
              />
            </Suspense>
          )}

          {/* Category Detail Modal */}
          {isCategoryDetailsOpen && (
            <Suspense fallback={null}>
              <CategoryDetailModal 
                isOpen={isCategoryDetailsOpen}
                onClose={() => {
                  setIsCategoryDetailsOpen(false);
                  setActiveCategoryDetail(null);
                }}
                activeCategoryDetail={activeCategoryDetail}
                timeFilter={timeFilter}
                setTimeFilter={setTimeFilter}
                onOpenAddMenu={() => setIsAddMenuOpen(true)}
                cashFlowData={cashFlowData}
                metricsOutTotal={metrics.out.total}
                privacyMode={privacyMode}
                transactions={transactions}
              />
            </Suspense>
          )}

          {/* Add Transaction Modal */}
          {isAddingTransaction && (
            <Suspense fallback={null}>
              <AddTransactionModal 
                assets={assets}
                onClose={() => setIsAddingTransaction(false)}
                language={activeSettings.language}
                onAdd={async (txData) => {
                  await addTransaction(txData);
                  setIsAddingTransaction(false);
                }}
              />
            </Suspense>
          )}

          {/* Edit Transaction Modal */}
          {isEditingTransaction && selectedTransaction && (
            <Suspense fallback={null}>
              <AddTransactionModal 
                assets={assets}
                initialData={selectedTransaction}
                language={activeSettings.language}
                onClose={() => {
                  setIsEditingTransaction(false);
                  setSelectedTransaction(null);
                }}
                onAdd={async (txData) => {
                  await updateTransaction(selectedTransaction, txData);
                  setIsEditingTransaction(false);
                  setSelectedTransaction(null);
                }}
              />
            </Suspense>
          )}

          {/* Biometry Modal */}
          <Modal
            open={isBiometryModalOpen}
            onClose={() => setIsBiometryModalOpen(false)}
            showClose={false}
            className="max-w-sm w-full rounded-[40px] p-8 space-y-6 text-center"
          >
            <div className="w-20 h-20 bg-[var(--accent)]/10 rounded-full flex items-center justify-center mx-auto text-[var(--accent)]">
              <ShieldCheck size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-[var(--text-primary)]">{t("Ativar Biometria?", "Activate Biometrics?")}</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {t("Deseja ativar o acesso por biometria para facilitar seus próximos logins?", "Would you like to activate biometric access to facilitate your next logins?")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button 
                onClick={() => {
                  try {
                    localStorage.setItem(`biometry_${user?.uid}`, 'later');
                  } catch (e) { console.warn(e); }
                  setIsBiometryModalOpen(false);
                }}
                className="py-3 px-4 border border-[var(--border-card)] rounded-2xl text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/5 transition-colors active:scale-95"
              >
                {t("Mais tarde", "Later")}
              </button>
              <button 
                onClick={() => {
                  try {
                    localStorage.setItem(`biometry_${user?.uid}`, 'enabled');
                    localStorage.setItem(`biometry_active_${user?.uid}`, 'true');
                  } catch (e) { console.warn(e); }
                  setIsBiometryModalOpen(false);
                }}
                className="py-3 px-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors shadow-lg shadow-[var(--accent)]/20 active:scale-95"
              >
                {t("Ativar", "Activate")}
              </button>
            </div>
          </Modal>

          {/* Ingestion Hub */}
          <IngestionHub 
            isOpen={isIngestionHubOpen} 
            onClose={() => setIsIngestionHubOpen(false)} 
            onProcess={handleUniversalIngestion}
            language={activeSettings.language}
          />

          {/* Review Modal */}
          {isReviewModalOpen && (
            <ReviewModal 
              transaction={pendingTransaction}
              isProcessing={isProcessingIA}
              assets={assets}
              onConfirm={async (updatedTx) => {
                await confirmPendingTransaction(updatedTx);
                setIsReviewModalOpen(false);
              }}
              onCancel={() => {
                setIsReviewModalOpen(false);
                setPendingTransaction(null);
              }}
              language={settings?.language || 'pt-BR'}
            />
          )}

        </main>

        {/* ADD MENU MODAL */}
        {isAddMenuOpen && (
          <div className="fixed inset-0 z-[150] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm pb-28 transition-opacity" onClick={() => setIsAddMenuOpen(false)}>
            <div className="bg-[var(--bg-card)] w-full max-w-md rounded-3xl p-6 shadow-2xl flex flex-col gap-3.5 animate-in slide-in-from-bottom-5" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-[var(--text-primary)] text-center mb-1">
                  {t("Central de Criação & IA", "Creation Hub & AI")}
                </h3>

                {/* Prompt Rápido para Zenith IA */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!aiQuickInput.trim()) return;
                    setInitialAIPrompt(aiQuickInput.trim());
                    setAiQuickInput('');
                    setIsAddMenuOpen(false);
                    setCurrentTab('IA');
                  }}
                  className="flex items-center gap-2 p-2 bg-[var(--bg-app)] border border-[var(--border-card)] focus-within:border-[var(--accent)] rounded-2xl transition-colors mb-1"
                >
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <input
                    type="text"
                    value={aiQuickInput}
                    onChange={(e) => setAiQuickInput(e.target.value)}
                    placeholder={t("Pergunte ou comande a Zenith IA...", "Ask or command Zenith AI...")}
                    className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!aiQuickInput.trim()}
                    aria-label={t("Enviar para Zenith IA", "Send to Zenith AI")}
                    className="w-8 h-8 rounded-xl bg-[var(--accent)] text-[var(--bg-app)] flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-all shrink-0"
                  >
                    <Send size={13} />
                  </button>
                </form>

                {/* Ação Primária: Nova Transação Manual */}
                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    setIsAddingTransaction(true);
                  }}
                  className="flex items-center gap-4 p-4 bg-[var(--accent)]/10 border border-[var(--accent)]/40 hover:border-[var(--accent)] rounded-2xl transition text-left active:scale-[0.98]"
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--bg-app)] flex items-center justify-center shrink-0 shadow-md shadow-[var(--accent)]/30">
                    <Plus size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">{t("Nova Transação Manual", "New Manual Transaction")}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t("Lançar despesa, receita ou transferência", "Add expense, income, or transfer")}</p>
                  </div>
                </button>
                
                {/* Importar Dados */}
                <button type="button" onClick={() => { setIsAddMenuOpen(false); setIsIngestionHubOpen(true); }} className="flex items-center gap-4 p-4 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition text-left active:scale-[0.98]">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] shrink-0"><LayoutGrid size={20}/></div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">{t("Importar Dados", "Import Data")}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t("Extratos bancários ou notas fiscais", "Bank statements or invoices")}</p>
                  </div>
                </button>
    
                {/* Novo Investimento */}
                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    setCurrentTab('Investimentos');
                    setIsAddingAsset(true);
                  }}
                  className="flex items-center gap-4 p-4 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition text-left active:scale-[0.98]"
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] shrink-0"><TrendingUp size={20}/></div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">{t("Novo Ativo / Investimento", "New Asset / Investment")}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t("CDB, Tesouro, 99Pay, Ações, FIIs", "Fixed income, Treasury, Stocks, etc")}</p>
                  </div>
                </button>
            </div>
          </div>
        )}

        {/* FAB Quick-AI flutuante (Início, Carteira, Investimentos) */}
        {['Início', 'Carteira', 'Investimentos'].includes(currentTab) && (
          <ZenithFab
            onClick={() => setIsQuickAIChatOpen(true)}
            isOpen={isQuickAIChatOpen}
            ariaLabel={t("Abrir Zenith IA Express", "Open Zenith AI Express")}
          />
        )}

        {/* Quick-AI Chat Bottom Sheet */}
        <QuickAIChat
          isOpen={isQuickAIChatOpen}
          onClose={() => setIsQuickAIChatOpen(false)}
          getGeminiApiKey={getGeminiApiKey}
          transactions={transactions}
          assets={assets}
          goals={goals}
          language={activeSettings.language}
          onNavigateFullAI={(prompt) => {
            if (prompt) setInitialAIPrompt(prompt);
            setIsQuickAIChatOpen(false);
            setCurrentTab('IA');
          }}
          onAddTransaction={addTransaction}
          onAddTransfer={addTransfer}
          onUpdateTransaction={updateTransaction}
          onDeleteTransaction={(item: Transaction) => moveToTrash(item, 'transactions')}
          onCreateAsset={createAsset}
          onUpdateAsset={updateAsset}
          onDeleteAsset={(item: Asset) => moveToTrash(item, 'assets')}
        />
        
        {/* --- NAV DOCK --- */}
        <div className="fixed bottom-0 inset-x-0 p-6 z-40 pointer-events-none">
          <nav className="max-w-md mx-auto h-20 bg-[var(--bg-card)]/95 border border-[var(--border-card)] flex items-center justify-around px-4 rounded-[35px] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] pointer-events-auto">
            <NavItem icon={<LayoutGrid size={24} />} label={t("INÍCIO", "HOME")} active={currentTab === 'Início'} onClick={() => setCurrentTab('Início')} />
            <NavItem icon={<CreditCard size={24} />} label={t("CARTEIRA", "WALLET")} active={currentTab === 'Carteira'} onClick={() => setCurrentTab('Carteira')} />
            
            {/* FAB HUB */}
            <div className="relative -top-6">
              <button 
                onClick={() => setIsAddMenuOpen(true)}
                className="w-16 h-16 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(0,255,163,0.5)] hover:scale-110 transition-transform active:scale-95 pointer-events-auto"
                aria-label="Adicionar"
              >
                <Plus size={32} className="text-[var(--bg-app)]" />
              </button>
            </div>

            <NavItem icon={<TrendingUp size={24} />} label={t("INVEST", "INVEST")} active={currentTab === 'Investimentos'} onClick={() => setCurrentTab('Investimentos')} />
            <NavItem icon={<Sparkles size={24} />} label={t("ZENITH IA", "ZENITH AI")} active={currentTab === 'IA'} onClick={() => setCurrentTab('IA')} />
          </nav>
        </div>

      </div>
    </ErrorBoundary>
  );
}
