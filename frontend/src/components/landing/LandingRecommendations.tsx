import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildApiUrl } from '@/services/api/imagesApi';
import type { TeamRecommendation } from '@/types/image';

/** Teammates' work similar to the need being typed, so good results get reused. */
export function LandingRecommendations({
  recommendations,
  onOpen,
  onUsePrompt,
  onDismiss,
  className,
}: {
  recommendations: readonly TeamRecommendation[];
  onOpen: (recommendation: TeamRecommendation) => void;
  onUsePrompt: (recommendation: TeamRecommendation) => void;
  /** Shows a close button; the generate page uses it so the panel never blocks writing. */
  onDismiss?: () => void;
  className?: string;
}) {
  if (recommendations.length === 0) return null;
  return (
    <section className={cn('landing-recommendations', className)} aria-label="成果库里相似的作品">
      <div className="landing-recommendations__header">
        <p className="landing-recommendations__label">成果库里相似的作品</p>
        {onDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="landing-recommendations__close"
            aria-label="关闭成果库推荐"
            onClick={onDismiss}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="landing-recommendations__list">
        {recommendations.map((recommendation) => (
          <article className="landing-recommendations__item" key={recommendation.record.id}>
            <Button
              type="button"
              variant="ghost"
              className="landing-recommendations__preview"
              aria-label={`查看图片：${recommendation.record.prompt}`}
              onClick={() => onOpen(recommendation)}
            >
              <img
                src={buildApiUrl(`/api/outputs/${recommendation.record.id}`)}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </Button>
            <div className="landing-recommendations__meta">
              <span className="landing-recommendations__prompt">
                {recommendation.record.prompt}
              </span>
              <span className="landing-recommendations__reason">{recommendation.reason}</span>
              <span className="landing-recommendations__owner">{recommendation.ownerName}</span>
              <Button
                type="button"
                variant="ghost"
                size="compact"
                className="landing-recommendations__use"
                onClick={() => onUsePrompt(recommendation)}
              >
                用这个提示词
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
