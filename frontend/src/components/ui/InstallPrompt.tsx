'use client';

import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt(): Promise<void>;
  }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      const dismissed = localStorage.getItem('pwa_install_dismissed');
      if (!dismissed) setShowPrompt(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const dismissed = localStorage.getItem('pwa_install_dismissed');
      if (!dismissed) setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setIsDismissed(true);
    localStorage.setItem('pwa_install_dismissed', 'true');
  };

  if (!showPrompt || isDismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 animate-in rounded-xl border border-violet-100 bg-white p-4 shadow-lg shadow-violet-200/20">
      <button onClick={handleDismiss} className="absolute right-2 top-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100">
          <Download className="h-5 w-5 text-violet-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">Install Sonic Coffee OS</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {isIOS
              ? 'Tap the Share button and select "Add to Home Screen"'
              : 'Install this app on your device for a better experience'}
          </p>
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 transition-colors"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
