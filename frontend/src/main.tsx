import '@fontsource-variable/geist';
import '@fontsource-variable/oxanium';
import '@fontsource-variable/noto-serif-sc';
import '@/styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from '@/App';
import { ToastProvider } from '@/components/common/ToastProvider';
import { MorphicTooltipProvider } from '@/components/premium/morphic-tooltip';
import { AuthProvider } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { registerUnauthorizedHandler } from '@/services/api/imagesApi';
import { reloadForNewBuild } from '@/utils/staleBuild';

registerUnauthorizedHandler(openAuthModal);

// Vite reports a page file that failed to preload, as after a new release; reload to get it.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewBuild()) event.preventDefault();
});

const root = document.getElementById('app');
if (!root) throw new Error('找不到应用挂载节点。');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MorphicTooltipProvider
          delay={140}
          className="!rounded-sm !border-white/15 !bg-black !text-white !shadow-none"
        >
          <ToastProvider>
            <App />
          </ToastProvider>
        </MorphicTooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
