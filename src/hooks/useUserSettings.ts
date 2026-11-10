import { useState, useEffect } from 'react';
import { auth, db, doc, setDoc, updateDoc, onSnapshot, serverTimestamp, handleFirestoreError, OperationType } from '../firebase';
import { getSyncCachedUser } from '../lib/authSession';
import type { UserProfile, Settings } from '../types/app';
import type { ZenithUser } from './useZenithData';

export type AppLanguage = 'pt-BR' | 'en-US' | 'es-ES';

export const IDIOMA_MAP: Record<string, AppLanguage> = {
  'Português (Brasil)': 'pt-BR',
  'pt-BR': 'pt-BR',
  'English (US)': 'en-US',
  'en-US': 'en-US',
  'Español': 'es-ES',
  'es-ES': 'es-ES',
};

export function mapIdiomaToLanguage(idioma?: string): AppLanguage {
  if (!idioma) return 'pt-BR';
  return IDIOMA_MAP[idioma] || 'pt-BR';
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'pt-BR',
  privacyMode: false,
  activeWidgets: ['all'],
  yieldColor: '#00FFA3',
  granularity: 'month',
  customTerms: {},
  zenith_config: {
    master_states: {
      modo_privacidade: false,
      insights_ia_ativo: true,
      idioma: 'Português (Brasil)',
      tema_global: 'Escuro',
      dashboard_management_expanded: false,
    },
    categories: {
      'Alimentação': { id: 'Alimentação', nome: 'Alimentação', cor_destaque: { hex: '#FF5722' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
      'Moradia': { id: 'Moradia', nome: 'Moradia', cor_destaque: { hex: '#2196F3' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
      'Transporte': { id: 'Transporte', nome: 'Transporte', cor_destaque: { hex: '#4CAF50' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
      'Lazer': { id: 'Lazer', nome: 'Lazer', cor_destaque: { hex: '#9C27B0' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
      'Saúde': { id: 'Saúde', nome: 'Saúde', cor_destaque: { hex: '#E91E63' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
    },
    dashboard_order: [
      'CHART_EVOL_PATRIMONIO',
      'METRIC_ENTRADAS',
      'METRIC_SAIDAS',
      'METRIC_RENDIMENTOS',
      'CHART_ALOC_ATIV',
      'CHART_FLUXO_CAIXA',
      'CHART_DIST_CATEG',
      'CHART_SAZON_MENS',
      'CHART_PREV_CONTAS',
      'CHART_METAS_PROG',
    ],
  },
};

export function useUserSettings(user: ZenithUser | null) {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const u = auth.currentUser || getSyncCachedUser();
    if (!u) return null;
    return {
      uid: u.uid,
      displayName: u.displayName || 'Usuário',
      photoURL: u.photoURL || `https://picsum.photos/seed/${u.uid}/100/100`,
      email: u.email || '',
      investor_profile: 'Conservador',
    };
  });

  const [investorProfile, setInvestorProfile] = useState<'Conservador' | 'Sofisticado' | 'Arrojado'>('Conservador');
  const [isBiometryModalOpen, setIsBiometryModalOpen] = useState(false);

  const [settings, setSettings] = useState<Settings | null>(() => {
    const u = auth.currentUser || getSyncCachedUser();
    if (!u) return null;
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem(`zenith_config_${u.uid}`) : null;
      if (cached) {
        const data = JSON.parse(cached);
        const resolvedLanguage = mapIdiomaToLanguage(data.master_states?.idioma);
        const resolvedPrivacy = data.master_states?.modo_privacidade ?? false;
        return {
          ...DEFAULT_SETTINGS,
          language: resolvedLanguage,
          zenith_config: data,
          privacyMode: resolvedPrivacy,
        };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [privacyMode, setPrivacyMode] = useState<boolean>(() => {
    const u = auth.currentUser || getSyncCachedUser();
    if (!u) return false;
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem(`zenith_config_${u.uid}`) : null;
      if (cached) {
        const data = JSON.parse(cached);
        return data.master_states?.modo_privacidade ?? false;
      }
    } catch {}
    return false;
  });

  // 3. Profile Listener
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        try {
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            setProfile({ ...data, uid: snap.id });
            if (data.investor_profile) setInvestorProfile(data.investor_profile);
          } else if (typeof navigator === 'undefined' || navigator.onLine) {
            const initialProfile: Record<string, unknown> = {
              uid: user.uid,
              displayName: user.displayName || 'Usuário',
              photoURL: user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`,
              email: user.email || '',
              investor_profile: 'Conservador',
              createdAt: serverTimestamp(),
              authProvider: user.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'email',
            };
            setDoc(doc(db, 'users', user.uid), initialProfile)
              .then(() => {
                try {
                  const biometryDecision = localStorage.getItem(`biometry_${user.uid}`);
                  if (!biometryDecision && typeof window !== 'undefined' && window.PublicKeyCredential) {
                    setIsBiometryModalOpen(true);
                  }
                } catch (e) {
                  console.warn('localStorage blocked:', e);
                }
              })
              .catch((e) => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
          }
        } catch (e) {
          console.error('Error in profile listener:', e);
        }
      },
      (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}`)
    );
    return unsub;
  }, [user]);

  // 6. Settings Listener
  useEffect(() => {
    if (!user) {
      setSettings(null);
      return;
    }

    try {
      const cached = localStorage.getItem(`zenith_config_${user.uid}`);
      if (cached) {
        const data = JSON.parse(cached);
        const resolvedLanguage = mapIdiomaToLanguage(data.master_states?.idioma);
        const resolvedPrivacy = data.master_states?.modo_privacidade ?? false;
        setSettings({
          ...DEFAULT_SETTINGS,
          language: resolvedLanguage,
          zenith_config: data,
          privacyMode: resolvedPrivacy,
        });
        setPrivacyMode(resolvedPrivacy);
      } else {
        setSettings((curr) => curr || DEFAULT_SETTINGS);
      }
    } catch (e) {
      console.warn('Failed to load cached settings:', e);
      setSettings((curr) => curr || DEFAULT_SETTINGS);
    }

    const unsub = onSnapshot(
      doc(db, 'settings', user.uid),
      (snap) => {
        if (snap.exists()) {
          const rawData = snap.data() as Partial<Settings>;
          const configIdioma = rawData.zenith_config?.master_states?.idioma;
          const resolvedLanguage = configIdioma ? mapIdiomaToLanguage(configIdioma) : (rawData.language || 'pt-BR');
          const resolvedPrivacy = rawData.privacyMode ?? rawData.zenith_config?.master_states?.modo_privacidade ?? false;

          const unifiedData: Settings = {
            ...DEFAULT_SETTINGS,
            ...rawData,
            language: resolvedLanguage,
            privacyMode: resolvedPrivacy,
          };

          setSettings(unifiedData);
          setPrivacyMode(resolvedPrivacy);

          if (unifiedData.zenith_config) {
            try {
              localStorage.setItem(`zenith_config_${user.uid}`, JSON.stringify(unifiedData.zenith_config));
            } catch (e) {
              console.warn('Storage failed:', e);
            }
          }
        } else if (typeof navigator === 'undefined' || navigator.onLine) {
          setDoc(doc(db, 'settings', user.uid), DEFAULT_SETTINGS).catch((e) =>
            handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`)
          );
        }
      },
      (e) => handleFirestoreError(e, OperationType.GET, `settings/${user.uid}`)
    );
    return unsub;
  }, [user]);

  // Sincronização de idioma: escuta zenith_config.master_states.idioma e sincroniza com settings.language
  useEffect(() => {
    const rawIdioma = settings?.zenith_config?.master_states?.idioma;
    if (!rawIdioma) return;
    const targetLanguage = mapIdiomaToLanguage(rawIdioma);
    if (settings.language !== targetLanguage) {
      setSettings((current) => (current ? { ...current, language: targetLanguage } : current));
      if (user) {
        updateDoc(doc(db, 'settings', user.uid), { language: targetLanguage }).catch((e) =>
          handleFirestoreError(e, OperationType.UPDATE, `settings/${user.uid}`)
        );
      }
    }
  }, [settings?.zenith_config?.master_states?.idioma, settings?.language, user]);

  // Sincronização de privacidade: garante que settings.privacyMode é a única fonte da verdade
  useEffect(() => {
    if (!settings) return;
    const configPrivacy = settings.zenith_config?.master_states?.modo_privacidade;
    if (configPrivacy !== undefined && configPrivacy !== settings.privacyMode) {
      setSettings((current) => (current ? { ...current, privacyMode: configPrivacy } : current));
      setPrivacyMode(configPrivacy);
      if (user) {
        updateDoc(doc(db, 'settings', user.uid), { privacyMode: configPrivacy }).catch((e) =>
          handleFirestoreError(e, OperationType.UPDATE, `settings/${user.uid}`)
        );
      }
    }
  }, [settings?.zenith_config?.master_states?.modo_privacidade, settings?.privacyMode, user]);

  return {
    profile,
    setProfile,
    investorProfile,
    setInvestorProfile,
    isBiometryModalOpen,
    setIsBiometryModalOpen,
    settings,
    setSettings,
    privacyMode,
    setPrivacyMode,
  };
}
