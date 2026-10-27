/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, CreditCard, TrendingUp,
  LayoutGrid, Plus, AlertCircle, Sparkles, ShieldCheck
} from 'lucide-react';
import { 
  MissingApiKeyError,
  InvalidApiKeyError,
  getAiErrorMessage
} from './lib/ai';
import LoadingSpinner from './components/LoadingSpinner';
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProfileDrawer } from "./components/drawers/ProfileDrawer";
import { AddTransactionModal } from "./components/modals/AddTransactionModal";
import { IngestionHub, ReviewModal } from "./components/modals/IngestionModals";
import { AssetModal, AddAssetModal, AssetDeepDiveModal } from "./components/modals/AssetModals";
import { CategoryDetailModal } from "./components/modals/CategoryDetailModal";
import { NavItem } from "./components/layout/NavItem";
import { HomeView } from "./views/HomeView";
import { WalletTransactionsView as DetalhesGastosPage } from "./views/WalletTransactionsView";
import { InvestmentsView } from "./views/InvestmentsView";
import { AuthView } from "./views/AuthView";
import { Asset } from "./types/app";
import { useZenithData } from "./hooks/useZenithData";
import { applyTheme } from "./lib/theme";

const StorageTrashView = lazy(() => import('./views/StorageTrashView'));
const ZenithIAView = lazy(() => import('./views/ZenithIAView'));

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
    error, setError, firestoreIssues, setFirestoreIssues,
    geminiApiKey, apiKeyError, setApiKeyError,
    pendingTransaction, setPendingTransaction, isProcessingIA,
    metrics, chartData, projectionData, cashFlowData,
    portfolioAllocationPercent, t, getGeminiApiKey,
    togglePrivacyMode, handleSaveProfile, handleSaveApiKey,
    handleGoogleLogin, handleEmailLogin, handleRegister, handleLogout,
    handleAcceptDDA, handleRejectDDA, moveToTrash,
    createAsset, updateAsset, deleteAsset,
    addTransaction, updateTransaction, confirmPendingTransaction,
    handleFileUpload
  } = data;

  // Estados locais de navegação e modais da UI
  const [currentTab, setCurrentTab] = useState<'Início' | 'Carteira' | 'Investimentos' | 'IA' | 'Armazenamento'>('Início');
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [forceCreateInvestment, setForceCreateInvestment] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedAssetForDeepDive, setSelectedAssetForDeepDive] = useState<Asset | null>(null);
  const [isAddingAsset, setIsAddingAsset] = useState(false);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isEditingTransaction, setIsEditingTransaction] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [drawerPageRequest, setDrawerPageRequest] = useState<'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash'>('menu');
  const [isIngestionHubOpen, setIsIngestionHubOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isCategoryDetailsOpen, setIsCategoryDetailsOpen] = useState(false);
  const [activeCategoryDetail, setActiveCategoryDetail] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'7' | '15' | '30'>('30');
  const [chartFilterValue, setChartFilterValue] = useState<{ type: 'category' | 'asset' | null, value: string | null }>({ type: null, value: null });
  const [evolutionView, setEvolutionView] = useState<'historico' | 'projecao'>('historico');
  const [projectionTaxMode, setProjectionTaxMode] = useState<'liquido' | 'bruto'>('liquido');

  // Sincronização global do tema (Escuro, Claro, Contraste)
  useEffect(() => {
    const tema = settings?.zenith_config?.master_states?.tema_global || settings?.theme || 'Escuro';
    applyTheme(tema);
  }, [settings?.zenith_config?.master_states?.tema_global, settings?.theme]);

  const openDrawer = useCallback((page: 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash' = 'menu') => {
    setDrawerPageRequest(page);
    setIsProfileDrawerOpen(true);
  }, []);

  const handleAiError = useCallback((e: unknown) => {
    if (e instanceof MissingApiKeyError || e instanceof InvalidApiKeyError) {
      setApiKeyError(e.message);
      openDrawer('ai_key');
      return;
    }
    setError(getAiErrorMessage(e, settings?.language || 'pt-BR'));
  }, [settings?.language, openDrawer, setApiKeyError, setError]);

  const handleUniversalIngestion = async (type: 'scanner' | 'upload' | 'spreadsheet' | 'manual') => {
    if (type === 'manual') {
      setIsIngestionHubOpen(false);
      setIsAddingTransaction(true);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    if (type === 'scanner') {
      input.accept = 'image/*';
      input.capture = 'environment';
    } else if (type === 'spreadsheet') {
      input.accept = '.csv, .xlsx, .xls';
    } else {
      input.accept = 'image/*,application/pdf';
    }
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        setIsIngestionHubOpen(false);
        handleFileUpload(file).then(() => {
          if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
            setIsReviewModalOpen(true);
          }
        });
      }
    };
    input.click();
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        onGoogleLogin={handleGoogleLogin}
        onEmailLogin={handleEmailLogin}
        onRegister={handleRegister}
        error={error}
        onClearError={() => setError(null)}
        language={settings?.language}
      />
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest animate-pulse">
            Sincronizando Zenith Engine...
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans selection:bg-[var(--accent)]/30 pb-32 overflow-x-hidden">
        
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
              <StorageTrashView user={user} language={settings?.language} />
            </Suspense>
          )}

          {currentTab === 'Início' && (
            <HomeView
              user={user}
              settings={settings}
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
              onCreateAsset={createAsset}
              t={t}
            />
          )}

          {currentTab === 'Carteira' && (
            <DetalhesGastosPage 
              transactions={transactions}
              language={settings?.language}
              onEdit={(tx: any) => {
                setSelectedTransaction(tx);
                setIsEditingTransaction(true);
              }}
              onDelete={(tx: any) => moveToTrash(tx, 'transactions')}
            />
          )}

          {currentTab === 'Investimentos' && (
            <InvestmentsView 
              assets={assets}
              investorProfile={investorProfile} 
              onAssetClick={(asset) => setSelectedAssetForDeepDive(asset)}
              language={settings?.language}
            />
          )}

          {currentTab === 'IA' && (
            <Suspense fallback={<LoadingSpinner />}>
              <ZenithIAView
                user={user}
                language={settings?.language}
                transactions={transactions}
                assets={assets}
                getApiKey={getGeminiApiKey}
                onApiKeyError={handleAiError}
                userRules={userRules}
              />
            </Suspense>
          )}

          {/* Profile Drawer */}
          <ProfileDrawer 
            isOpen={isProfileDrawerOpen}
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
            currentConfig={settings?.zenith_config}
            settingsLanguage={settings?.language}
            onLogout={handleLogout}
          />

          {/* Asset Detail / Edit Modal */}
          {selectedAsset && (
            <AssetModal 
              asset={selectedAsset} 
              onClose={() => setSelectedAsset(null)} 
              privacyMode={privacyMode}
              language={settings.language}
              onDelete={async (id) => {
                await deleteAsset(id);
                setSelectedAsset(null);
              }}
              onSave={async (id, updateData) => {
                await updateAsset(id, updateData);
                setSelectedAsset(null);
              }}
            />
          )}

          {/* Asset Deep Dive Modal */}
          {selectedAssetForDeepDive && (
            <AssetDeepDiveModal 
              asset={selectedAssetForDeepDive} 
              onClose={() => setSelectedAssetForDeepDive(null)} 
              language={settings?.language} 
            />
          )}

          {/* Add Asset Modal */}
          {isAddingAsset && (
            <AddAssetModal 
              onClose={() => setIsAddingAsset(false)}
              language={settings.language}
              investorProfile={investorProfile}
              user={user}
              getApiKey={getGeminiApiKey}
              onApiKeyError={handleAiError}
              onAdd={async (assetData) => {
                await createAsset(assetData);
                setIsAddingAsset(false);
              }}
            />
          )}

          {/* Category Detail Modal */}
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

          {/* Add Transaction Modal */}
          {isAddingTransaction && (
            <AddTransactionModal 
              onClose={() => setIsAddingTransaction(false)}
              language={settings.language}
              onAdd={async (txData) => {
                await addTransaction(txData);
                setIsAddingTransaction(false);
              }}
            />
          )}

          {/* Edit Transaction Modal */}
          {isEditingTransaction && selectedTransaction && (
            <AddTransactionModal 
              initialData={selectedTransaction}
              language={settings.language}
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
          )}

          {/* Biometry Modal */}
          {isBiometryModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] p-8 max-w-sm w-full space-y-6 text-center shadow-2xl"
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
                    className="py-3 px-4 border border-[var(--border-card)] rounded-2xl text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/5 transition-colors"
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
                    className="py-3 px-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors shadow-lg shadow-[var(--accent)]/20"
                  >
                    {t("Ativar", "Activate")}
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Ingestion Hub */}
          <IngestionHub 
            isOpen={isIngestionHubOpen} 
            onClose={() => setIsIngestionHubOpen(false)} 
            onProcess={handleUniversalIngestion}
            language={settings.language}
          />

          {/* Review Modal */}
          {isReviewModalOpen && (
            <ReviewModal 
              transaction={pendingTransaction}
              isProcessing={isProcessingIA}
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
            <div className="bg-[var(--bg-card)] w-full max-w-md rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-5" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-[var(--text-primary)] text-center mb-2">O que deseja adicionar?</h3>
                
                <button type="button" onClick={() => { setIsAddMenuOpen(false); setIsIngestionHubOpen(true); }} className="flex items-center gap-4 p-4 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition text-left">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] shrink-0"><LayoutGrid size={20}/></div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">Importar Dados</p>
                    <p className="text-xs text-[var(--text-muted)]">Extratos bancários ou notas</p>
                  </div>
                </button>
    
                <button type="button" onClick={() => { setIsAddMenuOpen(false); setForceCreateInvestment(true); }} className="flex items-center gap-4 p-4 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition text-left">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] shrink-0"><TrendingUp size={20}/></div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">Novo Investimento</p>
                    <p className="text-xs text-[var(--text-muted)]">CDB, Tesouro, 99Pay, etc</p>
                  </div>
                </button>
            </div>
          </div>
        )}
        
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
