import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '../lib/utils';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type PWAInstallContextValue = {
  canInstall: boolean;
  installApp: () => Promise<void>;
};

const PWAInstallContext = createContext<PWAInstallContextValue>({
  canInstall: false,
  installApp: async () => {}
});

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
};

export const PWAInstallProvider = ({ children }: { children: ReactNode }) => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setInstalled(false);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
    }
    setInstallEvent(null);
  };

  const value = useMemo(() => ({
    canInstall: Boolean(installEvent) && !installed,
    installApp
  }), [installEvent, installed]);

  return (
    <PWAInstallContext.Provider value={value}>
      {children}
    </PWAInstallContext.Provider>
  );
};

export const usePWAInstall = () => useContext(PWAInstallContext);

export const InstallShravionButton = ({ className = '' }: { className?: string }) => {
  const { canInstall, installApp } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={installApp}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full border border-blue-300/25 bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_42px_rgba(37,99,235,0.35)] transition-all hover:-translate-y-0.5 hover:bg-blue-500',
        className
      )}
    >
      <Download className="h-4 w-4" />
      Install ShravionOS
    </button>
  );
};

export const LandingInstallMessage = () => {
  const { canInstall, installApp } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <div className="mt-5 flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-slate-300 shadow-[0_16px_55px_rgba(15,23,42,0.28)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/12 text-blue-300 ring-1 ring-blue-300/15">
          <Download className="h-4 w-4" />
        </div>
        <p className="leading-6">Install ShravionOS on your device for a better experience.</p>
      </div>
      <button
        type="button"
        onClick={installApp}
        className="shrink-0 rounded-full border border-blue-300/20 bg-blue-500/12 px-4 py-2 text-xs font-bold text-blue-100 transition hover:border-blue-200/35 hover:bg-blue-500/20"
      >
        Install App
      </button>
    </div>
  );
};
