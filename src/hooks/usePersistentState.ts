import { useState, useEffect } from 'react';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  // Carrega o valor inicial
  useEffect(() => {
    const load = async () => {
      try {
        let saved: string | null = null;
        if (Capacitor.isNativePlatform()) {
          const { value } = await Preferences.get({ key });
          saved = value;
        } else {
          saved = localStorage.getItem(key);
        }
        
        if (saved) {
          setState(JSON.parse(saved));
        }
      } catch (e) {
        console.warn(`Erro ao carregar ${key}:`, e);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
  }, [key]);

  // Salva sempre que o estado mudar
  useEffect(() => {
    if (!isLoaded) return; // Não salva o estado inicial antes de carregar o real
    
    const save = async () => {
      try {
        const value = JSON.stringify(state);
        if (Capacitor.isNativePlatform()) {
          await Preferences.set({ key, value });
        } else {
          localStorage.setItem(key, value);
        }
      } catch (e) {
        console.warn(`Erro ao salvar ${key}:`, e);
      }
    };
    save();
  }, [key, state, isLoaded]);

  return [state, setState, isLoaded];
}
