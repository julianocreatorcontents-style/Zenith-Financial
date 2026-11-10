import { useState, useEffect, useCallback } from 'react';
import type { Asset, Transaction, Settings } from '../types/app';
import type { SettingsTab } from '../views/SettingsView';
import { MissingApiKeyError, InvalidApiKeyError, getAiErrorMessage } from '../lib/ai';

export type NavigationTab = 'Início' | 'Carteira' | 'Investimentos' | 'IA' | 'Armazenamento';
export type DrawerPage = 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash';

export interface UseAppNavigationProps {
  settings?: Settings | null;
  handleFileUpload: (file: File) => Promise<void>;
  setApiKeyError: (err: string | null) => void;
  setError: (err: string | null) => void;
}

export function useAppNavigation({
  settings,
  handleFileUpload,
  setApiKeyError,
  setError,
}: UseAppNavigationProps) {
  // Abas principais
  const [currentTab, setCurrentTab] = useState<NavigationTab>('Início');

  // Modais de Ativos e Investimentos
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [forceCreateInvestment, setForceCreateInvestment] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedAssetForDeepDive, setSelectedAssetForDeepDive] = useState<Asset | null>(null);
  const [isAddingAsset, setIsAddingAsset] = useState(false);

  // Modais de Transações
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isEditingTransaction, setIsEditingTransaction] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Drawers e Configurações
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [isSettingsViewOpen, setIsSettingsViewOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('dashboard');
  const [drawerPageRequest, setDrawerPageRequest] = useState<DrawerPage>('menu');

  // Ingestão e Revisão IA
  const [isIngestionHubOpen, setIsIngestionHubOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Categoria e Filtros
  const [isCategoryDetailsOpen, setIsCategoryDetailsOpen] = useState(false);
  const [activeCategoryDetail, setActiveCategoryDetail] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'7' | '15' | '30'>('30');
  const [chartFilterValue, setChartFilterValue] = useState<{ type: 'category' | 'asset' | null; value: string | null }>({
    type: null,
    value: null,
  });
  const [evolutionView, setEvolutionView] = useState<'historico' | 'projecao'>('historico');
  const [projectionTaxMode, setProjectionTaxMode] = useState<'liquido' | 'bruto'>('liquido');

  // Conectividade e Notificação
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasUnreadNotification, setHasUnreadNotification] = useState(true);

  // Efeito sonoro de notificação
  useEffect(() => {
    if (!hasUnreadNotification) return;
    const tryPlay = () => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const p = (f: number, s: number, d: number) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.1, s);
          g.gain.exponentialRampToValueAtTime(0.001, s + d);
          o.connect(g);
          o.connect(ctx.destination);
          o.start(s);
          o.stop(s + d);
        };
        p(880, ctx.currentTime, 0.1);
        p(1108, ctx.currentTime + 0.1, 0.2);
        document.removeEventListener('click', tryPlay);
        document.removeEventListener('touchstart', tryPlay);
      } catch {
        // Áudio não disponível
      }
    };
    tryPlay();
    document.addEventListener('click', tryPlay, { once: true });
    document.addEventListener('touchstart', tryPlay, { once: true });
  }, [hasUnreadNotification]);

  // Monitor de rede Online/Offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleOpenSettings = useCallback((initialTab: SettingsTab = 'dashboard') => {
    setSettingsInitialTab(initialTab);
    setIsProfileDrawerOpen(false);
    setIsSettingsViewOpen(true);
  }, []);

  const openDrawer = useCallback(
    (page: DrawerPage = 'menu') => {
      if (page === 'settings') {
        handleOpenSettings('dashboard');
        return;
      }
      if (page === 'profile') {
        handleOpenSettings('perfil');
        return;
      }
      if (page === 'ai_key') {
        handleOpenSettings('ia');
        return;
      }
      setDrawerPageRequest(page);
      setIsProfileDrawerOpen(true);
    },
    [handleOpenSettings]
  );

  const handleAiError = useCallback(
    (e: unknown) => {
      if (e instanceof MissingApiKeyError || e instanceof InvalidApiKeyError) {
        setApiKeyError((e as Error).message);
        handleOpenSettings('ia');
        return;
      }
      setError(getAiErrorMessage(e, settings?.language || 'pt-BR'));
    },
    [settings?.language, handleOpenSettings, setApiKeyError, setError]
  );

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
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (file) {
        setIsIngestionHubOpen(false);
        handleFileUpload(file).then(() => {
          const lower = file.name.toLowerCase();
          if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
            setIsReviewModalOpen(true);
          }
        });
      }
    };
    input.click();
  };

  return {
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
    setSettingsInitialTab,
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
    handleOpenSettings,
    openDrawer,
    handleAiError,
    handleUniversalIngestion,
  };
}

export default useAppNavigation;
