 import { useState, useEffect, useCallback } from 'react';
 import { X, Share, PlusSquare, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

 interface BeforeInstallPromptEvent extends Event {
   prompt: () => Promise<void>;
   userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
 }
 
export function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
   const [isAndroid, setIsAndroid] = useState(false);
   const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check if already installed or dismissed
    const dismissed = localStorage.getItem('install-prompt-dismissed');
    if (dismissed) return;

    // Check if running as standalone PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Check if iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
     const isAndroidDevice = /android/.test(userAgent);
    
    setIsIOS(isIOSDevice);
     setIsAndroid(isAndroidDevice);
    
     // iOS Safari: show manual instructions
    if (isIOSDevice && isSafari) {
      setTimeout(() => setShowPrompt(true), 2000);
    }
 
     // Android/Desktop: listen for beforeinstallprompt
     const handleBeforeInstall = (e: Event) => {
       e.preventDefault();
       setDeferredPrompt(e as BeforeInstallPromptEvent);
       setTimeout(() => setShowPrompt(true), 2000);
     };
 
     window.addEventListener('beforeinstallprompt', handleBeforeInstall);
 
     return () => {
       window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
     };
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('install-prompt-dismissed', 'true');
  };

   const handleInstallClick = useCallback(async () => {
     if (!deferredPrompt) return;
     
     await deferredPrompt.prompt();
     const { outcome } = await deferredPrompt.userChoice;
     
     if (outcome === 'accepted') {
       setShowPrompt(false);
       localStorage.setItem('install-prompt-dismissed', 'true');
     }
     setDeferredPrompt(null);
   }, [deferredPrompt]);
 
  if (!showPrompt) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-safe">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold">Install App</h3>
          <Button variant="ghost" size="icon" onClick={handleDismiss} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {isIOS ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Install this app on your iPhone for the best experience:</p>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-muted rounded-lg">
                <Share className="h-4 w-4" />
              </span>
              <span>Tap the <strong>Share</strong> button below</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-muted rounded-lg">
                <PlusSquare className="h-4 w-4" />
              </span>
              <span>Select <strong>Add to Home Screen</strong></span>
            </div>
          </div>
         ) : deferredPrompt ? (
           <div className="space-y-3">
             <p className="text-sm text-muted-foreground">
               Install this app on your {isAndroid ? 'Android device' : 'device'} for the best experience:
             </p>
             <Button onClick={handleInstallClick} className="w-full gap-2">
               <Download className="h-4 w-4" />
               Install App
             </Button>
           </div>
        ) : (
           <div className="space-y-3 text-sm text-muted-foreground">
             <p>Install this app on your {isAndroid ? 'Android' : 'device'} for the best experience:</p>
             <div className="flex items-center gap-2">
               <span className="flex items-center justify-center w-8 h-8 bg-muted rounded-lg">
                 <Download className="h-4 w-4" />
               </span>
               <span>Tap the browser menu (⋮) and select <strong>Install app</strong> or <strong>Add to Home Screen</strong></span>
             </div>
           </div>
        )}
      </div>
    </div>
  );
}
