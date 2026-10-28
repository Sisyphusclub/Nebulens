import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

import { GenerationSubmitCost } from '@/components/generation/GenerationSubmitCost';
import { LandingArtworkWall } from '@/components/landing/LandingArtworkWall';
import { LandingSidebar } from '@/components/landing/LandingSidebar';
import { LandingGenerationControls } from '@/components/landing/LandingGenerationControls';
import { LandingAccountActions } from '@/components/landing/LandingAccountActions';
import { ImageApiKeySettingsDialog } from '@/components/settings/ImageApiKeySettingsDialog';
import { useToast } from '@/components/common/ToastProvider';
import { AgentChatInput } from '@/components/premium/agent-chat-input/agent-chat-input';
import type { AgentChatAttachment } from '@/components/premium/agent-chat-input/types';
import { IMAGE_PROMPT_EXAMPLES } from '@/data/imagePromptExamples';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useImageApiKey } from '@/hooks/useImageApiKey';
import { getAppNavigation } from '@/config/navigation';
import type { AspectChoice, ImageModel, ImageQuality, ImageResolution } from '@/types/image';
import {
  DEFAULT_ASPECT_CHOICE,
  DEFAULT_COUNT,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_RESOLUTION,
  MAX_REFERENCE_IMAGES,
  normalizeAspectChoiceForResolution,
  supportsImageQuality,
} from '@/types/image';

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
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AgentChatAttachment[]>([]);
  const [model, setModel] = useState<ImageModel>(DEFAULT_IMAGE_MODEL);
  const [aspect, setAspect] = useState<AspectChoice>(DEFAULT_ASPECT_CHOICE);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [resolution, setResolution] = useState<ImageResolution>(DEFAULT_IMAGE_RESOLUTION);
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
              <div className="landing-composer-content">
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
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
