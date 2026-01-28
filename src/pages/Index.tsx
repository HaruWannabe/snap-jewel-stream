import { useState } from 'react';
import { CameraView } from '@/components/CameraView';
import { SettingsView } from '@/components/SettingsView';
import { InstallPrompt } from '@/components/InstallPrompt';

const Index = () => {
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return <SettingsView onBack={() => setShowSettings(false)} />;
  }

  return (
    <>
      <CameraView onOpenSettings={() => setShowSettings(true)} />
      <InstallPrompt />
    </>
  );
};

export default Index;
