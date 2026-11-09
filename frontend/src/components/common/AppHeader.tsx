import { useState } from 'react';

import { LandingAccountActions } from '@/components/landing/LandingAccountActions';
import { ImageApiKeySettingsDialog } from '@/components/settings/ImageApiKeySettingsDialog';
import { useToast } from '@/components/common/ToastProvider';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useImageApiKey } from '@/hooks/useImageApiKey';

export function AppHeader() {
  const { user, isAuthenticated, logout } = useAuth();
  const { quota, checkIn } = useImageQuota();
  const imageApiKey = useImageApiKey();
  const { notify } = useToast();
  const [imageApiKeySettingsOpen, setImageApiKeySettingsOpen] = useState(false);
  const accountName = user?.username ?? user?.name ?? '账户';

  return (
    <>
      <LandingAccountActions
        accountImage={user?.image}
        accountName={accountName}
        checkedInToday={quota?.checkedInToday ?? false}
        creditsRemaining={quota?.remaining ?? '—'}
        dailyCheckInReward={quota?.dailyCheckInReward ?? 5}
        isAuthenticated={isAuthenticated}
        imageApiKeyConfigured={imageApiKey.status?.configured === true}
        imageApiKeySuffix={imageApiKey.status?.keySuffix}
        onCheckIn={checkIn}
        onLogin={openAuthModal}
        onLogout={logout}
        onOpenImageApiKeySettings={() => setImageApiKeySettingsOpen(true)}
        onNotify={notify}
      />
      <ImageApiKeySettingsDialog
        open={imageApiKeySettingsOpen}
        onClose={() => setImageApiKeySettingsOpen(false)}
      />
    </>
  );
}
