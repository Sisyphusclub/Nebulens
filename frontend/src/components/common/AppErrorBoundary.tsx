import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { isStaleBuildError, reloadForNewBuild } from '@/utils/staleBuild';

interface AppErrorBoundaryState {
  error: Error | null;
}

/** Catches a crashed page so the user gets a way back instead of a blank screen. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  // React itself reports the error; this only recovers from a release replacing the page's files.
  override componentDidCatch(error: Error): void {
    if (isStaleBuildError(error)) reloadForNewBuild();
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="app-error" role="alert">
        <strong>页面出了点问题</strong>
        <p>刷新一下通常就能恢复；如果仍然不行，可以先回到首页。</p>
        <div className="app-error__actions">
          <Button type="button" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">返回首页</Link>
          </Button>
        </div>
      </div>
    );
  }
}
