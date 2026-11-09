import { useLocation } from 'react-router-dom';

import { LoginModal } from '@/components/auth/LoginModal';
import { AppErrorBoundary } from '@/components/common/AppErrorBoundary';
import { AppHeader } from '@/components/common/AppHeader';
import { AppSidebar } from '@/components/common/AppSidebar';
import { useImageDetailModalState } from '@/hooks/useImageDetailModalState';
import { useWorkbenchSidebarExpanded } from '@/hooks/useWorkbenchSidebar';
import { cn } from '@/lib/utils';
import { AppRoutes } from '@/router';

export function App() {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const isGenerate = location.pathname === '/generate';
  const { isImageDetailModalOpen } = useImageDetailModalState();
  const sidebarExpanded = useWorkbenchSidebarExpanded();
  return (
    <div
      className={cn(
        'app-shell',
        isLanding && 'app-shell--landing',
        isGenerate && 'app-shell--generate',
      )}
      data-sidebar-rail={sidebarExpanded ? 'expanded' : 'collapsed'}
    >
      <AppSidebar />
      {!isLanding && !isGenerate && !isImageDetailModalOpen ? <AppHeader /> : null}
      <main
        className={cn(
          'app-main',
          isLanding && 'app-main--landing',
          isGenerate && 'app-main--generate',
        )}
        aria-label={isLanding ? 'Nebulens 首页' : 'Nebulens 工作区'}
      >
        <div className={cn('app-workspace', !isLanding && 'app-workspace--studio')}>
          {/* Keyed by route, so moving to another page clears a crash on this one. */}
          <AppErrorBoundary key={location.pathname}>
            <AppRoutes />
          </AppErrorBoundary>
        </div>
      </main>
      <LoginModal />
    </div>
  );
}
