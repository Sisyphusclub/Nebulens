import { useEffect, useState } from 'react';

import type { AgentChatAttachment } from '@/components/premium/agent-chat-input/types';
import {
  briefForSkill,
  findLandingSkill,
  skillInPrompt,
  withoutSkills,
} from '@/data/composerSkills';
import type { LandingSkill } from '@/data/landingSkills';
import { openAuthModal } from '@/hooks/useAuthModal';
import { uploadReferenceImages } from '@/services/api/imagesApi';
import { fetchSkillForms, planSkill, selectSkillForBrief } from '@/services/api/skillsApi';
import type {
  GenerationSettingsSnapshot,
  ImageModel,
  ImageQuality,
  ImageResolution,
} from '@/types/image';
import { normalizeAspectChoiceForResolution, supportsImageQuality } from '@/types/image';
import type { SkillForm } from '@/types/skill';
import { resolveAspectChoice } from '@/utils/imageAspect';
import type { SkillRunRequest } from '@/utils/skillRun';

interface UseComposerSkillsOptions {
  prompt: string;
  setPrompt: (prompt: string) => void;
  isAuthenticated: boolean;
  notify: (message: string, tone?: 'success' | 'error') => void;
  /** The page's current choices; every planned image is made with them. */
  model: ImageModel;
  resolution: ImageResolution;
  quality: ImageQuality;
  /** Starts a planned run: the homepage opens it in a new session, the generate page in place. */
  onPlanned: (title: string, request: SkillRunRequest) => void;
}

function firstReferenceFile(attachments: readonly AgentChatAttachment[]): File | null {
  return attachments.find((attachment) => attachment.file !== undefined)?.file ?? null;
}

/**
 * Skill mode and Agent mode for a composer: the skill pill and its choices, and planning a
 * skill's images on the server before they are generated one by one.
 */
export function useComposerSkills({
  prompt,
  setPrompt,
  isAuthenticated,
  notify,
  model,
  resolution,
  quality,
  onPlanned,
}: UseComposerSkillsOptions) {
  const activeSkill = skillInPrompt(prompt);
  const [skillForms, setSkillForms] = useState<SkillForm[] | null>(null);
  const [skillFormsError, setSkillFormsError] = useState<string | null>(null);
  const [skillChoices, setSkillChoices] = useState<Record<string, string>>({});
  const [planning, setPlanning] = useState(false);
  const activeSkillId = activeSkill?.id;
  const activeForm = skillForms?.find((form) => form.id === activeSkillId);

  // Forms load the first time a skill is picked; each skill starts from its default choices.
  useEffect(() => {
    if (activeSkillId === undefined || skillForms !== null) return;
    let cancelled = false;
    fetchSkillForms()
      .then((forms) => {
        if (!cancelled) setSkillForms(forms);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSkillFormsError(err instanceof Error ? err.message : '技能加载失败。');
      });
    return () => {
      cancelled = true;
    };
  }, [activeSkillId, skillForms]);
  useEffect(() => setSkillChoices({}), [activeSkillId]);

  /** Puts the skill's pill in front of whatever is typed, like picking it from the + menu. */
  const selectSkill = (skill: LandingSkill): void => {
    setPrompt(`/${skill.label} ${withoutSkills(prompt)}`);
  };
  const exitSkill = (): void => setPrompt(withoutSkills(prompt));
  const setSkillChoice = (fieldId: string, value: string): void =>
    setSkillChoices((current) => ({ ...current, [fieldId]: value }));

  /** Uploads the skill's image once, has the server plan a prompt per output, and starts it. */
  const planAndStart = async (
    skill: LandingSkill,
    form: SkillForm,
    brief: string,
    referenceFile: File | null,
    choices: Record<string, string>,
  ): Promise<void> => {
    const referenceFiles = referenceFile === null ? [] : [referenceFile];
    const referenceIds = (await uploadReferenceImages(referenceFiles)).map((upload) => upload.id);
    const plan = await planSkill(form.id, {
      brief,
      values: choices,
      hasReference: referenceFile !== null,
    });
    const steps = await Promise.all(
      plan.outputs.map(async (output) => {
        const settings: GenerationSettingsSnapshot = {
          prompt: output.prompt,
          model,
          count: 1,
          aspectRatio: await resolveAspectChoice(
            normalizeAspectChoiceForResolution(output.aspect, resolution),
            referenceFiles,
          ),
          resolution,
          ...(supportsImageQuality(model) ? { quality } : {}),
          isPublic: false,
          referenceIds,
        };
        return { label: output.label, settings };
      }),
    );
    onPlanned(plan.title, { skillLabel: skill.label, steps });
  };

  /** Skill mode: runs the skill in the pill with the brief typed after it. */
  const runSkill = async (
    skill: LandingSkill,
    brief: string,
    attachments: readonly AgentChatAttachment[],
  ): Promise<void> => {
    const form = skillForms?.find((candidate) => candidate.id === skill.id);
    if (form === undefined) {
      notify(skillFormsError ?? '技能还在加载，请稍后再试。', 'error');
      return;
    }
    if (!isAuthenticated) {
      // The composer keeps the pill and the brief, so sending again after signing in works.
      openAuthModal();
      return;
    }
    const referenceFile = firstReferenceFile(attachments);
    if (form.reference === 'required' && referenceFile === null) {
      notify(`请先上传${form.referenceLabel ?? '参考图'}。`, 'error');
      return;
    }
    const required = form.fields.find((field) => field.required && field.kind !== 'choice');
    if (required !== undefined && brief.length === 0) {
      notify(`请在描述里写上${required.label}。`, 'error');
      return;
    }
    setPlanning(true);
    try {
      await planAndStart(skill, form, brief, referenceFile, skillChoices);
    } catch (err) {
      notify(err instanceof Error ? err.message : '技能启动失败，请稍后重试。', 'error');
    } finally {
      setPlanning(false);
    }
  };

  /**
   * Agent mode: the server picks the skill that fits the request, which then runs with its
   * default choices. Resolves false when no skill fits, so the page makes a plain image.
   */
  const runAgent = async (
    brief: string,
    attachments: readonly AgentChatAttachment[],
  ): Promise<boolean> => {
    if (!isAuthenticated) {
      openAuthModal();
      return true;
    }
    const referenceFile = firstReferenceFile(attachments);
    setPlanning(true);
    try {
      const skillId = await selectSkillForBrief(brief, referenceFile !== null);
      const skill = skillId === null ? undefined : findLandingSkill(skillId);
      if (skill === undefined) return false;
      const forms = skillForms ?? (await fetchSkillForms());
      if (skillForms === null) setSkillForms(forms);
      const form = forms.find((candidate) => candidate.id === skill.id);
      if (form === undefined) return false;
      notify(`Agent 选用了「${skill.label}」，正在规划每张图。`);
      await planAndStart(skill, form, briefForSkill(brief, skill), referenceFile, {});
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Agent 暂时无法开始，请稍后重试。', 'error');
      return true;
    } finally {
      setPlanning(false);
    }
  };

  return {
    activeSkill,
    activeForm,
    skillFormsError,
    skillChoices,
    setSkillChoice,
    planning,
    selectSkill,
    exitSkill,
    runSkill,
    runAgent,
  };
}
