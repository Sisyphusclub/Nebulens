import { Button } from '@/components/ui/button';
import type { RecentCreation } from '@/utils/recentCreations';
import { thumbnailUrl } from '@/utils/thumbnail';

export function LandingRecentCreations({
  creations,
  onOpen,
}: {
  creations: readonly RecentCreation[];
  onOpen: (creation: RecentCreation) => void;
}) {
  if (creations.length === 0) return null;
  return (
    <nav className="landing-recent" aria-label="继续上次创作">
      <span className="landing-recent__label">继续创作</span>
      {creations.map((creation) => (
        <Button
          key={creation.key}
          type="button"
          variant="ghost"
          className="landing-recent__item"
          aria-label={`继续创作：${creation.title}`}
          onClick={() => onOpen(creation)}
        >
          <img src={thumbnailUrl(creation.imageUrl, 320)} alt="" decoding="async" />
          <span>{creation.title}</span>
        </Button>
      ))}
    </nav>
  );
}
