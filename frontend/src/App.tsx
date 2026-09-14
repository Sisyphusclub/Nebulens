import { useLocation } from 'react-router-dom';

import { LoginModal } from '@/components/auth/LoginModal';
import { AppHeader } from '@/components/common/AppHeader';
import { useImageDetailModalState } from '@/hooks/useImageDetailModalState';
import { cn } from '@/lib/utils';
import { AppRoutes } from '@/router';

export function App() {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const isGenerate = location.pathname === '/generate';
  const isAssets = location.pathname === '/history';
  const { isImageDetailModalOpen } = useImageDetailModalState();
  return (
    <div
      className={cn(
        'app-shell',
        isLanding && 'app-shell--landing',
        isGenerate && 'app-shell--generate',
        isAssets && 'app-shell--assets',
      )}
    >
      {!isLanding && !isGenerate && !isImageDetailModalOpen ? <AppHeader /> : null}
      <main
        className={cn(
          'app-main',
          isLanding && 'app-main--landing',
          isGenerate && 'app-main--generate',
          isAssets && 'app-main--assets',
        )}
        aria-label={isLanding ? 'Nebulens 首页' : 'Nebulens 工作区'}
      >
        <div
          className={cn(
            'app-workspace',
            !isLanding && 'app-workspace--studio',
            isAssets && 'app-workspace--assets',
          )}
        >
          <AppRoutes />
        </div>
      </main>
      <LoginModal />
    </div>
  );
}
