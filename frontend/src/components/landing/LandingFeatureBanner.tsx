import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import type { CreationTemplate } from '@/data/creationTemplates';
import type { RecentCreation } from '@/utils/recentCreations';
import { templateThumbnailUrl, thumbnailUrl } from '@/utils/thumbnail';

interface LandingFeatureBannerProps {
  /** The latest creation to resume; without one the banner points to the templates. */
  recent: RecentCreation | undefined;
  /** Cover for the templates banner. */
  template: CreationTemplate | undefined;
  templateCount: number;
  onOpenRecent: (creation: RecentCreation) => void;
}

/** The large card that leads the skill deck: resume the last creation, or start from a template. */
export function LandingFeatureBanner({
  recent,
  template,
  templateCount,
  onOpenRecent,
}: LandingFeatureBannerProps) {
  if (recent !== undefined) {
    return (
      <nav className="landing-feature" aria-label="继续上次创作">
        <Button
          type="button"
          variant="ghost"
          className="landing-feature__card"
          aria-label={`继续创作：${recent.title}`}
          onClick={() => onOpenRecent(recent)}
        >
          <img src={thumbnailUrl(recent.imageUrl, 640)} alt="" decoding="async" />
          <span className="landing-feature__text">
            <span className="landing-feature__eyebrow">继续上次创作</span>
            <span className="landing-feature__title">{recent.title}</span>
            <span className="landing-feature__cta">
              继续创作
              <ArrowRight aria-hidden="true" />
            </span>
          </span>
        </Button>
      </nav>
    );
  }
  return (
    <div className="landing-feature">
      <Link className="landing-feature__card" to="/templates" aria-label="浏览创作模板">
        {template === undefined ? null : (
          <img src={templateThumbnailUrl(template.imageUrl)} alt="" decoding="async" />
        )}
        <span className="landing-feature__text">
          <span className="landing-feature__eyebrow">创作模板</span>
          <span className="landing-feature__title">从一张好作品开始</span>
          <span className="landing-feature__description">
            {templateCount} 套精选模板，选中即可做同款
          </span>
          <span className="landing-feature__cta">
            浏览模板
            <ArrowRight aria-hidden="true" />
          </span>
        </span>
      </Link>
    </div>
  );
}
