import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { LANDING_SKILLS, type LandingSkill } from '@/data/landingSkills';

/**
 * Two ways to create under the greeting: generate from a prompt, which is this page, or
 * the Agent's canvas, where a conversation lays its pictures out on a board.
 */
export function LandingModeSwitch() {
  return (
    <div className="home-mode-switch" role="group" aria-label="创作方式">
      <span className="home-mode-switch__item" aria-current="page">
        生成
      </span>
      <Link className="home-mode-switch__item" to="/agent">
        画布
      </Link>
    </div>
  );
}

/**
 * One row of "/skill" chips under the composer; each puts its skill into the composer.
 * The chips scroll sideways and the link to every template stays at the end of the row.
 */
export function LandingSkillChips({ onSelect }: { onSelect: (skill: LandingSkill) => void }) {
  return (
    <nav className="home-skill-chips" aria-label="快捷技能">
      <div className="home-skill-chips__list">
        {LANDING_SKILLS.map((skill) => (
          <Button
            key={skill.id}
            type="button"
            variant="ghost"
            className="home-skill-chips__chip"
            title={skill.description}
            onClick={() => onSelect(skill)}
          >
            <span aria-hidden="true">/</span>
            {skill.label}
          </Button>
        ))}
      </div>
      <Link className="home-skill-chips__chip home-skill-chips__chip--more" to="/templates">
        更多模板
        <ChevronRight aria-hidden="true" />
      </Link>
    </nav>
  );
}
