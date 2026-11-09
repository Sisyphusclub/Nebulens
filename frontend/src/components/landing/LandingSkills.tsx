import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { EVERYDAY_SKILLS, type LandingSkill } from '@/data/landingSkills';

/**
 * The everyday skills across the full width right under the composer: a large feature card
 * on the left, then a tile with its example for each skill. It all sits in the first
 * screen, so the images load right away.
 */
export function LandingSkillDeck({
  feature,
  onSelect,
}: {
  feature?: ReactNode;
  onSelect: (skill: LandingSkill) => void;
}) {
  return (
    <section className="landing-deck" aria-label="技能">
      <div className="landing-deck__grid">
        {feature}
        {EVERYDAY_SKILLS.map((skill) => {
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
              <img src={skill.image} alt="" decoding="async" />
              <span className="landing-deck__tile-text">
                <span className="landing-deck__tile-title">
                  <Icon aria-hidden="true" />
                  {skill.label}
                </span>
                <span className="landing-deck__tile-description">{skill.tagline}</span>
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
