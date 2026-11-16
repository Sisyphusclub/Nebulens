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
import {
  fetchSkillForms,
  planFreely,
  planSkill,
  selectSkillForBrief,
} from '@/services/api/skillsApi';
import type {
  GenerationSettingsSnapshot,
  ImageModel,
  ImageQuality,
  ImageResolution,
} from '@/types/image';
import { normalizeAspectChoiceForResolution, supportsImageQuality } from '@/types/image';
import type { SkillForm, SkillPlan } from '@/types/skill';
import { resolveAspectChoice } from '@/utils/imageAspect';
import type { SkillRunRequest } from '@/utils/skillRun';

/** What the Agent is doing, for a page that shows its work instead of toasts. */
export type AgentProgress =
  | { kind: 'selected'; skillLabel: string | null; ms: number }
  | { kind: 'planned'; ms: number }
  | { kind: 'failed'; message: string };

interface UseComposerSkillsOptions {
  prompt: string;
  setPrompt: (prompt: string) => void;
  isAuthenticated: boolean;
  notify: (message: string, tone?: 'success' | 'error') => void;
  /** The page's current choices; every planned image is made with them. */
  model: ImageModel;
  resolution: ImageResolution;
  quality: ImageQuality;
  isShared: boolean;
  /** Starts a planned run: the homepage opens it in a new session, the generate page in place. */
  onPlanned: (title: string, request: SkillRunRequest) => void;
  /**
   * Given, the hook reports each step and failure here instead of in toasts, and an Agent
   * run sends every attached image as a reference rather than the first alone.
   */
  onAgentProgress?: (progress: AgentProgress) => void;
}

function attachedFiles(attachments: readonly AgentChatAttachment[]): File[] {
  return attachments.flatMap((attachment) =>
    attachment.file === undefined ? [] : [attachment.file],
  );
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
  isShared,
  onPlanned,
  onAgentProgress,
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
  const fail = (message: string): void => {
    if (onAgentProgress === undefined) notify(message, 'error');
    else onAgentProgress({ kind: 'failed', message });
  };
  const setSkillChoice = (fieldId: string, value: string): void =>
    setSkillChoices((current) => ({ ...current, [fieldId]: value }));

  /** Makes each planned image with the page's current choices, one by one. */
  const startPlan = async (
    plan: SkillPlan,
    runLabel: string,
    referenceFiles: readonly File[],
    referenceIds: readonly string[],
  ): Promise<void> => {
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
          isShared,
          referenceIds: [...referenceIds],
        };
        return { label: output.label, settings };
      }),
    );
    onPlanned(plan.title, { skillLabel: runLabel, steps });
  };

  /** Uploads the skill's images once, has the server plan a prompt per output, and starts it. */
  const planAndStart = async (
    skill: LandingSkill,
    form: SkillForm,
    brief: string,
    referenceFiles: readonly File[],
    choices: Record<string, string>,
  ): Promise<void> => {
    const referenceIds = (await uploadReferenceImages([...referenceFiles])).map(
      (upload) => upload.id,
    );
    const startedAt = Date.now();
    const plan = await planSkill(form.id, {
      brief,
      values: choices,
      hasReference: referenceFiles.length > 0,
    });
    onAgentProgress?.({ kind: 'planned', ms: Date.now() - startedAt });
    await startPlan(plan, skill.label, referenceFiles, referenceIds);
  };

  /** No skill fits: the text model plans the images, then they are made like a skill's. */
  const planFreelyAndStart = async (
    brief: string,
    referenceFiles: readonly File[],
  ): Promise<void> => {
    // Planning comes first, so a missing text model is reported before anything is uploaded.
    const startedAt = Date.now();
    const plan = await planFreely(brief, referenceFiles.length > 0);
    onAgentProgress?.({ kind: 'planned', ms: Date.now() - startedAt });
    const referenceIds = (await uploadReferenceImages([...referenceFiles])).map(
      (upload) => upload.id,
    );
    await startPlan(plan, plan.title, referenceFiles, referenceIds);
  };

  /** Skill mode: runs the skill in the pill with the brief typed after it. */
  const runSkill = async (
    skill: LandingSkill,
    brief: string,
    attachments: readonly AgentChatAttachment[],
  ): Promise<void> => {
    const form = skillForms?.find((candidate) => candidate.id === skill.id);
    if (form === undefined) {
      fail(skillFormsError ?? '技能还在加载，请稍后再试。');
      return;
    }
    if (!isAuthenticated) {
      // The composer keeps the pill and the brief, so sending again after signing in works.
      openAuthModal();
      return;
    }
    // A skill is written for one image, its own; the rest stay out of it.
    const referenceFiles = attachedFiles(attachments).slice(0, 1);
    if (form.reference === 'required' && referenceFiles.length === 0) {
      fail(`请先上传${form.referenceLabel ?? '参考图'}。`);
      return;
    }
    const required = form.fields.find((field) => field.required && field.kind !== 'choice');
    if (required !== undefined && brief.length === 0) {
      fail(`请在描述里写上${required.label}。`);
      return;
    }
    setPlanning(true);
    try {
      await planAndStart(skill, form, brief, referenceFiles, skillChoices);
    } catch (err) {
      fail(err instanceof Error ? err.message : '技能启动失败，请稍后重试。');
    } finally {
      setPlanning(false);
    }
  };

  /**
   * Agent mode: the server picks the skill that fits the request, which runs with its default
   * choices; when none fits, the text model plans the images itself. A failure, such as no
   * text model, is told plainly instead of quietly making something else.
   */
  const runAgent = async (
    brief: string,
    attachments: readonly AgentChatAttachment[],
  ): Promise<void> => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    const files = attachedFiles(attachments);
    // The composer sends one reference, as it always has; a page showing the Agent's work
    // sends every picture picked for the request.
    const referenceFiles = onAgentProgress === undefined ? files.slice(0, 1) : files;
    setPlanning(true);
    try {
      const startedAt = Date.now();
      const skillId = await selectSkillForBrief(brief, referenceFiles.length > 0);
      const skill = skillId === null ? undefined : findLandingSkill(skillId);
      const forms = skill === undefined ? null : (skillForms ?? (await fetchSkillForms()));
      if (forms !== null && skillForms === null) setSkillForms(forms);
      const form = skill === undefined ? undefined : forms?.find((item) => item.id === skill.id);
      const chosen = skill !== undefined && form !== undefined ? skill : undefined;
      onAgentProgress?.({
        kind: 'selected',
        skillLabel: chosen?.label ?? null,
        ms: Date.now() - startedAt,
      });
      if (chosen !== undefined && form !== undefined) {
        if (onAgentProgress === undefined) {
          notify(`Agent 选用了「${chosen.label}」，正在规划每张图。`);
        }
        await planAndStart(chosen, form, briefForSkill(brief, chosen), referenceFiles, {});
        return;
      }
      await planFreelyAndStart(brief, referenceFiles);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Agent 暂时无法开始，请稍后重试。');
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
