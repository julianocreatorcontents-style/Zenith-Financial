import { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

interface WebSpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface WebSpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: WebSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface WebSpeechRecognitionConstructor {
  new (): WebSpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: WebSpeechRecognitionConstructor;
    webkitSpeechRecognition?: WebSpeechRecognitionConstructor;
  }
}

interface UseVoiceRecognitionOptions {
  language?: string;
}

interface UseVoiceRecognitionReturn {
  isListening: boolean;
  toggleListening: (
    onTranscript: (text: string) => void,
    onError?: (msg: string) => void
  ) => Promise<void>;
}

export function useVoiceRecognition({
  language,
}: UseVoiceRecognitionOptions = {}): UseVoiceRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const webRecognitionRef = useRef<WebSpeechRecognitionInstance | null>(null);

  const lang = language === 'en-US' ? 'en-US' : 'pt-BR';

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang;
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    webRecognitionRef.current = recognition;
  }, [lang]);

  const toggleListening = async (
    onTranscript: (text: string) => void,
    onError?: (msg: string) => void
  ): Promise<void> => {
    if (isListening) {
      if (Capacitor.isNativePlatform()) {
        await SpeechRecognition.stop();
      } else {
        webRecognitionRef.current?.stop();
      }
      setIsListening(false);
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted') {
          const req = await SpeechRecognition.requestPermissions();
          if (req.speechRecognition !== 'granted') {
            onError?.(
              language === 'en-US'
                ? 'Microphone permission denied.'
                : 'Permissão de microfone negada.'
            );
            return;
          }
        }
        setIsListening(true);
        const result = await SpeechRecognition.start({
          language: lang,
          maxResults: 1,
          partialResults: false,
        });
        if (result.matches && result.matches.length > 0) {
          const transcript = result.matches[0];
          if (transcript) onTranscript(transcript);
        }
      } catch {
        onError?.(
          language === 'en-US'
            ? 'Could not capture audio.'
            : 'Não foi possível capturar o áudio.'
        );
      } finally {
        setIsListening(false);
      }
    } else {
      const recognition = webRecognitionRef.current;
      if (!recognition) return;

      recognition.lang = lang;
      recognition.onresult = (event: WebSpeechRecognitionEvent) => {
        const resultItem = event.results[0]?.[0];
        if (resultItem) {
          onTranscript(resultItem.transcript);
        }
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      try {
        recognition.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  return { isListening, toggleListening };
}
