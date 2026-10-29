import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { LANDING_SKILLS, QUICK_SKILL_COUNT, type LandingSkill } from '@/data/landingSkills';

/** The everyday skills, one tap away under the composer. */
export function LandingSkillCapsules({ onSelect }: { onSelect: (skill: LandingSkill) => void }) {
  return (
    <div className="landing-skill-capsules" role="group" aria-label="常用技能">
      {LANDING_SKILLS.slice(0, QUICK_SKILL_COUNT).map((skill) => {
        const Icon = skill.icon;
        return (
          <Button
            key={skill.id}
            type="button"
            variant="ghost"
            className="landing-skill-capsules__item"
            onClick={() => onSelect(skill)}
          >
            <Icon aria-hidden="true" />
            {skill.label}
          </Button>
        );
      })}
    </div>
  );
}

/** Every skill with an example, so people see what the AI can do before they type. */
export function LandingSkillGallery({ onSelect }: { onSelect: (skill: LandingSkill) => void }) {
  return (
    <section className="landing-skills" aria-label="技能">
      <header className="landing-skills__header">
        <h2>技能</h2>
        <p>选一个技能，AI 先帮你搭好提示词和画面比例，改几个字就能出图。</p>
      </header>
      <div className="landing-skills__grid">
        {LANDING_SKILLS.map((skill) => {
          const Icon = skill.icon;
          return (
            <Button
              key={skill.id}
              type="button"
              variant="ghost"
              className="landing-skills__card"
              aria-label={`使用技能：${skill.label}`}
              onClick={() => onSelect(skill)}
            >
              <img src={skill.image} alt="" loading="lazy" decoding="async" />
              <span className="landing-skills__body">
                <span className="landing-skills__title">
                  <Icon aria-hidden="true" />
                  {skill.label}
                </span>
                <span className="landing-skills__description">{skill.description}</span>
              </span>
              <span className="landing-skills__cta" aria-hidden="true">
                立即使用
                <ArrowUpRight />
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
