import { LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LiquidGlassFrame } from '@/components/common/LiquidGlassFrame';
import { GenerationSubmitCost } from '@/components/generation/GenerationSubmitCost';
import { LandingHeroBackdrop } from '@/components/landing/LandingHeroBackdrop';
import { LandingSidebar } from '@/components/landing/LandingSidebar';
import { LandingGenerationControls } from '@/components/landing/LandingGenerationControls';
import { LandingAccountActions } from '@/components/landing/LandingAccountActions';
import { ImageDetailModal } from '@/components/gallery/ImageDetailModal';
import { AiInsightBar } from '@/components/generation/AiInsightBar';
import { LandingRecentCreations } from '@/components/landing/LandingRecentCreations';
import { LandingRecommendations } from '@/components/landing/LandingRecommendations';
import { LandingShowcase } from '@/components/landing/LandingShowcase';
import { LandingSkillBar } from '@/components/landing/LandingSkillBar';
import { LandingTemplateShortcuts } from '@/components/landing/LandingTemplateShortcuts';
import { LandingSkillDeck } from '@/components/landing/LandingSkills';
import { ImageApiKeySettingsDialog } from '@/components/settings/ImageApiKeySettingsDialog';
import { useToast } from '@/components/common/ToastProvider';
import { AgentChatInput } from '@/components/premium/agent-chat-input/agent-chat-input';
import type {
  AgentChatAttachment,
  AgentChatSkill,
} from '@/components/premium/agent-chat-input/types';
import { templatesAcrossCategories, type CreationTemplate } from '@/data/creationTemplates';
import { IMAGE_PROMPT_EXAMPLES } from '@/data/imagePromptExamples';
import { LANDING_SKILLS, type LandingSkill } from '@/data/landingSkills';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useImageApiKey } from '@/hooks/useImageApiKey';
import { attachGenerationBatch, useGenerationSessions } from '@/hooks/useGenerationSessions';
import { useImageHistory } from '@/hooks/useImageHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePromptEnhancer } from '@/hooks/usePromptEnhancer';
import { useTeamRecommendations } from '@/hooks/useTeamRecommendations';
import { useTeamShowcase } from '@/hooks/useTeamShowcase';
import { buildApiUrl, uploadReferenceImages } from '@/services/api/imagesApi';
import { fetchSkillForms, planSkill } from '@/services/api/skillsApi';
import { getAppNavigation } from '@/config/navigation';
import type {
  AspectChoice,
  GenerationSettingsSnapshot,
  HistoryEntry,
  ImageModel,
  ImageQuality,
  ImageResolution,
  TeamImageRecord,
  TeamRecommendation,
} from '@/types/image';
import {
  DEFAULT_ASPECT_CHOICE,
  DEFAULT_COUNT,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_RESOLUTION,
  imageGenerationCreditCost,
  MAX_REFERENCE_IMAGES,
  normalizeAspectChoiceForResolution,
  supportsImageQuality,
} from '@/types/image';
import type { SkillForm } from '@/types/skill';
import { resolveAspectChoice } from '@/utils/imageAspect';
import { recentCreations, type RecentCreation } from '@/utils/recentCreations';
import { expectsRecentCreations, rememberRecentCreations } from '@/utils/recentSlot';
import type { SkillRunRequest } from '@/utils/skillRun';

/** Templates that top up the inspiration feed when the team has shared little. */
const INSPIRATION_TEMPLATES = templatesAcrossCategories(24);

/** Skills offered in the composer's + menu and after typing "/". */
const COMPOSER_SKILLS: AgentChatSkill[] = LANDING_SKILLS.map((skill) => {
  const Icon = skill.icon;
  return {
    id: skill.id,
    label: skill.label,
    description: skill.tagline,
    icon: <Icon aria-hidden="true" />,
  };
});

/** The skill whose "/name" pill is in the composer; while there is one, it is in skill mode. */
function skillInPrompt(prompt: string): LandingSkill | undefined {
  return LANDING_SKILLS.find((skill) => prompt.includes(`/${skill.label}`));
}

/** The composer text without skill pills: in skill mode, the brief the server reads. */
function withoutSkills(prompt: string): string {
  return LANDING_SKILLS.reduce((text, skill) => text.replaceAll(`/${skill.label}`, ''), prompt)
    .replace(/\s+/gu, ' ')
    .trim();
}

export function LandingView() {
  const navigate = useNavigate();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { user, isAuthenticated, isLoading: authLoading, isAdmin, logout } = useAuth();
  const { quota, isLoading: quotaLoading, checkIn } = useImageQuota();
  const imageApiKey = useImageApiKey();
  const { notify } = useToast();
  const { batches: historyBatches, isHydrated: historyHydrated } = useImageHistory();
  const { sessions, create: createSession } = useGenerationSessions();
  const [selectedRecommendation, setSelectedRecommendation] = useState<TeamRecommendation | null>(
    null,
  );
  const selectedRecommendationEntry = useMemo<HistoryEntry | null>(
    () =>
      selectedRecommendation === null
        ? null
        : {
            record: selectedRecommendation.record,
            imageUrl: buildApiUrl(`/api/outputs/${selectedRecommendation.record.id}`),
          },
    [selectedRecommendation],
  );
  const recent = useMemo(
    () => recentCreations(historyBatches, sessions),
    [historyBatches, sessions],
  );
  const [reserveRecentRow] = useState(expectsRecentCreations);
  // Once the account and its history are known, remember whether there was anything to continue.
  useEffect(() => {
    if (authLoading || (isAuthenticated && !historyHydrated)) return;
    rememberRecentCreations(recent.length > 0);
  }, [authLoading, historyHydrated, isAuthenticated, recent.length]);
  const [prompt, setPrompt] = useState('');
  const activeSkill = skillInPrompt(prompt);
  const { items: recommendations } = useTeamRecommendations(
    activeSkill === undefined ? prompt : '',
    isAuthenticated,
  );
  const promptEnhancer = usePromptEnhancer({ prompt, setPrompt, isAuthenticated, notify });
  const showcase = useTeamShowcase(isAuthenticated);
  const [attachments, setAttachments] = useState<AgentChatAttachment[]>([]);
  const [model, setModel] = useState<ImageModel>(DEFAULT_IMAGE_MODEL);
  const [aspect, setAspect] = useState<AspectChoice>(DEFAULT_ASPECT_CHOICE);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [resolution, setResolution] = useState<ImageResolution>(DEFAULT_IMAGE_RESOLUTION);
  /** 2K runs on a 2K/4K key, or on regular quota when enough credits remain for one image. */
  const canUse2k =
    imageApiKey.status?.highResConfigured === true ||
    (quota?.remaining ?? 0) >= imageGenerationCreditCost('2k', model);
  const [quality, setQuality] = useState<ImageQuality>(DEFAULT_IMAGE_QUALITY);
  const [imageApiKeySettingsOpen, setImageApiKeySettingsOpen] = useState(false);
  const [skillForms, setSkillForms] = useState<SkillForm[] | null>(null);
  const [skillFormsError, setSkillFormsError] = useState<string | null>(null);
  const [skillChoices, setSkillChoices] = useState<Record<string, string>>({});
  const [planningSkill, setPlanningSkill] = useState(false);
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
  const accountName = user?.username ?? user?.name ?? '账户';
  const providerPending = authLoading || (isAuthenticated && imageApiKey.isLoading);
  const quotaPending = isAuthenticated && quotaLoading;
  // While it syncs the label keeps its shape, rather than flicking through status words.
  const quotaLabel = providerPending
    ? '额度 —/—'
    : imageApiKey.status?.configured === true
      ? '个人 Key'
      : quotaPending
        ? '额度 —/—'
        : isAuthenticated
          ? `额度 ${quota?.remaining ?? '—'}/${quota?.total ?? '—'}`
          : '登录查额度';
  const quotaAriaLabel = providerPending
    ? '生图调用方式同步中'
    : imageApiKey.status?.configured === true
      ? '当前使用个人 API Key'
      : quotaPending
        ? '生成额度同步中'
        : isAuthenticated
          ? `剩余额度 ${quota?.remaining ?? '未知'}，总额度 ${quota?.total ?? '未知'}`
          : '登录后查看生成额度';
  const updateAttachments = (next: AgentChatAttachment[]): void => {
    if (next.length > MAX_REFERENCE_IMAGES) {
      notify(
        `参考图最多支持 ${MAX_REFERENCE_IMAGES} 张，已保留前 ${MAX_REFERENCE_IMAGES} 张。`,
        'error',
      );
    }
    setAttachments(next.slice(0, MAX_REFERENCE_IMAGES));
  };
  const updateResolution = (next: ImageResolution): void => {
    setResolution(next);
    setAspect((current) => normalizeAspectChoiceForResolution(current, next));
  };
  const openRecent = (creation: RecentCreation): void => {
    let sessionId = creation.sessionId;
    if (sessionId === null) {
      sessionId = createSession(creation.batch.prompt).id;
      attachGenerationBatch(sessionId, creation.batch.batchId, creation.batch.prompt);
    }
    void navigate(`/generate?${new URLSearchParams({ session: sessionId }).toString()}`);
  };
  const applyRecommendedPrompt = (recommendation: TeamRecommendation): void => {
    setPrompt(recommendation.record.prompt);
    if (recommendation.record.aspectRatio !== undefined) {
      setAspect(normalizeAspectChoiceForResolution(recommendation.record.aspectRatio, resolution));
    }
    setSelectedRecommendation(null);
  };
  /** Puts the skill's pill in front of whatever is typed, like picking it from the + menu. */
  const selectSkill = (skill: LandingSkill): void => {
    setPrompt(`/${skill.label} ${withoutSkills(prompt)}`);
    // Skills picked below the fold bring the composer back into view.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const exitSkill = (): void => setPrompt(withoutSkills(prompt));
  /**
   * Uploads the skill's image once, has the server read the brief and plan a prompt per
   * output, and opens the generate page in a new session that makes them one by one.
   */
  const runSkill = async (
    skill: LandingSkill,
    brief: string,
    selectedAttachments: readonly AgentChatAttachment[],
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
    const referenceFile =
      selectedAttachments.find((attachment) => attachment.file !== undefined)?.file ?? null;
    if (form.reference === 'required' && referenceFile === null) {
      notify(`请先上传${form.referenceLabel ?? '参考图'}。`, 'error');
      return;
    }
    const required = form.fields.find((field) => field.required && field.kind !== 'choice');
    if (required !== undefined && brief.length === 0) {
      notify(`请在描述里写上${required.label}。`, 'error');
      return;
    }
    setPlanningSkill(true);
    try {
      await planAndStartSkill(skill, form, brief, referenceFile);
    } catch (err) {
      notify(err instanceof Error ? err.message : '技能启动失败，请稍后重试。', 'error');
    } finally {
      setPlanningSkill(false);
    }
  };
  const planAndStartSkill = async (
    skill: LandingSkill,
    form: SkillForm,
    brief: string,
    referenceFile: File | null,
  ): Promise<void> => {
    const referenceFiles = referenceFile === null ? [] : [referenceFile];
    const referenceIds = (await uploadReferenceImages(referenceFiles)).map((upload) => upload.id);
    const plan = await planSkill(form.id, {
      brief,
      values: skillChoices,
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
    const session = createSession(plan.title);
    const skillRun: SkillRunRequest = { skillLabel: skill.label, steps };
    void navigate(`/generate?${new URLSearchParams({ session: session.id }).toString()}`, {
      state: { skillRun },
    });
  };
  /** A teammate's reference images stay theirs, so only the prompt and framing carry over. */
  const makeSimilar = (record: TeamImageRecord): void => {
    setPrompt(record.prompt);
    if (record.aspectRatio) {
      setAspect(normalizeAspectChoiceForResolution(record.aspectRatio, resolution));
    }
    notify('已填入这张作品的提示词，可以直接生成，或改几个字再生成。');
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const fillTemplatePrompt = (template: CreationTemplate): void => {
    setPrompt(template.prompt);
    setAspect(normalizeAspectChoiceForResolution(template.settings.aspectRatio, resolution));
    notify('已填入这个模板的提示词，可以直接生成，或改几个字再生成。');
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const submitPrompt = (
    value: string,
    selectedAttachments: readonly AgentChatAttachment[],
  ): void => {
    const skill = skillInPrompt(value);
    if (skill !== undefined) {
      void runSkill(skill, withoutSkills(value), selectedAttachments);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    const nextSearch = new URLSearchParams({
      prompt: trimmed,
      model,
      aspect,
      count: String(count),
      resolution,
    });
    if (supportsImageQuality(model)) nextSearch.set('quality', quality);
    void navigate(`/generate?${nextSearch.toString()}`, {
      state: {
        autoGenerate: true,
        attachments: selectedAttachments.slice(0, MAX_REFERENCE_IMAGES),
      },
    });
  };

  return (
    <div className="landing-page">
      <section className="landing-hero" data-layout="media-stage" aria-labelledby="landing-title">
        <LandingHeroBackdrop reducedMotion={reducedMotion} />
        <div className="landing-hero__overlay" aria-hidden="true" />
        <LandingSidebar
          accountImage={user?.image}
          accountName={accountName}
          brandLabel="Nebulens"
          creditsRemaining={quota?.remaining ?? '—'}
          ctaLabel={isAuthenticated ? '进入工作台' : '开始创作'}
          ctaTo="/generate"
          checkedInToday={quota?.checkedInToday ?? false}
          dailyCheckInReward={quota?.dailyCheckInReward ?? 5}
          isAuthenticated={isAuthenticated}
          imageApiKeyConfigured={imageApiKey.status?.configured === true}
          items={getAppNavigation(isAdmin)}
          logoSrc="/brand/logo.png"
          onCheckIn={checkIn}
          onLogin={openAuthModal}
          onOpenImageApiKeySettings={() => setImageApiKeySettingsOpen(true)}
          onNotify={notify}
        />
        <LandingAccountActions
          isAuthPending={authLoading}
          accountImage={user?.image}
          accountName={accountName}
          checkedInToday={quota?.checkedInToday ?? false}
          creditsRemaining={quota?.remaining ?? '—'}
          dailyCheckInReward={quota?.dailyCheckInReward ?? 5}
          isAuthenticated={isAuthenticated}
          imageApiKeyConfigured={imageApiKey.status?.configured === true}
          imageApiKeySuffix={imageApiKey.status?.keySuffix}
          onCheckIn={checkIn}
          onLogin={openAuthModal}
          onLogout={logout}
          onOpenImageApiKeySettings={() => setImageApiKeySettingsOpen(true)}
          onNotify={notify}
        />
        <ImageApiKeySettingsDialog
          open={imageApiKeySettingsOpen}
          onClose={() => setImageApiKeySettingsOpen(false)}
        />
        <div className="landing-hero__content">
          <h1 id="landing-title" aria-label="把想法，变成画面">
            <span>把想法，</span>
            <span>变成画面</span>
          </h1>
          <p>
            <span>写下脑海中的画面，AI 替你落笔成图；</span>
            <span>挑一个技能，一次做好整套设计。</span>
          </p>
          <div className="landing-composer-anchor">
            <div className="landing-composer-presentation landing-composer-hero">
              <LiquidGlassFrame className="landing-composer-content">
                <AgentChatInput
                  value={prompt}
                  onValueChange={setPrompt}
                  onSubmit={({ text, attachments: selectedAttachments }) =>
                    submitPrompt(text, selectedAttachments)
                  }
                  header={
                    activeSkill === undefined ? undefined : (
                      <LandingSkillBar
                        skill={activeSkill}
                        form={activeForm}
                        loadError={skillFormsError}
                        choices={skillChoices}
                        showExample={withoutSkills(prompt).length === 0}
                        onChoiceChange={(fieldId, value) =>
                          setSkillChoices((current) => ({ ...current, [fieldId]: value }))
                        }
                        onUseExample={() =>
                          setPrompt(`/${activeSkill.label} ${activeSkill.briefExample}`)
                        }
                        onExit={exitSkill}
                      />
                    )
                  }
                  skills={COMPOSER_SKILLS}
                  models={[]}
                  defaultModel="gpt-image-2"
                  agents={[]}
                  reasoningLevels={[]}
                  speedModes={[]}
                  streamingPlaceholders={IMAGE_PROMPT_EXAMPLES}
                  placeholder="描述你想生成的画面..."
                  ariaLabel="首页创作提示词"
                  submitLabel={
                    activeSkill === undefined
                      ? '带着提示词开始创作'
                      : `用「${activeSkill.label}」开始生成`
                  }
                  submitContent={
                    planningSkill ? (
                      <LoaderCircle aria-hidden="true" className="spin" />
                    ) : (
                      <GenerationSubmitCost
                        count={activeForm?.outputs.length ?? count}
                        model={model}
                        resolution={resolution}
                      />
                    )
                  }
                  disabled={planningSkill}
                  minRows={1}
                  maxRows={4}
                  allowFileUpload
                  attachments={attachments}
                  onAttachmentsChange={updateAttachments}
                  acceptedFileTypes="image/png,image/jpeg,image/webp"
                  toolbarContent={
                    <LandingGenerationControls
                      model={model}
                      aspect={aspect}
                      count={count}
                      resolution={resolution}
                      quality={quality}
                      disabled={authLoading}
                      quotaLabel={quotaLabel}
                      quotaAriaLabel={quotaAriaLabel}
                      quotaIsAction={!authLoading && !isAuthenticated}
                      onModelChange={setModel}
                      onAspectChange={setAspect}
                      onCountChange={setCount}
                      onResolutionChange={updateResolution}
                      onQualityChange={setQuality}
                      onQuotaClick={openAuthModal}
                    />
                  }
                  className="generation-composer landing-composer"
                />
              </LiquidGlassFrame>
            </div>
          </div>
          {activeSkill === undefined && prompt.trim() === '' ? <LandingTemplateShortcuts /> : null}
          {activeSkill === undefined ? (
            <AiInsightBar
              prompt={prompt}
              resolution={resolution}
              canUse2k={canUse2k}
              similarCount={recommendations.length}
              onUse2k={() => updateResolution('2k')}
              enhance={{
                enhancing: promptEnhancer.enhancing,
                canUndo: promptEnhancer.canUndo,
                onEnhance: () => void promptEnhancer.enhance(),
                onUndo: promptEnhancer.undo,
              }}
            />
          ) : null}
          <div
            className="landing-hero__secondary"
            data-reserve={reserveRecentRow ? 'true' : undefined}
          >
            {recommendations.length > 0 ? (
              <LandingRecommendations
                recommendations={recommendations}
                onOpen={setSelectedRecommendation}
                onUsePrompt={applyRecommendedPrompt}
              />
            ) : (
              <LandingRecentCreations creations={recent} onOpen={openRecent} />
            )}
          </div>
        </div>
      </section>
      <LandingSkillDeck onSelect={selectSkill} />
      <LandingShowcase
        records={showcase}
        templates={INSPIRATION_TEMPLATES}
        onUse={makeSimilar}
        onUseTemplate={fillTemplatePrompt}
      />
      <ImageDetailModal
        entry={selectedRecommendationEntry}
        {...(selectedRecommendation === null
          ? {}
          : { ownerName: selectedRecommendation.ownerName })}
        onClose={() => setSelectedRecommendation(null)}
        onReuse={() => {
          if (selectedRecommendation !== null) applyRecommendedPrompt(selectedRecommendation);
        }}
      />
    </div>
  );
}
