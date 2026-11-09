import { ArrowRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { TEMPLATE_SHORTCUT_CATEGORIES, type CreationTemplate } from '@/data/creationTemplates';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { RecentCreation } from '@/utils/recentCreations';
import { templateThumbnailUrl, thumbnailUrl } from '@/utils/thumbnail';

/** How long each slide stays before the next one, unless the pointer or focus is on it. */
const SLIDE_INTERVAL_MS = 5000;
/** Categories that get a slide of their own after the templates slide. */
const CATEGORY_SLIDES = 3;

interface LandingFeatureBannerProps {
  /** The latest creation to resume; when there is one, it is the first slide. */
  recent: RecentCreation | undefined;
  /** Covers for the template slides, picked by category. */
  templates: readonly CreationTemplate[];
  templateCount: number;
  onOpenRecent: (creation: RecentCreation) => void;
}

interface Slide {
  key: string;
  image: string | undefined;
  eyebrow: string;
  title: string;
  description?: string;
  cta: string;
  render: (content: ReactNode, active: boolean) => ReactNode;
}

function categoryHref(category: string): string {
  return `/templates?${new URLSearchParams({ category }).toString()}`;
}

/**
 * The large banner that leads the tool cards: resume the last creation, then the
 * templates and a few template categories, one slide at a time.
 */
export function LandingFeatureBanner({
  recent,
  templates,
  templateCount,
  onOpenRecent,
}: LandingFeatureBannerProps) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slides: Slide[] = [];
  if (recent !== undefined) {
    slides.push({
      key: 'recent',
      image: thumbnailUrl(recent.imageUrl, 640),
      eyebrow: '继续上次创作',
      title: recent.title,
      cta: '继续创作',
      render: (content, active) => (
        <nav className="landing-feature__slide-frame" aria-label="继续上次创作">
          <Button
            type="button"
            variant="ghost"
            className="landing-feature__card"
            aria-label={`继续创作：${recent.title}`}
            tabIndex={active ? undefined : -1}
            onClick={() => onOpenRecent(recent)}
          >
            {content}
          </Button>
        </nav>
      ),
    });
  }
  slides.push({
    key: 'templates',
    image: templates[0] === undefined ? undefined : templateThumbnailUrl(templates[0].imageUrl),
    eyebrow: '创作模板',
    title: '从一张好作品开始',
    description: `${templateCount} 套精选模板，选中即可做同款`,
    cta: '浏览模板',
    render: (content, active) => (
      <Link
        className="landing-feature__card"
        to="/templates"
        aria-label="浏览创作模板"
        tabIndex={active ? undefined : -1}
      >
        {content}
      </Link>
    ),
  });
  for (const category of TEMPLATE_SHORTCUT_CATEGORIES.slice(0, CATEGORY_SLIDES)) {
    const cover = templates.find((template) => template.category === category);
    if (cover === undefined) continue;
    slides.push({
      key: category,
      image: templateThumbnailUrl(cover.imageUrl),
      eyebrow: '模板分类',
      title: category,
      description: `挑一套${category}模板，换上你的内容`,
      cta: '去看看',
      render: (content, active) => (
        <Link
          className="landing-feature__card"
          to={categoryHref(category)}
          aria-label={`浏览模板分类：${category}`}
          tabIndex={active ? undefined : -1}
        >
          {content}
        </Link>
      ),
    });
  }

  const count = slides.length;
  const current = index % count;
  useEffect(() => {
    if (reducedMotion || paused || count < 2) return undefined;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % count),
      SLIDE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [count, paused, reducedMotion]);

  return (
    <section
      className="landing-feature"
      aria-roledescription="carousel"
      aria-label="推荐"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((slide, slideIndex) => {
        const active = slideIndex === current;
        const content = (
          <>
            {slide.image === undefined ? null : <img src={slide.image} alt="" decoding="async" />}
            <span className="landing-feature__text">
              <span className="landing-feature__eyebrow">{slide.eyebrow}</span>
              <span className="landing-feature__title">{slide.title}</span>
              {slide.description === undefined ? null : (
                <span className="landing-feature__description">{slide.description}</span>
              )}
              <span className="landing-feature__cta">
                {slide.cta}
                <ArrowRight aria-hidden="true" />
              </span>
            </span>
          </>
        );
        return (
          <div
            key={slide.key}
            className="landing-feature__slide"
            data-active={active}
            aria-hidden={active ? undefined : true}
            aria-roledescription="slide"
          >
            {slide.render(content, active)}
          </div>
        );
      })}
      {count > 1 ? (
        <div className="landing-feature__dots" role="group" aria-label="切换推荐">
          {slides.map((slide, slideIndex) => (
            <Button
              key={slide.key}
              type="button"
              variant="ghost"
              className="landing-feature__dot"
              aria-label={`第 ${slideIndex + 1} 张：${slide.title}`}
              aria-pressed={slideIndex === current}
              onClick={() => setIndex(slideIndex)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
