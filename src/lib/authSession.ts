import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export interface CachedAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerData?: Array<{ providerId: string }>;
  isOffline?: boolean;
}

const CACHED_USER_KEY = 'zenith_last_auth_user';

export function getSyncCachedUser(): CachedAuthUser | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(CACHED_USER_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[AuthSession] Erro ao ler cache síncrono de usuário:', err);
    return null;
  }
}

export async function saveCachedUser(user: CachedAuthUser): Promise<void> {
  const payload = JSON.stringify(user);
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CACHED_USER_KEY, payload);
    }
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: CACHED_USER_KEY, value: payload });
    }
  } catch (err) {
    console.warn('[AuthSession] Erro ao salvar sessão de usuário em cache:', err);
  }
}

export async function getCachedUser(): Promise<CachedAuthUser | null> {
  try {
    let saved: string | null = null;
    if (Capacitor.isNativePlatform()) {
      const res = await Preferences.get({ key: CACHED_USER_KEY });
      saved = res.value;
    }
    if (!saved && typeof window !== 'undefined') {
      saved = localStorage.getItem(CACHED_USER_KEY);
    }
    if (saved) {
      return JSON.parse(saved) as CachedAuthUser;
    }
  } catch (err) {
    console.warn('[AuthSession] Erro ao obter sessão de usuário em cache:', err);
  }
  return null;
}

export async function clearCachedUser(): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CACHED_USER_KEY);
    }
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key: CACHED_USER_KEY });
    }
  } catch (err) {
    console.warn('[AuthSession] Erro ao limpar cache de usuário:', err);
  }
}
