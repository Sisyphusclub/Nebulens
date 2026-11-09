import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { LANDING_SKILLS, type LandingSkill } from '@/data/landingSkills';

/**
 * Two ways to start under the greeting: write a prompt here, or pick a template. The
 * home page is the first; the templates page is the second.
 */
export function LandingModeSwitch() {
  return (
    <nav className="home-mode-switch" aria-label="创作方式">
      <span className="home-mode-switch__item" aria-current="page">
        生成
      </span>
      <Link className="home-mode-switch__item" to="/templates">
        模板
      </Link>
    </nav>
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
