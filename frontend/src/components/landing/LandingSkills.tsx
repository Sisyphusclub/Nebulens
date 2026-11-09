import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { EVERYDAY_SKILLS, type LandingSkill } from '@/data/landingSkills';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { templateThumbnailUrl } from '@/utils/thumbnail';

/**
 * The row right under the composer: a large banner on the left, then the everyday skills
 * as tool cards, two rows that scroll sideways. Arrows page through them for a mouse, which
 * cannot scroll sideways on its own. It all sits in the first screen, so the images load
 * right away.
 */
export function LandingSkillDeck({
  feature,
  onSelect,
}: {
  feature?: ReactNode;
  onSelect: (skill: LandingSkill) => void;
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const scroller = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  useEffect(() => {
    const element = scroller.current;
    if (element === null) return undefined;
    const update = (): void => {
      const back = element.scrollLeft > 4;
      const forward = element.scrollLeft + element.clientWidth < element.scrollWidth - 4;
      setCanScroll((current) =>
        current.back === back && current.forward === forward ? current : { back, forward },
      );
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  const page = (direction: 1 | -1): void => {
    const element = scroller.current;
    if (element === null) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="home-tools">
      {feature}
      <section className="landing-deck" aria-label="技能">
        <div ref={scroller} className="landing-deck__scroller">
          <div className="landing-deck__grid">
            {EVERYDAY_SKILLS.map((skill) => (
              <Button
                key={skill.id}
                type="button"
                variant="ghost"
                className="landing-deck__tile"
                aria-label={`使用技能：${skill.label}`}
                onClick={() => onSelect(skill)}
              >
                {/* Skills that borrow a template's example load its card-sized copy. */}
                <img src={templateThumbnailUrl(skill.image)} alt="" decoding="async" />
                <span className="landing-deck__tile-text">
                  <span className="landing-deck__tile-title">{skill.label}</span>
                  <span className="landing-deck__tile-description">{skill.tagline}</span>
                </span>
              </Button>
            ))}
          </div>
        </div>
        {canScroll.back ? (
          <Button
            type="button"
            variant="ghost"
            className="landing-deck__arrow landing-deck__arrow--back"
            aria-label="上一组技能"
            onClick={() => page(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
        ) : null}
        {canScroll.forward ? (
          <Button
            type="button"
            variant="ghost"
            className="landing-deck__arrow landing-deck__arrow--forward"
            aria-label="下一组技能"
            onClick={() => page(1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        ) : null}
      </section>
    </div>
  );
}
