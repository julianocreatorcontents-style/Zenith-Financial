import { useState, useEffect } from 'react';
import { auth, db, doc, setDoc, onSnapshot, serverTimestamp, handleFirestoreError, OperationType } from '../firebase';
import { getSyncCachedUser } from '../lib/authSession';
import type { UserProfile, Settings } from '../types/app';
import type { ZenithUser } from './useZenithData';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
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
      idioma: 'pt-BR',
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
        return {
          ...DEFAULT_SETTINGS,
          zenith_config: data,
          privacyMode: data.master_states?.modo_privacidade ?? false,
        };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [privacyMode, setPrivacyMode] = useState(false);

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
        setSettings({
          ...DEFAULT_SETTINGS,
          zenith_config: data,
          privacyMode: data.master_states?.modo_privacidade ?? false,
        });
        setPrivacyMode(data.master_states?.modo_privacidade ?? false);
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
          const data = snap.data() as Settings;
          setSettings(data);
          setPrivacyMode(data.privacyMode);

          if (data.zenith_config) {
            try {
              localStorage.setItem(`zenith_config_${user.uid}`, JSON.stringify(data.zenith_config));
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
