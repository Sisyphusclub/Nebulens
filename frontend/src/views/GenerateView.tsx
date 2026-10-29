import { ArrowDown, ImagePlus, Sparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { ConfirmActionModal } from '@/components/common/ConfirmActionModal';
import { useToast } from '@/components/common/ToastProvider';
import { GenerationSubmitCost } from '@/components/generation/GenerationSubmitCost';
import { GenerationHistoryFlyout } from '@/components/generation/GenerationHistoryFlyout';
import { GenerationComposerControls } from '@/components/generation/GenerationComposerControls';
import { GenerationBatch } from '@/components/generation/GenerationBatch';
import { TextResolutionHint } from '@/components/generation/TextResolutionHint';
import { ImageDetailModal } from '@/components/gallery/ImageDetailModal';
import { LandingAccountActions } from '@/components/landing/LandingAccountActions';
import { LandingRecommendations } from '@/components/landing/LandingRecommendations';
import { LandingSidebar } from '@/components/landing/LandingSidebar';
import { ImageApiKeySettingsDialog } from '@/components/settings/ImageApiKeySettingsDialog';
import { AgentChatInput } from '@/components/premium/agent-chat-input/agent-chat-input';
import type { AgentChatAttachment } from '@/components/premium/agent-chat-input/types';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { getAppNavigation } from '@/config/navigation';
import { useFileUpload } from '@/hooks/useFileUpload';
import {
  attachGenerationBatch,
  forgetRememberedGenerationSession,
  getRememberedGenerationSession,
  rememberGenerationSession,
  useGenerationSessions,
} from '@/hooks/useGenerationSessions';
import { useImageGeneration } from '@/hooks/useImageGeneration';
import { useImageApiKey } from '@/hooks/useImageApiKey';
import { useImageHistory, type GroupedBatch } from '@/hooks/useImageHistory';
import { useGenerationFeed } from '@/hooks/useGenerationFeed';
import { readReferenceIds, useGenerationSettings } from '@/hooks/useGenerationSettings';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useTeamRecommendations } from '@/hooks/useTeamRecommendations';
import {
  LATEST_BATCH_COMPOSER_GAP,
  useLatestBatchVisibility,
} from '@/hooks/useLatestBatchVisibility';
import { buildApiUrl, fetchOutputBlob } from '@/services/api/imagesApi';
import {
  DEFAULT_IMAGE_RESOLUTION,
  MAX_REFERENCE_IMAGES,
  normalizeAspectChoiceForResolution,
  type GenerationSettingsSnapshot,
  type HistoryEntry,
  type TeamRecommendation,
} from '@/types/image';
import { downloadUrl } from '@/utils/download';
import { buildTextFixPrompt } from '@/utils/textCheck';
import type { FeedItem } from '@/utils/generationFeed';
import { readInitialReferenceFiles, requestsAutoGeneration } from '@/utils/generationRouteState';
import { prefersReducedMotion, scrollToGenerationBatch } from '@/utils/generationScroll';

type DeleteTarget = { kind: 'entry'; entry: HistoryEntry } | { kind: 'batch'; item: FeedItem };

export function GenerateView() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { user, isAuthenticated, isLoading: authLoading, isAdmin, logout } = useAuth();
  const history = useImageHistory();
  const { sessions, create: createSession } = useGenerationSessions();
  const { quota, isLoading: quotaLoading, refresh: refreshQuota, checkIn } = useImageQuota();
  const imageApiKey = useImageApiKey();
  const upload = useFileUpload();
  const { clear: clearUpload, selectFiles: selectUploadFiles } = upload;
  const generation = useImageGeneration();
  const autoGenerationHandled = useRef(false);
  const bareRouteRestoreHandled = useRef(false);
  const [prompt, setPrompt] = useState(searchParams.get('prompt') ?? '');
  /** The prompt the inspiration panel was closed for; it returns once the prompt changes. */
  const [dismissedInspirationFor, setDismissedInspirationFor] = useState<string | null>(null);
  const [selectedInspiration, setSelectedInspiration] = useState<TeamRecommendation | null>(null);
  const {
    model,
    setModel,
    count,
    setCount,
    resolution,
    updateResolution,
    quality,
    setQuality,
    aspect,
    setAspect,
    applySnapshot,
    buildSnapshot,
  } = useGenerationSettings(searchParams);
  const [reusedReferenceIds, setReusedReferenceIds] = useState<string[]>(() =>
    readReferenceIds(searchParams),
  );
  const initialLatestScrollSession = useRef<string | null>(null);
  /** Batch to land on, instead of the latest one, when a history jump opens its session. */
  const sessionEntryFocus = useRef<{ sessionId: string; batchId: string } | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const sessionFeedRef = useRef<HTMLElement>(null);
  const latestBatchRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [hoveredBatchId, setHoveredBatchId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [imageApiKeySettingsOpen, setImageApiKeySettingsOpen] = useState(false);
  const activeSessionId = searchParams.get('session');
  const previousSessionId = useRef<string | null>(activeSessionId);
  const accountName = user?.username ?? user?.name ?? '账户';
  const currentUserId = isAuthenticated ? (user?.id ?? null) : null;
  const { items: inspiration } = useTeamRecommendations(
    prompt,
    isAuthenticated && !generation.isLoading && prompt.trim() !== dismissedInspirationFor,
  );
  const selectedInspirationEntry = useMemo<HistoryEntry | null>(
    () =>
      selectedInspiration === null
        ? null
        : {
            record: selectedInspiration.record,
            imageUrl: buildApiUrl(`/api/outputs/${selectedInspiration.record.id}`),
          },
    [selectedInspiration],
  );
  const applyInspiration = (recommendation: TeamRecommendation): void => {
    setPrompt(recommendation.record.prompt);
    if (recommendation.record.aspectRatio !== undefined) {
      setAspect(normalizeAspectChoiceForResolution(recommendation.record.aspectRatio, resolution));
    }
    setDismissedInspirationFor(recommendation.record.prompt.trim());
    setSelectedInspiration(null);
  };
  const activeImageApiKeyConfigured =
    resolution === DEFAULT_IMAGE_RESOLUTION
      ? imageApiKey.status?.configured === true
      : imageApiKey.status?.highResConfigured === true;
  const activeImageApiKeySuffix =
    resolution === DEFAULT_IMAGE_RESOLUTION
      ? imageApiKey.status?.keySuffix
      : imageApiKey.status?.highResKeySuffix;
  const activeQuotaRemaining =
    resolution === DEFAULT_IMAGE_RESOLUTION
      ? quota?.remaining
      : (quota?.permanentRemaining ?? quota?.remaining);
  const activeQuotaTotal =
    resolution === DEFAULT_IMAGE_RESOLUTION
      ? quota?.total
      : (quota?.permanentTotal ?? quota?.total);
  const {
    feed,
    isFeedSynced,
    setFeed,
    activeHistoryBatchId,
    setActiveHistoryBatchId,
    pendingScrollId,
    performGeneration,
  } = useGenerationFeed({
    activeSessionId,
    searchParams,
    currentUserId,
    sessions,
    createSession,
    historyBatches: history.batches,
    removeHistoryBatch: history.removeBatch,
    generation,
    refreshQuota,
    notify,
    onSessionCreated: (sessionId) => {
      previousSessionId.current = sessionId;
    },
    onItemReplaced: (item) =>
      setSelected((current) =>
        current && item.entries.some((entry) => entry.record.id === current.record.id)
          ? null
          : current,
      ),
    onComposerSubmitted: (submittedPrompt) => {
      setPrompt((current) => (current.trim() === submittedPrompt ? '' : current));
      upload.clear();
      setReusedReferenceIds([]);
    },
  });

  useEffect(() => {
    if (authLoading || currentUserId === null || !activeSessionId) return;
    const session = sessions.find((candidate) => candidate.id === activeSessionId);
    if (!session) return;
    const historyBatchIds = new Set(history.batches.map((batch) => batch.batchId));
    if (session.batchIds.some((batchId) => historyBatchIds.has(batchId))) {
      rememberGenerationSession(currentUserId, activeSessionId);
    }
  }, [activeSessionId, authLoading, currentUserId, history.batches, sessions]);

  useEffect(() => {
    if (!activeSessionId || previousSessionId.current === activeSessionId) return;
    previousSessionId.current = activeSessionId;
    setPrompt(searchParams.get('prompt') ?? '');
    setSelected(null);
    setActiveHistoryBatchId(null);
    clearUpload();
    setReusedReferenceIds([]);
  }, [activeSessionId, clearUpload, searchParams, setActiveHistoryBatchId]);

  useLayoutEffect(() => {
    const pendingId = pendingScrollId.current;
    if (!pendingId) return;
    pendingScrollId.current = null;
    scrollToGenerationBatch(pendingId);
  }, [feed, pendingScrollId]);

  useEffect(() => {
    const queryPrompt = searchParams.get('prompt');
    if (queryPrompt !== null) setPrompt(queryPrompt);
    const queryReferenceIds = readReferenceIds(searchParams);
    if (queryReferenceIds.length) {
      setReusedReferenceIds(queryReferenceIds);
      clearUpload();
    }
  }, [clearUpload, searchParams]);

  const attachments = useMemo<AgentChatAttachment[]>(
    () =>
      upload.selectedFiles.map((item) => ({
        id: item.id,
        name: item.file.name,
        type: item.file.type,
        size: item.file.size,
        file: item.file,
        ...(item.previewUrl ? { url: item.previewUrl } : {}),
      })),
    [upload.selectedFiles],
  );

  const generationHistoryBatches = useMemo(() => {
    const batches = new Map(history.batches.map((batch) => [batch.batchId, batch]));
    feed.forEach((item) => {
      if (!item.error) return;
      batches.set(item.id, {
        batchId: item.id,
        createdAt: item.createdAt,
        prompt: item.settings.prompt,
        model: item.settings.model,
        entries: [],
        settings: item.settings,
        error: item.error,
      });
    });
    return [...batches.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }, [feed, history.batches]);
  const visibleHistoryBatchIds = useMemo(
    () => [...generationHistoryBatches].reverse().map((batch) => batch.batchId),
    [generationHistoryBatches],
  );
  const latestBatch = feed[feed.length - 1];
  const latestBatchVisibilityKey = latestBatch
    ? `${latestBatch.id}:${latestBatch.entries.length}:${latestBatch.error ? 'error' : 'ready'}`
    : null;

  const showJumpToLatest = useLatestBatchVisibility({
    visibilityKey: latestBatchVisibilityKey,
    latestBatchRef,
    composerRef,
    feedRef: sessionFeedRef,
  });

  const regenerateReplacingBatch = (item: FeedItem, promptValue: string): void => {
    const settings: GenerationSettingsSnapshot = {
      ...item.settings,
      prompt: promptValue.trim(),
    };
    if (authLoading) return;
    if (!isAuthenticated) {
      openAuthModal({ onSuccess: () => performGeneration(settings, [], false, item) });
      return;
    }
    void performGeneration(settings, [], false, item);
  };

  const submitCurrent = (promptValue = prompt, initialReferenceFiles?: readonly File[]): void => {
    const files = initialReferenceFiles ?? upload.selectedFiles.map((item) => item.file);
    const generateCurrent = async (): Promise<void> => {
      const settings = await buildSnapshot(promptValue, reusedReferenceIds, files);
      await performGeneration(settings, files, true);
    };
    if (authLoading) return;
    if (!isAuthenticated) {
      openAuthModal({ onSuccess: () => void generateCurrent() });
      return;
    }
    void generateCurrent();
  };
  const submitCurrentRef = useRef(submitCurrent);
  submitCurrentRef.current = submitCurrent;

  useEffect(() => {
    if (authLoading || autoGenerationHandled.current || !requestsAutoGeneration(location.state)) {
      return;
    }

    const initialReferenceFiles = readInitialReferenceFiles(location.state);
    if (initialReferenceFiles.length) selectUploadFiles(initialReferenceFiles);
    autoGenerationHandled.current = true;
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    submitCurrentRef.current(undefined, initialReferenceFiles);
  }, [
    authLoading,
    location.pathname,
    location.search,
    location.state,
    navigate,
    selectUploadFiles,
  ]);

  useEffect(() => {
    if (authLoading) return;
    if (currentUserId === null) {
      bareRouteRestoreHandled.current = false;
      return;
    }
    if (bareRouteRestoreHandled.current) return;
    if (
      activeSessionId ||
      searchParams.toString() !== '' ||
      requestsAutoGeneration(location.state)
    ) {
      bareRouteRestoreHandled.current = true;
      return;
    }
    if (!history.isHydrated) return;
    bareRouteRestoreHandled.current = true;

    const rememberedSessionId = getRememberedGenerationSession(currentUserId);
    const historyBatchIds = new Set(history.batches.map((batch) => batch.batchId));
    const rememberedSession = sessions.find((session) => session.id === rememberedSessionId);
    const rememberedSessionIsRestorable = Boolean(
      rememberedSession &&
      (rememberedSession.transientTasks.length > 0 ||
        rememberedSession.batchIds.some(
          (batchId) => batchId.startsWith('pending-') || historyBatchIds.has(batchId),
        )),
    );
    if (rememberedSessionId && !rememberedSessionIsRestorable) {
      forgetRememberedGenerationSession(currentUserId);
    }

    let restoredSession = rememberedSessionIsRestorable ? rememberedSession : undefined;
    restoredSession ??= sessions.find((session) =>
      session.batchIds.some((batchId) => historyBatchIds.has(batchId)),
    );
    // Only reached when no local session owns any history batch, so every batch collected
    // here is unowned; batches that belong to a session are never copied into another.
    if (!restoredSession && history.batches.length > 0) {
      const recoveredSession = createSession(history.batches[0]?.prompt);
      restoredSession = recoveredSession;
      [...history.batches].reverse().forEach((batch) => {
        attachGenerationBatch(recoveredSession.id, batch.batchId, batch.prompt);
      });
    }
    if (!restoredSession) return;

    rememberGenerationSession(currentUserId, restoredSession.id);
    const nextSearch = new URLSearchParams({ session: restoredSession.id });
    void navigate(`/generate?${nextSearch.toString()}`, { replace: true });
  }, [
    activeSessionId,
    authLoading,
    createSession,
    currentUserId,
    history.batches,
    history.isHydrated,
    location.state,
    navigate,
    searchParams,
    sessions,
  ]);

  const handleAttachments = (next: AgentChatAttachment[]): void => {
    const nextIds = new Set(next.map((item) => item.id));
    upload.selectedFiles.forEach((item) => {
      if (!nextIds.has(item.id)) upload.removeFile(item.id);
    });
    const currentIds = new Set(upload.selectedFiles.map((item) => item.id));
    const added = next.flatMap((item) =>
      item.file && !currentIds.has(item.id) ? [item.file] : [],
    );
    if (added.length) {
      const result = upload.selectFiles(added);
      if (result.skipped) notify(`最多添加 ${MAX_REFERENCE_IMAGES} 张参考图。`, 'error');
      setReusedReferenceIds([]);
    }
  };

  const reuseSettings = (settings: GenerationSettingsSnapshot): void => {
    setPrompt(settings.prompt);
    applySnapshot(settings);
    setReusedReferenceIds([...settings.referenceIds]);
    upload.clear();
    notify('完整设置已恢复。');
  };

  const addAsReference = async (entry: HistoryEntry): Promise<void> => {
    try {
      const blob = await fetchOutputBlob(entry.imageUrl);
      const extension =
        blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
      const file = new File([blob], `reference-${entry.record.id}.${extension}`, {
        type: blob.type || 'image/png',
      });
      const result = upload.selectFile(file);
      if (result.skipped) throw new Error(`参考图已达到 ${MAX_REFERENCE_IMAGES} 张上限。`);
      setReusedReferenceIds([]);
      notify('图片已加入参考图。');
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法添加参考图。', 'error');
    }
  };

  /** Regenerates one image from itself with an edit prompt that rewrites only the wrong text. */
  const fixText = async (item: FeedItem, entry: HistoryEntry): Promise<void> => {
    const check = entry.record.textCheck;
    if (check === undefined) return;
    try {
      const blob = await fetchOutputBlob(entry.imageUrl);
      const file = new File([blob], `text-fix-${entry.record.id}`, {
        type: blob.type || 'image/png',
      });
      await performGeneration(
        { ...item.settings, prompt: buildTextFixPrompt(check), count: 1, referenceIds: [] },
        [file],
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法修正文字，请稍后重试。', 'error');
    }
  };

  const deleteBatch = async (item: FeedItem): Promise<void> => {
    setMutatingId(item.id);
    try {
      await history.removeBatch(item.id);
      setFeed((current) => current.filter((candidate) => candidate.id !== item.id));
      if (activeHistoryBatchId === item.id) setActiveHistoryBatchId(null);
      notify('整组图片已删除。');
      setDeleteTarget(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败，请稍后重试。', 'error');
    } finally {
      setMutatingId(null);
    }
  };

  const deleteEntry = async (entry: HistoryEntry): Promise<void> => {
    setMutatingId(entry.record.id);
    try {
      await history.remove(entry.record.id);
      setFeed((current) =>
        current
          .map((item) => ({
            ...item,
            entries: item.entries.filter((candidate) => candidate.record.id !== entry.record.id),
          }))
          .filter((item) => item.entries.length > 0 || item.error),
      );
      if (selected?.record.id === entry.record.id) setSelected(null);
      notify('图片已删除。');
      setDeleteTarget(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败，请稍后重试。', 'error');
    } finally {
      setMutatingId(null);
    }
  };

  const downloadBatch = async (item: FeedItem): Promise<void> => {
    try {
      for (const [index, entry] of item.entries.entries()) {
        await downloadUrl(entry.imageUrl, `${item.id}-${index + 1}.png`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '下载失败，请稍后重试。', 'error');
    }
  };

  const confirmDeletion = async (): Promise<void> => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'batch') await deleteBatch(deleteTarget.item);
    else await deleteEntry(deleteTarget.entry);
  };

  const navigateToHistoryBatch = (batch: GroupedBatch): void => {
    setSelected(null);
    setActiveHistoryBatchId(batch.batchId);
    scrollToGenerationBatch(batch.batchId);
  };

  const loadHistoryBatch = (batch: GroupedBatch): void => {
    setSelected(null);
    if (scrollToGenerationBatch(batch.batchId)) {
      setActiveHistoryBatchId(batch.batchId);
      return;
    }
    const openSessionFocusedOn = (sessionId: string): void => {
      sessionEntryFocus.current = { sessionId, batchId: batch.batchId };
      void navigate(`/generate?${new URLSearchParams({ session: sessionId }).toString()}`);
    };
    const owningSession = sessions.find((session) => session.batchIds.includes(batch.batchId));
    if (owningSession && owningSession.id !== activeSessionId) {
      openSessionFocusedOn(owningSession.id);
      return;
    }
    // A batch no session owns is brought into the one being viewed.
    if (!activeSessionId) {
      const session = createSession(batch.prompt);
      attachGenerationBatch(session.id, batch.batchId, batch.prompt);
      openSessionFocusedOn(session.id);
      return;
    }
    pendingScrollId.current = batch.batchId;
    attachGenerationBatch(activeSessionId, batch.batchId, batch.prompt);
    setActiveHistoryBatchId(batch.batchId);
  };

  const scrollToLatestBatch = (): void => {
    const target = latestBatchRef.current;
    const composer = composerRef.current;
    if (!target || !composer) return;
    const targetRect = target.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const top = Math.max(
      0,
      window.scrollY + targetRect.bottom - (composerRect.top - LATEST_BATCH_COMPOSER_GAP),
    );
    setActiveHistoryBatchId(null);
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  useLayoutEffect(() => {
    if (
      !activeSessionId ||
      !history.isHydrated ||
      !isFeedSynced ||
      generation.isLoading ||
      feed.length === 0 ||
      initialLatestScrollSession.current === activeSessionId
    ) {
      return;
    }
    const entryFocus =
      sessionEntryFocus.current?.sessionId === activeSessionId ? sessionEntryFocus.current : null;
    const targetId = entryFocus?.batchId ?? feed[feed.length - 1]?.id;
    if (!targetId || !scrollToGenerationBatch(targetId, 'auto')) return;
    initialLatestScrollSession.current = activeSessionId;
    sessionEntryFocus.current = null;
    setActiveHistoryBatchId(entryFocus?.batchId ?? null);
  }, [
    activeSessionId,
    feed,
    generation.isLoading,
    history.isHydrated,
    isFeedSynced,
    setActiveHistoryBatchId,
  ]);

  return (
    <section
      className={`generation-console ${feed.length ? 'has-results' : 'is-empty'}`}
      data-view="generate"
      aria-label="图像生成工作区"
    >
      <LandingSidebar
        accountImage={user?.image}
        accountName={accountName}
        brandLabel="Nebulens"
        creditsRemaining={quota?.remaining ?? '—'}
        ctaLabel="返回发现"
        ctaTo="/"
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
      <GenerationHistoryFlyout
        batches={generationHistoryBatches}
        trackBatchIds={visibleHistoryBatchIds}
        activeBatchId={activeHistoryBatchId}
        hoveredBatchId={hoveredBatchId}
        isHydrating={history.isHydrating}
        hydrateError={history.hydrateError}
        isGenerating={generation.isLoading}
        pendingPrompt={prompt}
        onSelectBatch={loadHistoryBatch}
        onNavigateBatch={navigateToHistoryBatch}
        onInteractionLeave={() => setActiveHistoryBatchId(null)}
      />
      {!feed.length ? (
        <div className="generation-empty-state" aria-label="开始你的创作">
          <div className="generation-empty-state__art" aria-hidden="true">
            <ImagePlus className="generation-empty-state__image-icon" />
            <Sparkles className="generation-empty-state__sparkle generation-empty-state__sparkle--top" />
            <Sparkles className="generation-empty-state__sparkle generation-empty-state__sparkle--side" />
          </div>
          <h2>开始你的创作</h2>
          <p>在下方输入描述，或提供参考图，让 AI 帮你生成想象中的画面</p>
        </div>
      ) : null}
      <div ref={composerRef} className="studio-create-bar">
        {showJumpToLatest ? (
          <div className="generation-jump-latest">
            <IconTooltip label="回到最新图片">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="generation-jump-latest__button"
                aria-label="回到最新图片"
                onClick={scrollToLatestBatch}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
            </IconTooltip>
          </div>
        ) : null}
        {inspiration.length > 0 ? (
          <LandingRecommendations
            className="generation-inspiration"
            recommendations={inspiration.slice(0, 3)}
            onOpen={setSelectedInspiration}
            onUsePrompt={applyInspiration}
            onDismiss={() => setDismissedInspirationFor(prompt.trim())}
          />
        ) : null}
        <TextResolutionHint
          prompt={prompt}
          resolution={resolution}
          onUse2k={() => updateResolution('2k')}
        />
        {reusedReferenceIds.length ? (
          <div className="reused-references">
            <span>沿用 {reusedReferenceIds.length} 张历史参考图</span>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              aria-label="清除历史参考图"
              onClick={() => setReusedReferenceIds([])}
            >
              清除
            </Button>
          </div>
        ) : null}
        <AgentChatInput
          value={prompt}
          onValueChange={setPrompt}
          onSubmit={(payload) => submitCurrent(payload.text)}
          onStop={generation.cancel}
          status={generation.isLoading ? 'streaming' : 'ready'}
          placeholder="描述你想生成的画面…"
          ariaLabel="图像提示词"
          submitLabel="生成图片"
          submitContent={
            <GenerationSubmitCost count={count} model={model} resolution={resolution} />
          }
          disabled={authLoading}
          minRows={2}
          maxRows={7}
          models={[]}
          reasoningLevels={[]}
          speedModes={[]}
          agents={[]}
          skills={[]}
          attachments={attachments}
          onAttachmentsChange={handleAttachments}
          acceptedFileTypes="image/png,image/jpeg,image/webp"
          toolbarContent={
            <GenerationComposerControls
              model={model}
              aspect={aspect}
              count={count}
              resolution={resolution}
              quality={quality}
              disabled={generation.isLoading}
              customPanelSide="top"
              onModelChange={setModel}
              onAspectChange={setAspect}
              onCountChange={setCount}
              onResolutionChange={updateResolution}
              onQualityChange={setQuality}
              trailingContent={
                <span className="studio-toolbar-meta">
                  <span
                    className="studio-toolbar-status"
                    data-active={generation.isLoading ? 'true' : undefined}
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="studio-toolbar-status__dot"
                      data-active={generation.isLoading ? 'true' : undefined}
                      aria-hidden="true"
                    />
                    {generation.isLoading ? generation.statusMessage : '准备生成'}
                  </span>
                  <span
                    className="studio-toolbar-quota"
                    aria-label={
                      activeImageApiKeyConfigured
                        ? '当前使用个人 API Key'
                        : resolution === DEFAULT_IMAGE_RESOLUTION
                          ? '今日生成额度'
                          : '2K/4K 永久积分'
                    }
                  >
                    {imageApiKey.isLoading
                      ? '调用：同步中'
                      : activeImageApiKeyConfigured
                        ? `调用：个人 Key · ${activeImageApiKeySuffix ?? '已配置'}`
                        : quotaLoading
                          ? '额度：同步中'
                          : isAuthenticated
                            ? `${resolution === DEFAULT_IMAGE_RESOLUTION ? '额度' : '永久积分'}：${activeQuotaRemaining ?? '—'} / ${activeQuotaTotal ?? '—'}`
                            : '额度：登录后查看'}
                  </span>
                </span>
              }
            />
          }
          className="generation-composer studio-agent-input"
        />
      </div>

      {feed.length ? (
        <section
          ref={sessionFeedRef}
          className="session-feed"
          aria-label="本次创作结果"
          aria-busy={generation.isLoading}
        >
          {feed.map((item, index) => (
            <GenerationBatch
              key={item.id}
              item={item}
              articleRef={index === feed.length - 1 ? latestBatchRef : undefined}
              isGenerating={generation.isLoading}
              statusMessage={generation.statusMessage}
              mutatingId={mutatingId}
              openEntryId={selected?.record.id ?? null}
              onHoverChange={(hovered) =>
                setHoveredBatchId((current) =>
                  hovered ? item.id : current === item.id ? null : current,
                )
              }
              onRegenerate={(promptValue) => regenerateReplacingBatch(item, promptValue)}
              onRetry={() => void performGeneration(item.settings, [], false, item)}
              onGenerateAgain={() => void performGeneration(item.settings)}
              onReuseSettings={() => reuseSettings(item.settings)}
              onDownloadBatch={() => void downloadBatch(item)}
              onDeleteBatch={() => setDeleteTarget({ kind: 'batch', item })}
              onOpenEntry={setSelected}
              onUseAsReference={(entry) => void addAsReference(entry)}
              onFixText={(entry) => void fixText(item, entry)}
              onDeleteEntry={(entry) => setDeleteTarget({ kind: 'entry', entry })}
            />
          ))}
        </section>
      ) : null}

      <ImageDetailModal
        entry={selected}
        canDelete
        isDeleting={mutatingId === selected?.record.id}
        onClose={() => setSelected(null)}
        onReuse={(entry) => {
          const item = feed.find((candidate) =>
            candidate.entries.some(
              (candidateEntry) => candidateEntry.record.id === entry.record.id,
            ),
          );
          if (item) reuseSettings(item.settings);
          setSelected(null);
        }}
        onUseAsReference={(entry) => void addAsReference(entry).then(() => setSelected(null))}
        onDelete={(entry) => {
          setSelected(null);
          setDeleteTarget({ kind: 'entry', entry });
        }}
      />
      <ImageDetailModal
        entry={selectedInspirationEntry}
        {...(selectedInspiration === null ? {} : { ownerName: selectedInspiration.ownerName })}
        onClose={() => setSelectedInspiration(null)}
        onReuse={() => {
          if (selectedInspiration !== null) applyInspiration(selectedInspiration);
        }}
      />
      <ConfirmActionModal
        id="generation-delete"
        open={deleteTarget !== null}
        title={deleteTarget?.kind === 'batch' ? '删除整组图片' : '删除图片'}
        description={
          deleteTarget?.kind === 'batch'
            ? `将永久删除这组中的 ${deleteTarget.item.entries.length} 张图片。`
            : '将永久删除这张图片。'
        }
        confirmLabel={deleteTarget?.kind === 'batch' ? '删除整组' : '删除图片'}
        isPending={mutatingId !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeletion}
      />
    </section>
  );
}
