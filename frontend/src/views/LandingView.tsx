import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

import { LiquidGlassFrame } from '@/components/common/LiquidGlassFrame';
import { GenerationSubmitCost } from '@/components/generation/GenerationSubmitCost';
import { LandingArtworkWall } from '@/components/landing/LandingArtworkWall';
import { LandingSidebar } from '@/components/landing/LandingSidebar';
import { LandingGenerationControls } from '@/components/landing/LandingGenerationControls';
import { LandingAccountActions } from '@/components/landing/LandingAccountActions';
import { ImageDetailModal } from '@/components/gallery/ImageDetailModal';
import { AiInsightBar } from '@/components/generation/AiInsightBar';
import { LandingRecentCreations } from '@/components/landing/LandingRecentCreations';
import { LandingRecommendations } from '@/components/landing/LandingRecommendations';
import { LandingSkillCapsules, LandingSkillGallery } from '@/components/landing/LandingSkills';
import { ImageApiKeySettingsDialog } from '@/components/settings/ImageApiKeySettingsDialog';
import { useToast } from '@/components/common/ToastProvider';
import { AgentChatInput } from '@/components/premium/agent-chat-input/agent-chat-input';
import type { AgentChatAttachment } from '@/components/premium/agent-chat-input/types';
import { IMAGE_PROMPT_EXAMPLES } from '@/data/imagePromptExamples';
import type { LandingSkill } from '@/data/landingSkills';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useImageApiKey } from '@/hooks/useImageApiKey';
import { attachGenerationBatch, useGenerationSessions } from '@/hooks/useGenerationSessions';
import { useImageHistory } from '@/hooks/useImageHistory';
import { usePromptEnhancer } from '@/hooks/usePromptEnhancer';
import { useTeamRecommendations } from '@/hooks/useTeamRecommendations';
import { buildApiUrl } from '@/services/api/imagesApi';
import { getAppNavigation } from '@/config/navigation';
import type {
  AspectChoice,
  HistoryEntry,
  ImageModel,
  ImageQuality,
  ImageResolution,
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

const HERO_SHINY_GRADIENT_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(110deg, #3D81E3, 20%, #AE9AE6, 40%, #F8D8D5, 60%, #FEEFDB, 80%, #3D81E3)',
  backgroundSize: '200% auto',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
};
export function LandingView() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading, isAdmin, logout } = useAuth();
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
  const { items: recommendations } = useTeamRecommendations(prompt, isAuthenticated);
  const promptEnhancer = usePromptEnhancer({ prompt, setPrompt, isAuthenticated, notify });
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
  const accountName = user?.username ?? user?.name ?? '账户';
  const providerPending = authLoading || (isAuthenticated && imageApiKey.isLoading);
  const quotaPending = isAuthenticated && quotaLoading;
  const quotaLabel = providerPending
    ? '调用方式同步中'
    : imageApiKey.status?.configured === true
      ? '个人 Key'
      : quotaPending
        ? '额度同步中'
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
  const selectSkill = (skill: LandingSkill): void => {
    setPrompt(skill.prompt);
    setAspect(normalizeAspectChoiceForResolution(skill.aspect, resolution));
    if (skill.referenceHint) notify(skill.referenceHint);
    // Skills picked from the gallery below the fold bring the filled composer back into view.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const submitPrompt = (
    value: string,
    selectedAttachments: readonly AgentChatAttachment[],
  ): void => {
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
        <LandingArtworkWall />
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
          <h1 id="landing-title" aria-label="Turn your idea into images">
            <span className="landing-hero__headline-main">Turn your idea</span>
            <em className="animate-shiny" style={HERO_SHINY_GRADIENT_STYLE}>
              into images
            </em>
          </h1>
          <p>用 GPT-IMAGE-2 将你的创意变为精美图片，只需描述你脑海中的画面。</p>
          <div className="landing-composer-anchor">
            <div className="landing-composer-presentation landing-composer-hero">
              <LiquidGlassFrame className="landing-composer-content">
                <AgentChatInput
                  value={prompt}
                  onValueChange={setPrompt}
                  onSubmit={({ text, attachments: selectedAttachments }) =>
                    submitPrompt(text, selectedAttachments)
                  }
                  skills={[]}
                  models={[]}
                  defaultModel="gpt-image-2"
                  agents={[]}
                  reasoningLevels={[]}
                  speedModes={[]}
                  streamingPlaceholders={IMAGE_PROMPT_EXAMPLES}
                  placeholder="描述你想生成的画面..."
                  ariaLabel="首页创作提示词"
                  submitLabel="带着提示词开始创作"
                  submitContent={
                    <GenerationSubmitCost count={count} model={model} resolution={resolution} />
                  }
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
          {recommendations.length > 0 ? (
            <LandingRecommendations
              recommendations={recommendations}
              onOpen={setSelectedRecommendation}
              onUsePrompt={applyRecommendedPrompt}
            />
          ) : (
            <>
              <LandingSkillCapsules onSelect={selectSkill} />
              <LandingRecentCreations creations={recent} onOpen={openRecent} />
            </>
          )}
        </div>
      </section>
      <LandingSkillGallery onSelect={selectSkill} />
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
