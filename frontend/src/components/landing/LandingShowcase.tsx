import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { buildApiUrl } from '@/services/api/imagesApi';
import { IMAGE_CATEGORY_LABELS, type TeamImageRecord } from '@/types/image';
import { thumbnailUrl } from '@/utils/thumbnail';

/**
 * The team's newest shared work under the skills, so the library comes to people
 * instead of waiting to be browsed. Picking a piece fills the composer with it.
 * Shares the skill cards' look so the two rows read as one gallery.
 */
export function LandingShowcase({
  records,
  onUse,
}: {
  records: readonly TeamImageRecord[];
  onUse: (record: TeamImageRecord) => void;
}) {
  if (records.length === 0) return null;
  return (
    <section className="landing-skills landing-showcase" aria-label="成果库精选">
      <header className="landing-skills__header landing-showcase__header">
        <div>
          <h2>成果库精选</h2>
          <p>团队最近共享的作品，看中哪张就一键做同款。</p>
        </div>
        <Link className="landing-showcase__more" to="/team">
          查看全部
          <ArrowRight aria-hidden="true" />
        </Link>
      </header>
      <div className="landing-skills__grid">
        {records.map((record) => (
          <Button
            key={record.id}
            type="button"
            variant="ghost"
            className="landing-skills__card"
            aria-label={`做同款：${record.prompt}`}
            onClick={() => onUse(record)}
          >
            <img
              src={thumbnailUrl(buildApiUrl(`/api/outputs/${record.id}`), 640)}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span className="landing-skills__body">
              <span className="landing-skills__description landing-showcase__prompt">
                {record.prompt}
              </span>
              <span className="landing-showcase__meta">
                {[
                  record.ownerName,
                  ...(record.category ? [IMAGE_CATEGORY_LABELS[record.category]] : []),
                ].join(' · ')}
              </span>
            </span>
            <span className="landing-skills__cta" aria-hidden="true">
              做同款
              <ArrowUpRight />
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
