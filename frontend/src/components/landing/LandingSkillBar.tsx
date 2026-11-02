import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { SelectMenu } from '@/components/ui/select-menu';
import type { LandingSkill } from '@/data/landingSkills';
import type { SkillForm } from '@/types/skill';

/**
 * Heads the composer while a skill is picked, on the input's own surface so it stays
 * readable over the video: what the skill makes, its options, and an example to start from.
 */
export function LandingSkillBar({
  skill,
  form,
  loadError,
  choices,
  showExample,
  onChoiceChange,
  onUseExample,
  onExit,
}: {
  skill: LandingSkill;
  /** Undefined while the skill's form is loading or when it failed to load. */
  form: SkillForm | undefined;
  loadError: string | null;
  choices: Readonly<Record<string, string>>;
  /** Only offered until something is written. */
  showExample: boolean;
  onChoiceChange: (fieldId: string, value: string) => void;
  onUseExample: () => void;
  onExit: () => void;
}) {
  const Icon = skill.icon;
  const reference =
    form === undefined || form.reference === 'none'
      ? null
      : // The label's note in brackets is for an upload slot; here the name is enough.
        `${form.reference === 'required' ? '需附' : '可附'}${(form.referenceLabel ?? '参考图').replace(/（.*）$/u, '')}`;

  return (
    <div className="landing-skill-card" role="group" aria-label={`技能：${skill.label}`}>
      <img className="landing-skill-card__image" src={skill.image} alt="" decoding="async" />
      <div className="landing-skill-card__body">
        <div className="landing-skill-card__title">
          <Icon aria-hidden="true" />
          <strong>{skill.label}</strong>
          <span>{skill.description}</span>
        </div>
        {form === undefined ? (
          <span className="landing-skill-card__status" role="status">
            {loadError ?? '正在加载技能…'}
          </span>
        ) : (
          <div className="landing-skill-card__options">
            <span className="landing-skill-card__outputs" aria-label="将生成">
              {form.outputs.map((output) => (
                <span key={output.id}>{output.label}</span>
              ))}
            </span>
            {form.fields.map((field) =>
              field.kind === 'choice' ? (
                <SelectMenu
                  key={field.id}
                  label={field.label}
                  value={choices[field.id] ?? field.defaultValue}
                  options={field.options.map((option) => ({ value: option, label: option }))}
                  className="landing-skill-card__choice"
                  contentClassName="generation-control-panel"
                  onValueChange={(value) => onChoiceChange(field.id, value)}
                />
              ) : null,
            )}
            {reference ? <span className="landing-skill-card__reference">{reference}</span> : null}
          </div>
        )}
        {showExample ? (
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className="landing-skill-card__example"
            onClick={onUseExample}
          >
            试试：{skill.briefExample}
          </Button>
        ) : null}
      </div>
      <IconTooltip label="退出技能">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="landing-skill-card__exit"
          aria-label={`退出技能：${skill.label}`}
          onClick={onExit}
        >
          <X aria-hidden="true" />
        </Button>
      </IconTooltip>
    </div>
  );
}
