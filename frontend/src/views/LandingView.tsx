import { LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LiquidGlassFrame } from '@/components/common/LiquidGlassFrame';
import { GenerationSubmitCost } from '@/components/generation/GenerationSubmitCost';
import { GenerationComposerControls } from '@/components/generation/GenerationComposerControls';
import { LandingHeroBackdrop } from '@/components/landing/LandingHeroBackdrop';
import { LandingAccountActions } from '@/components/landing/LandingAccountActions';
import { ImageDetailModal } from '@/components/gallery/ImageDetailModal';
import { AiInsightBar } from '@/components/generation/AiInsightBar';
import { LandingFeatureBanner } from '@/components/landing/LandingFeatureBanner';
import { LandingQuota } from '@/components/landing/LandingQuota';
import { LandingRecommendations } from '@/components/landing/LandingRecommendations';
import { LandingShowcase } from '@/components/landing/LandingShowcase';
import { LandingSkillBar } from '@/components/landing/LandingSkillBar';
import { LandingModeSwitch, LandingSkillChips } from '@/components/landing/LandingSkillChips';
import { LandingSkillDeck } from '@/components/landing/LandingSkills';
import { ImageApiKeySettingsDialog } from '@/components/settings/ImageApiKeySettingsDialog';
import { useToast } from '@/components/common/ToastProvider';
import { AgentChatInput } from '@/components/premium/agent-chat-input/agent-chat-input';
import type { AgentChatAttachment } from '@/components/premium/agent-chat-input/types';
import {
  CREATION_TEMPLATES,
  templatesAcrossCategories,
  type CreationTemplate,
} from '@/data/creationTemplates';
import {
  AGENT_PLACEHOLDER,
  AGENT_PROMPT_EXAMPLES,
  COMPOSER_MODES,
  COMPOSER_SKILLS,
  type ComposerModeId,
  findLandingSkill,
  LIBRARY_SKILLS,
  skillInPrompt,
  VIDEO_COMING_SOON,
  withoutSkills,
} from '@/data/composerSkills';
import { IMAGE_PROMPT_EXAMPLES } from '@/data/imagePromptExamples';
import type { LandingSkill } from '@/data/landingSkills';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { useComposerSkills } from '@/hooks/useComposerSkills';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useImageApiKey } from '@/hooks/useImageApiKey';
import { attachGenerationBatch, useGenerationSessions } from '@/hooks/useGenerationSessions';
import { useImageHistory } from '@/hooks/useImageHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePromptDraft } from '@/hooks/usePromptDraft';
import { usePromptEnhancer } from '@/hooks/usePromptEnhancer';
import { useTeamRecommendations } from '@/hooks/useTeamRecommendations';
import { useTeamShowcase } from '@/hooks/useTeamShowcase';
import { buildApiUrl } from '@/services/api/imagesApi';
import type {
  AspectChoice,
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
import { recentCreations, type RecentCreation } from '@/utils/recentCreations';

/** Covers for the banner's template slides, one from each category. */
const INSPIRATION_TEMPLATES = templatesAcrossCategories(24);

export function LandingView() {
  const navigate = useNavigate();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { quota, isLoading: quotaLoading, checkIn } = useImageQuota();
  const imageApiKey = useImageApiKey();
  const { notify } = useToast();
  const { batches: historyBatches } = useImageHistory();
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
  const [prompt, setPrompt] = useState('');
  const { clear: clearPromptDraft } = usePromptDraft(
    authLoading ? null : `landing:${(isAuthenticated ? user?.id : null) ?? 'guest'}`,
    prompt,
    setPrompt,
  );
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
  const [mode, setMode] = useState<ComposerModeId>('image');
  const composerSkills = useComposerSkills({
    prompt,
    setPrompt,
    isAuthenticated,
    notify,
    model,
    resolution,
    quality,
    // The run opens in a new session on the generate page, which makes the images one by one.
    onPlanned: (title, skillRun) => {
      const session = createSession(title);
      clearPromptDraft();
      void navigate(`/generate?${new URLSearchParams({ session: session.id }).toString()}`, {
        state: { skillRun },
      });
    },
  });
  const { activeForm, skillFormsError, skillChoices, planning: planningSkill } = composerSkills;
  const agentMode = mode === 'agent' && activeSkill === undefined;
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
    composerSkills.selectSkill(skill);
    // Skills picked below the fold bring the composer back into view.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const changeMode = (next: string): void => {
    if (next === 'video') {
      notify(VIDEO_COMING_SOON);
      return;
    }
    if (next === 'agent' || next === 'image') setMode(next);
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
      void composerSkills.runSkill(skill, withoutSkills(value), selectedAttachments);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    if (mode === 'agent') {
      void composerSkills.runAgent(trimmed, selectedAttachments);
      return;
    }
    generatePlain(trimmed, selectedAttachments);
  };
  const generatePlain = (
    trimmed: string,
    selectedAttachments: readonly AgentChatAttachment[],
  ): void => {
    const nextSearch = new URLSearchParams({
      prompt: trimmed,
      model,
      aspect,
      count: String(count),
      resolution,
    });
    if (supportsImageQuality(model)) nextSearch.set('quality', quality);
    // The prompt travels in the address; the generate page keeps it from here on.
    clearPromptDraft();
    void navigate(`/generate?${nextSearch.toString()}`, {
      state: {
        autoGenerate: true,
        attachments: selectedAttachments.slice(0, MAX_REFERENCE_IMAGES),
      },
    });
  };

  return (
    <div className="home-page">
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
      <section className="home-hero" aria-labelledby="landing-title">
        <div className="home-backdrop" aria-hidden="true">
          <LandingHeroBackdrop reducedMotion={reducedMotion} />
          <div className="home-backdrop__overlay" />
        </div>
        {/* Each clause stays whole, so a narrow screen breaks the line only between them. */}
        <h1 id="landing-title" aria-label="今天，想把什么变成画面？">
          <span>今天，</span>
          <span>想把什么变成画面？</span>
        </h1>
        <LandingModeSwitch />
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
                      onChoiceChange={composerSkills.setSkillChoice}
                      onUseExample={() =>
                        setPrompt(`/${activeSkill.label} ${activeSkill.briefExample}`)
                      }
                      onExit={composerSkills.exitSkill}
                    />
                  )
                }
                skills={COMPOSER_SKILLS}
                models={[]}
                defaultModel="gpt-image-2"
                agents={[]}
                reasoningLevels={[]}
                speedModes={[]}
                streamingPlaceholders={
                  mode === 'agent' ? AGENT_PROMPT_EXAMPLES : IMAGE_PROMPT_EXAMPLES
                }
                placeholder={mode === 'agent' ? AGENT_PLACEHOLDER : '描述你想生成的画面...'}
                ariaLabel="首页创作提示词"
                submitLabel={
                  activeSkill !== undefined
                    ? `用「${activeSkill.label}」开始生成`
                    : agentMode
                      ? '交给 Agent 开始创作'
                      : '带着提示词开始创作'
                }
                submitContent={
                  planningSkill ? (
                    <LoaderCircle aria-hidden="true" className="spin" />
                  ) : agentMode ? undefined : (
                    <GenerationSubmitCost
                      count={activeForm?.outputs.length ?? count}
                      model={model}
                      resolution={resolution}
                    />
                  )
                }
                submitNote={
                  agentMode ? (
                    '按实际用量计费'
                  ) : (
                    <LandingQuota
                      label={quotaLabel}
                      ariaLabel={quotaAriaLabel}
                      isAction={!authLoading && !isAuthenticated}
                      onClick={openAuthModal}
                    />
                  )
                }
                disabled={planningSkill}
                minRows={1}
                maxRows={4}
                allowFileUpload
                attachments={attachments}
                attachmentLimit={MAX_REFERENCE_IMAGES}
                onAttachmentsChange={updateAttachments}
                acceptedFileTypes="image/png,image/jpeg,image/webp"
                modes={COMPOSER_MODES}
                mode={mode}
                onModeChange={changeMode}
                librarySkills={LIBRARY_SKILLS}
                onLibrarySkillSelect={(skillId) => {
                  const skill = findLandingSkill(skillId);
                  if (skill !== undefined) selectSkill(skill);
                }}
                toolbarContent={
                  <GenerationComposerControls
                    model={model}
                    aspect={aspect}
                    count={count}
                    resolution={resolution}
                    quality={quality}
                    disabled={authLoading}
                    planned={mode === 'agent' || activeSkill !== undefined}
                    onModelChange={setModel}
                    onAspectChange={setAspect}
                    onCountChange={setCount}
                    onResolutionChange={updateResolution}
                    onQualityChange={setQuality}
                  />
                }
                className="generation-composer landing-composer"
              />
            </LiquidGlassFrame>
          </div>
        </div>
        {/* The chips start an empty composer; once there is a prompt, the AI strip takes their row. */}
        {activeSkill === undefined && prompt.trim() === '' ? (
          <LandingSkillChips onSelect={selectSkill} />
        ) : null}
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
        {recommendations.length > 0 ? (
          <div className="landing-hero__secondary">
            <LandingRecommendations
              recommendations={recommendations}
              onOpen={setSelectedRecommendation}
              onUsePrompt={applyRecommendedPrompt}
            />
          </div>
        ) : null}
      </section>
      <LandingSkillDeck
        feature={
          <LandingFeatureBanner
            recent={recent[0]}
            templates={INSPIRATION_TEMPLATES}
            templateCount={CREATION_TEMPLATES.length}
            onOpenRecent={openRecent}
          />
        }
        onSelect={selectSkill}
      />
      <LandingShowcase records={showcase} onUse={makeSimilar} onUseTemplate={fillTemplatePrompt} />
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
