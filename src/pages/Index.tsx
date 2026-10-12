import { useEffect, useState } from 'react';
import { CameraView } from '@/components/CameraView';
import { SettingsView } from '@/components/SettingsView';
import { ConnectedModeView } from '@/components/ConnectedModeView';
import { InstallPrompt } from '@/components/InstallPrompt';
import { startUploadQueue } from '@/lib/upload-queue';

const Index = () => {
  const [screen, setScreen] = useState<'camera' | 'settings' | 'connected'>('camera');
  const [settingsReturn, setSettingsReturn] = useState<'camera' | 'connected'>('camera');

  useEffect(() => startUploadQueue(), []);

  if (screen === 'settings') {
    return <SettingsView onBack={() => setScreen(settingsReturn)} />;
  }

  return (
    <>
      {screen === 'connected' ? (
        <ConnectedModeView
          onBack={() => setScreen('camera')}
          onOpenSettings={() => {
            setSettingsReturn('connected');
            setScreen('settings');
          }}
        />
      ) : (
        <CameraView
          onOpenSettings={() => {
            setSettingsReturn('camera');
            setScreen('settings');
          }}
          onOpenConnected={() => setScreen('connected')}
        />
      )}
      <InstallPrompt />
    </>
  );
};

export default Index;
