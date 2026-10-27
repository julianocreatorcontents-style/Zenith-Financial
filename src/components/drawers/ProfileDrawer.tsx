import { CardSettingsPanel } from '../CardSettingsPanel';
import type { VisualSettings } from '../CardSettingsPanel';
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { motion } from 'motion/react';
import {
  User as UserIcon,
  Bell,
  Settings as SettingsIcon,
  KeyRound,
  HardDrive,
  LogOut,
  ArrowLeft,
  X,
  Loader2,
  Camera,
  Save,
  BellOff,
} from 'lucide-react';
import LoadingSpinner from '../LoadingSpinner';

const StorageTrashView = lazy(() => import('../../views/StorageTrashView'));
const HeritageSettings = lazy(() =>
  import('../HeritageSettings').then((module) => ({ default: module.HeritageSettings }))
);

export type DrawerPage = 'menu' | 'profile' | 'notifications' | 'settings' | 'visual_settings' | 'ai_key' | 'trash';

export function imageFileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('invalid-type'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-error'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('decode-error'));
      image.onload = () => {
        const size = 320;
        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas-error'));
          return;
        }
        ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileSection({ profile, onSave, onDone, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({ ...profile });
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setPhotoError(t('A imagem deve ter no máximo 12 MB.', 'The image must be at most 12 MB.'));
      return;
    }
    setPhotoError(null);
    setPhotoLoading(true);
    try {
      const dataUrl = await imageFileToAvatar(file);
      setFormData((current: any) => ({ ...current, photoURL: dataUrl }));
    } catch {
      setPhotoError(t('Não foi possível carregar esta imagem.', 'Could not load this image.'));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.displayName?.trim()) {
      alert(t('O nome não pode estar vazio.', 'The name cannot be empty.'));
      return;
    }
    setSaving(true);
    try {
      await onSave(formData);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="flex flex-col items-center gap-3 text-center">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative w-20 h-20 rounded-3xl border-2 border-[var(--accent)] overflow-hidden group"
        >
          {formData.photoURL ? (
            <img src={formData.photoURL} alt={t('Perfil', 'Profile')} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
              <UserIcon size={30} />
            </span>
          )}
          <span className={`absolute inset-0 bg-black/50 flex items-center justify-center text-white transition-opacity ${photoLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            {photoLoading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        {photoError && <p className="text-[10px] text-[var(--destructive)]">{photoError}</p>}
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{profile?.displayName}</h3>
          <p className="text-[10px] text-[var(--text-muted)]">{profile?.email}</p>
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Nome de Exibição', 'Display Name')}</label>
        <input value={formData.displayName || ''} onChange={e => setFormData({ ...formData, displayName: e.target.value })} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none" />
      </div>
      <div>
        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Perfil de Investidor', 'Investor Profile')}</label>
        <select
          value={formData.investor_profile || 'Conservador'}
          onChange={e => setFormData({ ...formData, investor_profile: e.target.value })}
          className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none"
        >
          <option value="Conservador">Conservador</option>
          <option value="Sofisticado">Sofisticado</option>
          <option value="Arrojado">Arrojado</option>
        </select>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Save size={16} /> {t('Salvar Alterações', 'Save Changes')}
      </button>
    </div>
  );
}

export function NotificationsSection({ notifications = [], language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);

  if (notifications.length === 0) {
    return (
      <div className="py-16 text-center">
        <BellOff size={40} className="mx-auto text-[var(--text-muted)] mb-4 opacity-20" />
        <p className="text-[var(--text-muted)] text-xs uppercase font-bold tracking-widest">{t('Tudo limpo por aqui', 'All clear here')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      {notifications.map((n: any, i: number) => (
        <div key={`notif-${i}-${n.time}`} className="p-4 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl space-y-1">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest">{n.type}</span>
            <span className="text-[8px] text-[var(--text-muted)] font-bold">{n.time}</span>
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{n.title}</p>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{n.message}</p>
        </div>
      ))}
    </div>
  );
}

export function AiKeySection({ apiKey, error, onSave, onClearError, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [draft, setDraft] = useState(apiKey || '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!draft.trim()) {
      setLocalError(t('Informe uma chave válida.', 'Enter a valid key.'));
      return;
    }
    onSave(draft);
    setLocalError(null);
    setSaved(true);
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="w-14 h-14 bg-[var(--accent)]/10 rounded-2xl flex items-center justify-center text-[var(--accent)]">
        <KeyRound size={28} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Chave da API Gemini', 'Gemini API Key')}</h3>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          {t(
            'Informe sua própria chave do Google AI Studio. Ela fica salva apenas neste navegador.',
            'Enter your own Google AI Studio key. It is stored only in this browser.'
          )}
        </p>
      </div>

      <input
        type="password"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setLocalError(null);
          setSaved(false);
          onClearError?.();
        }}
        placeholder="AIza..."
        className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none font-mono"
      />

      {(localError || error) && (
        <p className="text-xs text-[var(--destructive)] font-medium">{localError || error}</p>
      )}

      {saved && (
        <p className="text-xs text-[var(--accent)] font-medium">{t('Chave salva neste navegador.', 'Key saved in this browser.')}</p>
      )}

      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        {t('Obtenha uma chave em', 'Get a key at')}{' '}
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] underline break-all"
        >
          aistudio.google.com/app/apikey
        </a>
      </p>

      <button
        onClick={handleSave}
        className="w-full py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors"
      >
        {t('Salvar chave', 'Save key')}
      </button>
    </div>
  );
}

export interface ProfileDrawerProps {
  visualSettings?: VisualSettings;
  onChangeVisualSettings?: (s: VisualSettings) => void;
  isOpen: boolean;
  onClose: () => void;
  initialPage?: DrawerPage;
  profile?: any;
  user?: any;
  notifications?: any[];
  language?: string;
  apiKey?: string;
  chartFilter?: any;
  onChartFilterChange?: (filter: any) => void;
  apiKeyError?: string | null;
  onClearApiKeyError?: () => void;
  onSaveApiKey?: (key: string) => void;
  onSaveProfile?: (profile: any) => Promise<void>;
  userId?: string;
  currentConfig?: any;
  settingsLanguage?: string;
  onLogout: () => void;
}

export function ProfileDrawer({
  isOpen,
  onClose,
  initialPage = 'menu',
  profile,
  user,
  notifications = [],
  language,
  apiKey,
  chartFilter,
  onChartFilterChange,
  apiKeyError,
  onClearApiKeyError,
  onSaveApiKey,
  onSaveProfile,
  userId,
  currentConfig,
  settingsLanguage,
  onLogout,
  visualSettings,
  onChangeVisualSettings,
}: ProfileDrawerProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [activeDrawerPage, setActiveDrawerPage] = useState<DrawerPage>('menu');

  useEffect(() => {
    setActiveDrawerPage(isOpen ? initialPage : 'menu');
  }, [isOpen, initialPage]);

  if (!isOpen) return null;

  const displayName = profile?.displayName || user?.displayName || t('Usuário', 'User');
  const email = profile?.email || user?.email || '';
  const photoURL = profile?.photoURL || user?.photoURL || (user?.uid ? `https://picsum.photos/seed/${user.uid}/100/100` : '');

  const pageTitles: Record<DrawerPage, string> = {
    menu: t('Menu', 'Menu'),
    profile: t('Meu Perfil', 'My Profile'),
    notifications: t('Notificações', 'Notifications'),
    settings: t('Configurações', 'Settings'),
    ai_key: t('Chave da IA', 'AI Key'),
    trash: t('Armazenamento e Lixeira', 'Storage & Trash')
  };

  const menuItems: { id: DrawerPage; label: string; icon: React.ReactNode; badge?: boolean }[] = [
    { id: 'profile', label: t('Meu Perfil', 'My Profile'), icon: <UserIcon size={20} /> },
    { id: 'notifications', label: t('Notificações', 'Notifications'), icon: <Bell size={20} />, badge: notifications.length > 0 },
    { id: 'settings', label: t('Configurações', 'Settings'), icon: <SettingsIcon size={20} /> },
    { id: 'ai_key', label: t('Chave da IA', 'AI Key'), icon: <KeyRound size={20} /> },
    { id: 'trash', label: t('Armazenamento e Lixeira', 'Storage & Trash'), icon: <HardDrive size={20} /> },
  ];

  const goBack = () => setActiveDrawerPage('menu');

  return (
    <div className="fixed inset-0 z-[120]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute left-0 top-0 bottom-0 w-[340px] max-w-[92vw] bg-[var(--bg-card)] border-r border-[var(--border-card)] p-5 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            {activeDrawerPage !== 'menu' && (
              <button
                onClick={goBack}
                className="p-2 -ml-2 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                aria-label={t('Voltar', 'Back')}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h2 className="text-lg font-bold text-[var(--text-primary)] truncate">{pageTitles[activeDrawerPage]}</h2>
          </div>
          {activeDrawerPage === 'menu' && (
            <button onClick={onClose} className="p-2 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" aria-label={t('Fechar', 'Close')}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">

  
          {activeDrawerPage === 'menu' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl">
                <div className="w-12 h-12 shrink-0 rounded-2xl border border-[var(--border-card)] overflow-hidden">
                  {photoURL && <img src={photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{displayName}</h3>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{email}</p>
                </div>
              </div>

              <nav className="space-y-1">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveDrawerPage(item.id)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-[var(--text-secondary)] hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)] transition-all"
                  >
                    <span className="relative">
                      {item.icon}
                      {item.badge && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-[var(--accent)] rounded-full" />}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest text-left">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          )}

          {activeDrawerPage === 'profile' && (
            <ProfileSection
              profile={profile}
              language={language}
              onSave={onSaveProfile}
              onDone={goBack}
            />
          )}

          {activeDrawerPage === 'notifications' && (
            <NotificationsSection notifications={notifications} language={language} />
          )}

          {activeDrawerPage === 'settings' && (
            <>
              {visualSettings && onChangeVisualSettings && (
                <div className="p-4">
                  <CardSettingsPanel settings={visualSettings} onChange={onChangeVisualSettings} />
                </div>
              )}
              <Suspense fallback={<LoadingSpinner />}>
                <HeritageSettings
                  onClose={goBack}
                  userId={userId}
                  currentConfig={currentConfig}
                  language={settingsLanguage}
                  chartFilter={chartFilter}
                  onChartFilterChange={onChartFilterChange}
                />
              </Suspense>
            </>
          )}

          {activeDrawerPage === 'ai_key' && (
            <AiKeySection
              apiKey={apiKey}
              error={apiKeyError}
              language={language}
              onClearError={onClearApiKeyError}
              onSave={onSaveApiKey}
            />
          )}

          {activeDrawerPage === 'trash' && (
            <Suspense fallback={<LoadingSpinner />}>
              <StorageTrashView user={user} language={language} embedded />
            </Suspense>
          )}
        </div>

        <div className="pt-4 mt-4 border-t border-[var(--border-card)]">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full flex items-center gap-4 p-4 rounded-2xl text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-all font-bold uppercase tracking-widest text-xs"
          >
            <LogOut size={20} />
            {t('Sair da Conta', 'Log Out')}
          </button>
        </div>
      </motion.aside>
    </div>
  );
}

export default ProfileDrawer;
