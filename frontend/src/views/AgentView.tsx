import { Bot, LayoutList, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import {
  AgentCanvas,
  type CanvasFocus,
  type CanvasGroup,
  type NodeCaption,
} from '@/components/agent/AgentCanvas';
import { AgentThread, type PlanBudget } from '@/components/agent/AgentThread';
import { useToast } from '@/components/common/ToastProvider';
import { ImageDetailModal } from '@/components/gallery/ImageDetailModal';
import { GenerationComposerControls } from '@/components/generation/GenerationComposerControls';
import { LandingSkillBar } from '@/components/landing/LandingSkillBar';
import { AgentChatInput } from '@/components/premium/agent-chat-input/agent-chat-input';
import type { AgentChatAttachment } from '@/components/premium/agent-chat-input/types';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { SelectMenu } from '@/components/ui/select-menu';
import {
  AGENT_PROMPT_EXAMPLES,
  COMPOSER_SKILLS,
  findLandingSkill,
  LIBRARY_SKILLS,
  skillInPrompt,
  withoutSkills,
} from '@/data/composerSkills';
import {
  addAgentTurn,
  updateAgentTurn,
  useAgentConversation,
  type AgentTurn,
} from '@/hooks/useAgentConversation';
import {
  AGENT_EXECUTION_LABELS,
  useAgentExecution,
  type AgentExecution,
} from '@/hooks/useAgentExecution';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { useCanvasLayout } from '@/hooks/useCanvasLayout';
import { useComposerSkills, type AgentProgress } from '@/hooks/useComposerSkills';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useGenerationFeed } from '@/hooks/useGenerationFeed';
import { useGenerationSessions } from '@/hooks/useGenerationSessions';
import { useImageApiKey } from '@/hooks/useImageApiKey';
import { useImageGeneration } from '@/hooks/useImageGeneration';
import { useImageHistory } from '@/hooks/useImageHistory';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useLeaveWarning } from '@/hooks/useLeaveWarning';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePrivateGeneration } from '@/hooks/usePrivateGeneration';
import { useProjectReady } from '@/hooks/useProjectSync';
import { useSkillRun } from '@/hooks/useSkillRun';
import { fetchOutputBlob } from '@/services/api/imagesApi';
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_RESOLUTION,
  imageGenerationCreditCost,
  MAX_REFERENCE_IMAGES,
  supportsImageQuality,
  type GenerationSettingsSnapshot,
  type HistoryEntry,
  type ImageModel,
  type ImageQuality,
  type ImageResolution,
} from '@/types/image';
import { readAgentRequest } from '@/utils/agentRequest';
import { agentSets, setFileName, type AgentSet } from '@/utils/agentSets';
import { boardSlots } from '@/utils/canvasLayout';
import { downloadUrl } from '@/utils/download';
import type { FeedItem } from '@/utils/generationFeed';
import type { SkillRunRequest } from '@/utils/skillRun';
import { buildTextFixPrompt } from '@/utils/textCheck';
import { thumbnailUrl } from '@/utils/thumbnail';

const EXECUTION_OPTIONS = [
  { value: 'ask', label: AGENT_EXECUTION_LABELS.ask, description: '先给出方案，确认后再生成' },
  { value: 'auto', label: AGENT_EXECUTION_LABELS.auto, description: '规划好就直接生成' },
] as const satisfies readonly { value: AgentExecution; label: string; description: string }[];

/** The conversation's width and its distance from the window's edges, on a wide screen. */
const PANEL_WIDTH = 380;
const PANEL_MARGIN = 12;
const EXAMPLES = AGENT_PROMPT_EXAMPLES.slice(0, 3);

interface TurnRef {
  sessionId: string;
  turnId: string;
}

function newTurnId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `turn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** A picture on the board, fetched again as a file so it can go with a request. */
async function referenceFile(entry: HistoryEntry): Promise<File> {
  const blob = await fetchOutputBlob(entry.imageUrl);
  const extension =
    blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
  return new File([blob], `reference-${entry.record.id}.${extension}`, {
    type: blob.type || 'image/png',
  });
}

/**
 * The Agent's workspace: a conversation beside an endless canvas. Each request is read,
 * matched to a skill or planned freely, and, unless the Agent may run by itself, shown as a
 * plan to confirm before any credits are spent. The pictures it makes are laid out on the
 * canvas, one request to a row, and whatever is selected there goes with the next request
 * as its reference.
 */
export function AgentView() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const history = useImageHistory();
  const { sessions, create: createSession } = useGenerationSessions();
  const { quota, refresh: refreshQuota } = useImageQuota();
  const imageApiKey = useImageApiKey();
  const generation = useImageGeneration();
  const upload = useFileUpload();
  const narrow = useMediaQuery('(max-width: 860px)');
  // A request sent from another page brings the settings it was written with. They are the
  // starting point, since its plan is made, priced and run with these from the first render.
  const [carried] = useState(() => readAgentRequest(location.state)?.settings);
  const [model, setModel] = useState<ImageModel>(carried?.model ?? DEFAULT_IMAGE_MODEL);
  const [resolution, setResolution] = useState<ImageResolution>(
    carried?.resolution ?? DEFAULT_IMAGE_RESOLUTION,
  );
  const [quality, setQuality] = useState<ImageQuality>(carried?.quality ?? DEFAULT_IMAGE_QUALITY);
  const [isPrivate, setIsPrivate] = usePrivateGeneration();
  const [execution, setExecution] = useAgentExecution();
  const executionRef = useRef(execution);
  executionRef.current = execution;
  const [prompt, setPrompt] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [detail, setDetail] = useState<HistoryEntry | null>(null);
  const [focus, setFocus] = useState<CanvasFocus | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const panelRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const urlSessionId = searchParams.get('session');
  /**
   * A session just made, until the address shows it. Navigation is committed as a
   * transition, so a plan that comes back fast could otherwise start generating while the
   * page still thinks it has no session, and the pictures would go to another one.
   */
  const [madeSessionId, setMadeSessionId] = useState<string | null>(null);
  useEffect(() => setMadeSessionId(null), [urlSessionId]);
  const activeSessionId = madeSessionId ?? urlSessionId;
  const session = sessions.find((candidate) => candidate.id === activeSessionId);
  const currentUserId = isAuthenticated ? (user?.id ?? null) : null;
  const turns = useAgentConversation(activeSessionId);
  /** The request being read and planned, and the one whose pictures are being made. */
  const planningTurn = useRef<TurnRef | null>(null);
  const runTurn = useRef<TurnRef | null>(null);

  const { feed, setFeed, isFeedSynced, performGeneration } = useGenerationFeed({
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
    basePath: '/agent',
    onSessionCreated: () => undefined,
    onItemReplaced: () => undefined,
    onComposerSubmitted: () => undefined,
  });
  /** The board without pictures still inside their undo window. */
  const visibleFeed = useMemo(() => {
    const pending = history.pendingRemovalIds;
    if (pending.length === 0) return feed;
    return feed
      .map((item) => ({
        ...item,
        entries: item.entries.filter((entry) => !pending.includes(entry.record.id)),
      }))
      .filter(
        (item, index) =>
          item.entries.length > 0 || item.error || (feed[index]?.entries.length ?? 0) === 0,
      );
  }, [feed, history.pendingRemovalIds]);
  const slots = useMemo(() => boardSlots(visibleFeed), [visibleFeed]);
  // A project kept on the server brings its own places; nothing is placed before they
  // arrive, or places made up here would replace them.
  const projectReady = useProjectReady(activeSessionId);
  const layout = useCanvasLayout({
    sessionId: activeSessionId,
    feed: visibleFeed,
    run: turns.at(-1)?.id ?? null,
    enabled: isFeedSynced && projectReady,
  });
  const slotByKey = useMemo(() => new Map(slots.map((slot) => [slot.key, slot])), [slots]);
  /** Each request's pictures as a set: framed on the board, named after the plan. */
  const sets = useMemo(() => agentSets(turns, visibleFeed), [turns, visibleFeed]);
  const setsByTurn = useMemo(() => new Map(sets.map((set) => [set.turnId, set])), [sets]);
  const groups = useMemo<CanvasGroup[]>(
    () =>
      sets.map((set) => ({
        key: set.turnId,
        title: set.title,
        meta: set.running ? `${set.finals.length}/${set.planned} 件` : `${set.finals.length} 件`,
        keys: set.keys,
      })),
    [sets],
  );
  const captions = useMemo(
    () =>
      new Map<string, NodeCaption>(
        sets.flatMap((set) =>
          set.pieces.map((piece): [string, NodeCaption] => [
            piece.key,
            {
              label: piece.redrawOf === undefined ? piece.label : `${piece.label} · 重画`,
              aspect: piece.aspect,
              check: piece.check,
              issues: piece.issues,
            },
          ]),
        ),
      ),
    [sets],
  );
  const selectedEntries = useMemo(
    () =>
      selection.flatMap((key) => {
        const slot = slotByKey.get(key);
        return slot?.kind === 'image' ? [slot.entry] : [];
      }),
    [selection, slotByKey],
  );

  useEffect(() => {
    setSelection([]);
    setDetail(null);
  }, [activeSessionId]);

  useLayoutEffect(() => {
    const element = panelRef.current;
    if (!narrow || element === null) return;
    const measure = (): void => setPanelHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [narrow, panelOpen]);

  /**
   * Regenerates one picture from itself with a prompt that rewrites only the wrong text. The
   * redraw joins the set of the request that made the picture, as its corrected version.
   */
  const fixText = async (item: FeedItem, entry: HistoryEntry): Promise<void> => {
    const check = entry.record.textCheck;
    if (check === undefined) return;
    const sessionId = activeSessionId;
    const owner = turns.find((turn) => turn.batchIds.includes(item.id));
    try {
      const blob = await fetchOutputBlob(entry.imageUrl);
      const file = new File([blob], `text-fix-${entry.record.id}`, {
        type: blob.type || 'image/png',
      });
      const batchId = await performGeneration(
        { ...item.settings, prompt: buildTextFixPrompt(check), count: 1, referenceIds: [] },
        [file],
      );
      if (batchId !== undefined && sessionId !== null && owner !== undefined) {
        updateAgentTurn(sessionId, owner.id, (turn) => ({
          redraws: { ...turn.redraws, [batchId]: entry.record.id },
        }));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法修正文字，请稍后重试。', 'error');
    }
  };

  const skillRun = useSkillRun({
    isGenerating: generation.isLoading,
    feed,
    runGeneration: async (settings, label) => {
      const target = runTurn.current;
      if (target !== null) {
        updateAgentTurn(target.sessionId, target.turnId, (turn) => ({ started: turn.started + 1 }));
      }
      const batchId = await performGeneration(settings);
      if (target !== null) {
        updateAgentTurn(target.sessionId, target.turnId, (turn) =>
          batchId !== undefined
            ? {
                batchIds: [...turn.batchIds, batchId],
                batchLabels: { ...turn.batchLabels, [batchId]: label },
              }
            : turn.status === 'cancelled'
              ? {}
              : { failed: turn.failed + 1 },
        );
      }
      return batchId;
    },
    fixText,
    // What happens along the way is told in the conversation, under the request.
    notify: (message, tone) => {
      const target = runTurn.current;
      if (target === null) notify(message, tone);
      else
        updateAgentTurn(target.sessionId, target.turnId, (turn) => ({
          notes: [...turn.notes, message],
        }));
    },
    announceStart: false,
  });

  const wasRunning = useRef(false);
  useEffect(() => {
    if (skillRun.isRunning) {
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;
    const target = runTurn.current;
    if (target === null) return;
    updateAgentTurn(target.sessionId, target.turnId, (turn) =>
      turn.status === 'running'
        ? { status: turn.batchIds.length === 0 && turn.failed > 0 ? 'failed' : 'done' }
        : {},
    );
  }, [skillRun.isRunning]);

  const startRun = (target: TurnRef, request: SkillRunRequest): void => {
    runTurn.current = target;
    skillRun.start(request);
  };

  const recordProgress = (progress: AgentProgress): void => {
    const target = planningTurn.current;
    if (target === null) return;
    if (progress.kind === 'selected') {
      updateAgentTurn(target.sessionId, target.turnId, {
        thinkingMs: progress.ms,
        chosenSkill: progress.skillLabel,
        ...(progress.modelUnavailable ? { selectionFailed: true } : {}),
      });
    } else if (progress.kind === 'planned') {
      updateAgentTurn(target.sessionId, target.turnId, { planningMs: progress.ms });
    } else {
      planningTurn.current = null;
      updateAgentTurn(target.sessionId, target.turnId, {
        status: 'failed',
        error: progress.message,
      });
    }
  };

  const receivePlan = (
    title: string,
    request: SkillRunRequest,
    points?: readonly string[],
  ): void => {
    const target = planningTurn.current;
    planningTurn.current = null;
    // A request stopped while it was being planned makes nothing.
    if (target === null) return;
    const auto = executionRef.current === 'auto';
    updateAgentTurn(target.sessionId, target.turnId, {
      planTitle: title,
      ...(points === undefined || points.length === 0 ? {} : { points: [...points] }),
      plan: request,
      plannedCount: request.steps.length,
      status: auto ? 'running' : 'awaiting',
    });
    if (auto) startRun(target, request);
  };

  const composerSkills = useComposerSkills({
    prompt,
    setPrompt,
    isAuthenticated,
    notify,
    model,
    resolution,
    quality,
    isShared: !isPrivate,
    onPlanned: receivePlan,
    onAgentProgress: recordProgress,
  });
  const { activeSkill } = composerSkills;
  const busy = composerSkills.planning || skillRun.isRunning || generation.isLoading;
  useLeaveWarning(busy);

  const ensureSession = (title: string): string => {
    if (activeSessionId !== null && session !== undefined) return activeSessionId;
    const created = createSession(title);
    setMadeSessionId(created.id);
    void navigate(`/agent?${new URLSearchParams({ session: created.id }).toString()}`, {
      replace: true,
    });
    return created.id;
  };

  const startTurn = async (text: string, extraFiles: readonly File[] = []): Promise<void> => {
    const trimmed = text.trim();
    const skill = skillInPrompt(trimmed);
    const brief = (skill === undefined ? trimmed : withoutSkills(trimmed)).trim();
    if (skill === undefined && brief === '') return;
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    if (busy || planningTurn.current !== null) {
      notify('Agent 还在处理上一个请求，可以先停止它。');
      return;
    }
    if (activeSessionId !== null) {
      // A new request sets aside a plan still waiting for a yes.
      turns
        .filter((turn) => turn.status === 'awaiting')
        .forEach((turn) => updateAgentTurn(activeSessionId, turn.id, { status: 'cancelled' }));
    }
    const sessionId = ensureSession(brief === '' ? trimmed : brief);
    const turnId = newTurnId();
    const target: TurnRef = { sessionId, turnId };
    const picked = selectedEntries;
    addAgentTurn(sessionId, {
      id: turnId,
      createdAt: new Date().toISOString(),
      brief: trimmed,
      references: picked.map((entry) => ({ id: entry.record.id, imageUrl: entry.imageUrl })),
      status: 'planning',
      ...(skill === undefined ? {} : { requestedSkill: skill.label }),
      started: 0,
      failed: 0,
      batchIds: [],
      notes: [],
      ...(currentUserId === null ? {} : { userId: currentUserId }),
    });
    planningTurn.current = target;
    setPrompt('');
    setSelection([]);
    const uploaded = upload.selectedFiles.map((item) => item.file);
    upload.clear();
    let files: File[];
    try {
      files = [...extraFiles, ...uploaded, ...(await Promise.all(picked.map(referenceFile)))].slice(
        0,
        MAX_REFERENCE_IMAGES,
      );
    } catch {
      if (planningTurn.current === target) planningTurn.current = null;
      updateAgentTurn(sessionId, turnId, {
        status: 'failed',
        error: '没能读取选中的参考图，请稍后重试。',
      });
      return;
    }
    if (planningTurn.current !== target) return;
    const attachments: AgentChatAttachment[] = files.map((file, index) => ({
      id: `${turnId}-${index}`,
      name: file.name,
      type: file.type,
      size: file.size,
      file,
    }));
    if (skill !== undefined) await composerSkills.runSkill(skill, brief, attachments);
    else await composerSkills.runAgent(brief, attachments);
  };
  const startTurnRef = useRef(startTurn);
  startTurnRef.current = startTurn;

  // A request sent from another page, such as the home composer in Agent mode.
  const requestHandled = useRef(false);
  useEffect(() => {
    if (authLoading || requestHandled.current) return;
    const request = readAgentRequest(location.state);
    if (request === null) return;
    requestHandled.current = true;
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    void startTurnRef.current(request.brief, request.files);
  }, [authLoading, location.pathname, location.search, location.state, navigate]);

  const stop = (): void => {
    const planningTarget = planningTurn.current;
    planningTurn.current = null;
    if (planningTarget !== null) {
      updateAgentTurn(planningTarget.sessionId, planningTarget.turnId, { status: 'cancelled' });
    }
    const running = runTurn.current;
    if (running !== null) {
      updateAgentTurn(running.sessionId, running.turnId, (turn) =>
        turn.status === 'running' ? { status: 'cancelled' } : {},
      );
    }
    skillRun.cancel();
    generation.cancel();
  };

  /** A plan waiting for a yes is made with the settings in the composer when it gets one. */
  const withCurrentSettings = (plan: SkillRunRequest): SkillRunRequest => ({
    ...plan,
    steps: plan.steps.map((step) => {
      const settings: GenerationSettingsSnapshot = {
        ...step.settings,
        model,
        resolution,
        isShared: !isPrivate,
      };
      if (supportsImageQuality(model)) settings.quality = quality;
      else delete settings.quality;
      return { ...step, settings };
    }),
  });

  const confirmPlan = (turn: AgentTurn): void => {
    if (activeSessionId === null || turn.plan === undefined) return;
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    if (busy) {
      notify('Agent 还在生成上一组图，等它完成再开始。');
      return;
    }
    const shortfall = planBudget(turn).shortfall;
    if (shortfall !== undefined) {
      notify(shortfall, 'error');
      return;
    }
    const plan = withCurrentSettings(turn.plan);
    updateAgentTurn(activeSessionId, turn.id, { status: 'running', plan });
    startRun({ sessionId: activeSessionId, turnId: turn.id }, plan);
  };

  const removeStep = (turn: AgentTurn, index: number): void => {
    if (activeSessionId === null || turn.plan === undefined || turn.plan.steps.length <= 1) return;
    updateAgentTurn(activeSessionId, turn.id, {
      plan: { ...turn.plan, steps: turn.plan.steps.filter((_, position) => position !== index) },
    });
  };

  const revealTurn = (turn: AgentTurn): void => {
    const keys = setsByTurn.get(turn.id)?.keys ?? [];
    if (keys.length > 0) setFocus((current) => ({ keys, serial: (current?.serial ?? 0) + 1 }));
  };

  const revealPiece = (key: string): void =>
    setFocus((current) => ({ keys: [key], serial: (current?.serial ?? 0) + 1 }));

  /** A next step goes into the composer with the set picked on the board as its reference. */
  const suggest = (turn: AgentTurn, text: string): void => {
    setPrompt(text);
    const set = setsByTurn.get(turn.id);
    if (set !== undefined) setSelection(set.finals.map((piece) => piece.key));
  };

  const handleAttachments = (next: AgentChatAttachment[]): void => {
    const nextIds = new Set(next.map((item) => item.id));
    upload.selectedFiles.forEach((item) => {
      if (!nextIds.has(item.id)) upload.removeFile(item.id);
    });
    const currentIds = new Set(upload.selectedFiles.map((item) => item.id));
    const added = next.flatMap((item) =>
      item.file && !currentIds.has(item.id) ? [item.file] : [],
    );
    if (added.length > 0 && upload.selectFiles(added).skipped) {
      notify(`最多添加 ${MAX_REFERENCE_IMAGES} 张参考图。`, 'error');
    }
  };
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

  const deleteEntry = (entry: HistoryEntry): void => {
    if (detail?.record.id === entry.record.id) setDetail(null);
    setSelection((current) => current.filter((key) => key !== entry.record.id));
    const undo = history.removeWithUndo(entry.record.id, {
      onCommitted: () =>
        setFeed((current) =>
          current
            .map((item) => ({
              ...item,
              entries: item.entries.filter((candidate) => candidate.record.id !== entry.record.id),
            }))
            .filter((item) => item.entries.length > 0 || item.error),
        ),
      onFailed: (error) =>
        notify(error instanceof Error ? error.message : '删除失败，请稍后重试。', 'error'),
    });
    notify('图片已删除。', 'success', { action: { label: '撤销', onAction: undo } });
  };

  const downloadEntries = async (entries: readonly HistoryEntry[]): Promise<void> => {
    try {
      for (const entry of entries) await downloadUrl(entry.imageUrl, `${entry.record.id}.png`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '下载失败，请稍后重试。', 'error');
    }
  };

  /** A set's pictures, a redraw in place of the one it fixes, named after the set's plan. */
  const downloadSet = async (set: AgentSet): Promise<void> => {
    try {
      for (const [index, piece] of set.finals.entries()) {
        await downloadUrl(piece.entry.imageUrl, setFileName(set, index, piece.label));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '下载失败，请稍后重试。', 'error');
    }
  };

  const copyPrompt = async (entry: HistoryEntry): Promise<void> => {
    try {
      await navigator.clipboard.writeText(entry.record.prompt);
      notify('提示词已复制。');
    } catch {
      notify('复制失败，请手动复制。', 'error');
    }
  };

  const usesOwnKey =
    resolution === DEFAULT_IMAGE_RESOLUTION
      ? imageApiKey.status?.configured === true
      : imageApiKey.status?.highResConfigured === true;
  /** Priced with the composer's settings, which the plan is made with once confirmed. */
  function planBudget(turn: AgentTurn): PlanBudget {
    if (usesOwnKey) return { label: '使用个人 Key', isPrivate };
    const count = turn.plan?.steps.length ?? 0;
    const credits = count * imageGenerationCreditCost(resolution, model);
    const remaining = quota?.remaining;
    return {
      label: `预计 ${credits} 积分`,
      isPrivate,
      ...(typeof remaining === 'number' && credits > remaining
        ? {
            shortfall:
              count > 1
                ? `剩余 ${remaining} 积分，不够生成这 ${count} 张。可以去掉几张，或签到领积分后再开始。`
                : `剩余 ${remaining} 积分，不够生成这张图。签到领积分后再开始。`,
          }
        : {}),
    };
  }

  const insetLeft = !narrow && panelOpen ? PANEL_WIDTH + PANEL_MARGIN * 2 : 0;
  const insetBottom = narrow && panelOpen ? panelHeight + PANEL_MARGIN : 0;
  const title = session?.title ?? '新的 Agent 项目';

  return (
    <section className="agent-workspace" aria-label="Agent 工作台">
      <AgentCanvas
        sessionKey={activeSessionId}
        slots={slots}
        positions={layout.positions}
        placed={layout.placed}
        focus={focus}
        selection={selection}
        onSelectionChange={setSelection}
        onMove={layout.move}
        onOpen={setDetail}
        onDownload={(entries) => void downloadEntries(entries)}
        onDelete={deleteEntry}
        onRetry={(item) => void performGeneration(item.settings, [], false, item)}
        groups={groups}
        captions={captions}
        onDownloadGroup={(key) => {
          const set = setsByTurn.get(key);
          if (set !== undefined) void downloadSet(set);
        }}
        insetLeft={insetLeft}
        insetBottom={insetBottom}
        empty={
          <>
            <strong>Agent 生成的图会摆在这里</strong>
            <span>选中图片即可作为下一次的参考 · 滚轮缩放 · 按住空格拖动画布</span>
          </>
        }
      />
      {panelOpen ? (
        <aside ref={panelRef} className="agent-panel" aria-label="Agent 对话">
          <header className="agent-panel__header">
            <span className="agent-panel__mark" aria-hidden="true">
              <Bot />
            </span>
            <h1 className="agent-panel__title" title={title}>
              {title}
            </h1>
            <IconTooltip label="新建 Agent 项目">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="新建 Agent 项目"
                disabled={busy}
                onClick={() => void navigate('/agent')}
              >
                <Plus aria-hidden="true" />
              </Button>
            </IconTooltip>
            {session === undefined ? null : (
              <IconTooltip label="在生图页查看">
                <Button asChild variant="ghost" size="icon">
                  <Link
                    to={`/generate?${new URLSearchParams({ session: session.id }).toString()}`}
                    aria-label="在生图页查看"
                  >
                    <LayoutList aria-hidden="true" />
                  </Link>
                </Button>
              </IconTooltip>
            )}
            <IconTooltip label="收起对话">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="收起对话"
                onClick={() => setPanelOpen(false)}
              >
                <PanelLeftClose aria-hidden="true" />
              </Button>
            </IconTooltip>
          </header>
          <AgentThread
            turns={turns}
            sets={setsByTurn}
            loading={session !== undefined && !projectReady}
            busy={busy}
            planBudget={planBudget}
            examples={EXAMPLES}
            onConfirm={confirmPlan}
            onRemoveStep={removeStep}
            onCancel={(turn) =>
              activeSessionId !== null &&
              updateAgentTurn(activeSessionId, turn.id, { status: 'cancelled' })
            }
            onRetry={(turn) => void startTurn(turn.brief)}
            onReveal={revealTurn}
            onRevealPiece={revealPiece}
            onDownloadSet={(turn) => {
              const set = setsByTurn.get(turn.id);
              if (set !== undefined) void downloadSet(set);
            }}
            onSuggest={suggest}
            onExample={setPrompt}
          />
          {selectedEntries.length > 0 ? (
            <div className="agent-panel__references" aria-label="作为参考的图">
              <span className="agent-panel__reference-thumbs" aria-hidden="true">
                {selectedEntries.slice(0, 5).map((entry) => (
                  <img key={entry.record.id} src={thumbnailUrl(entry.imageUrl, 320)} alt="" />
                ))}
              </span>
              <span className="agent-panel__reference-label">
                {selectedEntries.length > MAX_REFERENCE_IMAGES
                  ? `参考前 ${MAX_REFERENCE_IMAGES} 张选中的图`
                  : `参考画布上选中的 ${selectedEntries.length} 张图`}
              </span>
              <Button type="button" variant="ghost" size="compact" onClick={() => setSelection([])}>
                不参考
              </Button>
            </div>
          ) : null}
          <AgentChatInput
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={(payload) => void startTurn(payload.text)}
            onStop={stop}
            status={busy ? 'streaming' : 'ready'}
            header={
              activeSkill === undefined ? undefined : (
                <LandingSkillBar
                  skill={activeSkill}
                  form={composerSkills.activeForm}
                  loadError={composerSkills.skillFormsError}
                  choices={composerSkills.skillChoices}
                  showExample={withoutSkills(prompt).length === 0}
                  onChoiceChange={composerSkills.setSkillChoice}
                  onUseExample={() =>
                    setPrompt(`/${activeSkill.label} ${activeSkill.briefExample}`)
                  }
                  onExit={composerSkills.exitSkill}
                />
              )
            }
            placeholder="说说要做什么物料，选中画布上的图可以作为参考…"
            ariaLabel="Agent 提示词"
            submitLabel={
              activeSkill === undefined ? '发送给 Agent' : `用「${activeSkill.label}」开始规划`
            }
            disabled={authLoading}
            minRows={2}
            maxRows={6}
            models={[]}
            reasoningLevels={[]}
            speedModes={[]}
            agents={[]}
            skills={COMPOSER_SKILLS}
            attachments={attachments}
            attachmentLimit={MAX_REFERENCE_IMAGES}
            onAttachmentsChange={handleAttachments}
            acceptedFileTypes="image/png,image/jpeg,image/webp"
            librarySkills={LIBRARY_SKILLS}
            onLibrarySkillSelect={(skillId) => {
              const skill = findLandingSkill(skillId);
              if (skill !== undefined) composerSkills.selectSkill(skill);
            }}
            menuSide="top"
            toolbarContent={
              <>
                <SelectMenu
                  label="执行方式"
                  value={execution}
                  options={EXECUTION_OPTIONS}
                  disabled={authLoading}
                  className="agent-execution-select"
                  contentClassName="generation-control-panel agent-execution-menu"
                  onValueChange={setExecution}
                />
                <GenerationComposerControls
                  model={model}
                  aspect="auto"
                  count={1}
                  resolution={resolution}
                  quality={quality}
                  isPrivate={isPrivate}
                  disabled={busy}
                  planned
                  customPanelSide="top"
                  onModelChange={setModel}
                  onAspectChange={() => undefined}
                  onCountChange={() => undefined}
                  onResolutionChange={setResolution}
                  onQualityChange={setQuality}
                  onPrivateChange={setIsPrivate}
                />
              </>
            }
            className="agent-composer"
          />
        </aside>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="agent-panel-toggle"
          aria-label="展开对话"
          onClick={() => setPanelOpen(true)}
        >
          <PanelLeftOpen aria-hidden="true" />
          对话
        </Button>
      )}
      <ImageDetailModal
        entry={detail}
        canDelete
        onClose={() => setDetail(null)}
        onCopyPrompt={(entry) => void copyPrompt(entry)}
        onUseAsReference={(entry) => {
          setSelection([entry.record.id]);
          setDetail(null);
        }}
        onDelete={deleteEntry}
      />
    </section>
  );
}
