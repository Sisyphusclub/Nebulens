import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SelectMenu } from '@/components/ui/select-menu';
import type { LandingSkill } from '@/data/landingSkills';
import type { SkillForm } from '@/types/skill';

/**
 * Sits under the composer while a skill is picked: what it will make, its options, and
 * an example of the one line to write. Replaces the AI insight bar in skill mode.
 */
export function LandingSkillBar({
  skill,
  form,
  loadError,
  choices,
  onChoiceChange,
  onExit,
}: {
  skill: LandingSkill;
  /** Undefined while the skill's form is loading or when it failed to load. */
  form: SkillForm | undefined;
  loadError: string | null;
  choices: Readonly<Record<string, string>>;
  onChoiceChange: (fieldId: string, value: string) => void;
  onExit: () => void;
}) {
  const Icon = skill.icon;
  const reference =
    form === undefined || form.reference === 'none'
      ? null
      : // The label's note in brackets is for an upload slot; here the name is enough.
        `${form.reference === 'required' ? '需附' : '可附'}${(form.referenceLabel ?? '参考图').replace(/（.*）$/u, '')}`;

  return (
    <div className="ai-insight landing-skill-bar" role="group" aria-label={`技能：${skill.label}`}>
      <span className="ai-insight__badge">
        <Icon aria-hidden="true" />
        {skill.label}
      </span>
      {form === undefined ? (
        <span className="ai-insight__tip" role="status">
          {loadError ?? '正在加载技能…'}
        </span>
      ) : (
        <>
          <span className="landing-skill-bar__outputs" aria-label="将生成">
            将生成
            {form.outputs.map((output) => (
              <span key={output.id} className="ai-insight__fact">
                {output.label}
              </span>
            ))}
          </span>
          {form.fields.map((field) =>
            field.kind === 'choice' ? (
              <SelectMenu
                key={field.id}
                label={field.label}
                value={choices[field.id] ?? field.defaultValue}
                options={field.options.map((option) => ({ value: option, label: option }))}
                className="landing-skill-bar__choice"
                contentClassName="generation-control-panel"
                onValueChange={(value) => onChoiceChange(field.id, value)}
              />
            ) : null,
          )}
          {reference ? <span className="ai-insight__tip">{reference}</span> : null}
        </>
      )}
      <span className="landing-skill-bar__example">如：{skill.briefExample}</span>
      <Button
        type="button"
        variant="ghost"
        size="compact"
        className="ai-insight__action landing-skill-bar__exit"
        aria-label={`退出技能：${skill.label}`}
        onClick={onExit}
      >
        <X aria-hidden="true" />
        退出技能
      </Button>
    </div>
  );
}
