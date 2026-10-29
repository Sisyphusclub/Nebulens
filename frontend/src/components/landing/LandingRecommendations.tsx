import { Button } from '@/components/ui/button';
import { buildApiUrl } from '@/services/api/imagesApi';
import type { TeamRecommendation } from '@/types/image';

/** Teammates' work similar to the need being typed, so good results get reused. */
export function LandingRecommendations({
  recommendations,
  onOpen,
  onUsePrompt,
}: {
  recommendations: readonly TeamRecommendation[];
  onOpen: (recommendation: TeamRecommendation) => void;
  onUsePrompt: (recommendation: TeamRecommendation) => void;
}) {
  if (recommendations.length === 0) return null;
  return (
    <section className="landing-recommendations" aria-label="团队里相似的成果">
      <p className="landing-recommendations__label">团队里相似的成果</p>
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
