import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useToast } from '@/components/common/ToastProvider';
import { LandingSidebar } from '@/components/landing/LandingSidebar';
import { ImageApiKeySettingsDialog } from '@/components/settings/ImageApiKeySettingsDialog';
import { getAppNavigation } from '@/config/navigation';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { useImageApiKey } from '@/hooks/useImageApiKey';
import { useImageQuota } from '@/hooks/useImageQuota';

/** The one workbench sidebar shared by every page, so its state survives navigation. */
export function AppSidebar() {
  const location = useLocation();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { quota, checkIn } = useImageQuota();
  const imageApiKey = useImageApiKey();
  const { notify } = useToast();
  const [imageApiKeySettingsOpen, setImageApiKeySettingsOpen] = useState(false);
  const isLanding = location.pathname === '/';

  return (
    <>
      <LandingSidebar
        accountImage={user?.image}
        accountName={user?.username ?? user?.name ?? '账户'}
        brandLabel="贝尔灵画"
        creditsRemaining={quota?.remaining ?? '—'}
        ctaLabel={isLanding ? (isAuthenticated ? '进入工作台' : '开始创作') : '返回发现'}
        ctaTo={isLanding ? '/generate' : '/'}
        checkedInToday={quota?.checkedInToday ?? false}
        dailyCheckInReward={quota?.dailyCheckInReward ?? 5}
        isAuthenticated={isAuthenticated}
        imageApiKeyConfigured={imageApiKey.status?.configured === true}
        items={getAppNavigation(isAdmin)}
        logoSrc="/brand/logo.png"
        onCheckIn={checkIn}
        onLogin={openAuthModal}
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
