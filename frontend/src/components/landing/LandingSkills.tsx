import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { LANDING_SKILLS, type LandingSkill } from '@/data/landingSkills';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const FEATURE_INTERVAL_MS = 5000;

/**
 * Every skill across the full width right under the composer, after Kling and Jimeng:
 * a feature card that rotates through the skills' examples, beside a compact tile for
 * each skill. Rotation stops while the feature is hovered or focused, and for people
 * who prefer reduced motion.
 */
export function LandingSkillDeck({ onSelect }: { onSelect: (skill: LandingSkill) => void }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [featured, setFeatured] = useState(0);
  const [paused, setPaused] = useState(false);
  const feature = LANDING_SKILLS[featured] ?? LANDING_SKILLS[0]!;

  useEffect(() => {
    if (reducedMotion || paused) return undefined;
    const timer = window.setInterval(
      () => setFeatured((current) => (current + 1) % LANDING_SKILLS.length),
      FEATURE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  return (
    <section className="landing-deck" aria-label="技能">
      <div className="landing-deck__grid">
        <div
          className="landing-deck__feature"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {LANDING_SKILLS.map((skill, index) => (
            <img
              key={skill.id}
              className="landing-deck__feature-image"
              src={skill.image}
              alt=""
              data-active={index === featured}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          ))}
          <div className="landing-deck__feature-body">
            <span className="landing-deck__eyebrow">精选技能</span>
            <strong className="landing-deck__feature-title">{feature.label}</strong>
            <span className="landing-deck__feature-description">{feature.description}</span>
            <Button
              type="button"
              className="landing-deck__feature-cta"
              aria-label={`立即使用：${feature.label}`}
              onClick={() => onSelect(feature)}
            >
              立即使用
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
          <div className="landing-deck__dots" role="group" aria-label="切换推荐技能">
            {LANDING_SKILLS.map((skill, index) => (
              <Button
                key={skill.id}
                type="button"
                variant="ghost"
                className="landing-deck__dot"
                aria-label={`推荐：${skill.label}`}
                aria-pressed={index === featured}
                onClick={() => setFeatured(index)}
              />
            ))}
          </div>
        </div>
        {LANDING_SKILLS.map((skill) => {
          const Icon = skill.icon;
          return (
            <Button
              key={skill.id}
              type="button"
              variant="ghost"
              className="landing-deck__tile"
              aria-label={`使用技能：${skill.label}`}
              onClick={() => onSelect(skill)}
            >
              <span className="landing-deck__tile-text">
                <span className="landing-deck__tile-title">
                  <Icon aria-hidden="true" />
                  {skill.label}
                </span>
                <span className="landing-deck__tile-description">{skill.description}</span>
              </span>
              <img src={skill.image} alt="" loading="lazy" decoding="async" />
            </Button>
          );
        })}
      </div>
    </section>
  );
}
