import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

import type * as ImagesApi from '@/services/api/imagesApi';

// jsdom has no PointerEvent; a mouse event carries the button, position and keys a canvas reads.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
Object.defineProperty(window, 'PointerEvent', { configurable: true, value: TestPointerEvent });

const skills = vi.hoisted(() => ({
  fetchSkillForms: vi.fn(),
  planSkill: vi.fn(),
  selectSkillForBrief: vi.fn(),
  planFreely: vi.fn(),
}));
vi.mock('@/services/api/skillsApi', () => skills);

const images = vi.hoisted(() => ({ fetchOutputBlob: vi.fn(), uploadReferenceImages: vi.fn() }));
vi.mock('@/services/api/imagesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof ImagesApi>()),
  fetchOutputBlob: images.fetchOutputBlob,
  uploadReferenceImages: images.uploadReferenceImages,
}));

const generation = vi.hoisted(() => ({ generate: vi.fn(), cancel: vi.fn() }));
vi.mock('@/hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    isLoading: false,
    error: null,
    statusMessage: '',
    generate: generation.generate,
    cancel: generation.cancel,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-a', username: 'user-a' },
    isAuthenticated: true,
    isLoading: false,
    isAdmin: false,
    logout: vi.fn(),
  }),
}));
const quotaMocks = vi.hoisted(() => ({ remaining: 18 }));
vi.mock('@/hooks/useImageQuota', () => ({
  useImageQuota: () => ({
    quota: {
      total: 20,
      remaining: quotaMocks.remaining,
      checkedInToday: false,
      dailyCheckInReward: 5,
    },
    isLoading: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    checkIn: vi.fn(),
  }),
}));
vi.mock('@/hooks/useImageApiKey', () => ({
  useImageApiKey: () => ({ status: { configured: false }, isLoading: false }),
}));

const historyMocks = vi.hoisted(() => ({ batches: [] as unknown[] }));
vi.mock('@/hooks/useImageHistory', () => ({
  useImageHistory: () => ({
    batches: historyMocks.batches,
    isHydrated: true,
    isHydrating: false,
    hydrateError: null,
    removeWithUndo: vi.fn(() => () => true),
    pendingRemovalIds: [],
    removeBatch: vi.fn(),
  }),
}));

import { ToastProvider } from '@/components/common/ToastProvider';
import { resetAgentConversationsForTests } from '@/hooks/useAgentConversation';
import {
  attachGenerationBatch,
  createGenerationSession,
  resetGenerationSessionsForTests,
} from '@/hooks/useGenerationSessions';
import { agentRequestState } from '@/utils/agentRequest';
import { AgentView } from '@/views/AgentView';

const PLAN = {
  title: '雨夜城市',
  outputs: [
    { id: 'image-1', label: '主视觉', aspect: '3:4', prompt: '雨夜的未来城市，竖版构图' },
    { id: 'image-2', label: '方图', aspect: '1:1', prompt: '雨夜的未来城市，方图构图' },
  ],
};

function Probe() {
  const location = useLocation();
  return (
    <output aria-label="当前路由" data-state={location.state === null ? 'none' : 'some'}>
      {`${location.pathname}${location.search}`}
    </output>
  );
}

type Entry = string | { pathname: string; search?: string; state?: unknown };

function renderAgent(entry: Entry = '/agent') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <Probe />
        <Routes>
          <Route path="/agent" element={<AgentView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function send(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole('textbox', { name: 'Agent 提示词' }), text);
  await user.click(screen.getByRole('button', { name: '发送给 Agent' }));
}

function historyBatch(batchId: string, id: string, prompt: string) {
  const settings = {
    prompt,
    model: 'gpt-image-2',
    count: 1,
    aspectRatio: '1:1',
    resolution: 'standard',
    isPublic: false,
    referenceIds: [],
  };
  return {
    batchId,
    createdAt: '2026-11-16T08:00:00.000Z',
    prompt,
    model: 'gpt-image-2',
    settings,
    entries: [
      {
        record: {
          id,
          batchId,
          createdAt: '2026-11-16T08:00:00.000Z',
          prompt,
          model: 'gpt-image-2',
          aspectRatio: '1:1',
          width: 1024,
          height: 1024,
          count: 1,
          resolution: 'standard',
          isPublic: false,
          isFavorite: false,
        },
        imageUrl: `/api/outputs/${id}`,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetGenerationSessionsForTests();
  resetAgentConversationsForTests();
  historyMocks.batches = [];
  quotaMocks.remaining = 18;
  skills.fetchSkillForms.mockResolvedValue([]);
  skills.selectSkillForBrief.mockResolvedValue({ skillId: null, modelUnavailable: false });
  skills.planFreely.mockResolvedValue(PLAN);
  images.fetchOutputBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  images.uploadReferenceImages.mockImplementation((files: File[]) =>
    Promise.resolve(
      files.map((file, index) => ({
        id: `ref-${index}`,
        filename: file.name,
        mime: file.type,
        size: file.size,
      })),
    ),
  );
  let made = 0;
  generation.generate.mockImplementation((options: { prompt: string; aspectRatio: string }) => {
    made += 1;
    const batchId = `agent-batch-${made}`;
    return Promise.resolve({
      batchId,
      aspectRatio: options.aspectRatio,
      generationMode: 'text-to-image',
      entries: [
        {
          record: {
            id: `agent-${made}.png`,
            batchId,
            createdAt: '2026-11-16T08:00:00.000Z',
            prompt: options.prompt,
            model: 'gpt-image-2',
            aspectRatio: options.aspectRatio,
            width: 1024,
            height: 1024,
            count: 1,
            resolution: 'standard',
            isPublic: false,
            isFavorite: false,
          },
          imageUrl: `/api/outputs/agent-${made}.png`,
        },
      ],
    });
  });
});

it('reads a request, shows its plan and what it costs, and makes it only once confirmed', async () => {
  const user = userEvent.setup();
  renderAgent();
  expect(screen.getByRole('heading', { name: '想做点什么？' })).toBeInTheDocument();

  await send(user, '雨夜的未来城市，做两张');

  const plan = await screen.findByRole('region', { name: '待确认的方案' });
  expect(plan).toHaveTextContent('2 张 · 预计 2 积分');
  // The go-ahead hands the work to the Agent, so it wears the AI's gradient.
  expect(within(plan).getByRole('button', { name: '开始生成' })).toHaveClass('agent-plan__start');
  expect(within(plan).getByText('雨夜的未来城市，竖版构图')).toBeInTheDocument();
  const steps = screen.getByRole('list', { name: 'Agent 的步骤' });
  expect(steps).toHaveTextContent(/理解需求 \d+\.\ds/);
  expect(steps).toHaveTextContent('没有合适的技能，自己规划画面');
  expect(steps).toHaveTextContent('规划了 2 张图');
  expect(skills.selectSkillForBrief).toHaveBeenCalledWith('雨夜的未来城市，做两张', false);
  expect(generation.generate).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByLabelText('当前路由')).toHaveTextContent('/agent?session='),
  );

  await user.click(within(plan).getByRole('button', { name: '开始生成' }));

  await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(2));
  expect(
    generation.generate.mock.calls.map(([options]) => {
      const { prompt, aspectRatio, isShared } = options as {
        prompt: string;
        aspectRatio: string;
        isShared: boolean;
      };
      return [prompt, aspectRatio, isShared];
    }),
  ).toEqual([
    ['雨夜的未来城市，竖版构图', '3:4', true],
    ['雨夜的未来城市，方图构图', '1:1', true],
  ]);
  expect(await screen.findAllByRole('button', { name: /^画布图片：/ })).toHaveLength(2);
  expect(await screen.findByText('生成了 2 张图')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '待确认的方案' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '在画布上查看' })).toBeInTheDocument();
});

it('says when a plan costs more credits than are left, and lets pictures be dropped to fit', async () => {
  const user = userEvent.setup();
  quotaMocks.remaining = 1;
  renderAgent();

  await send(user, '雨夜的未来城市，做两张');

  const plan = await screen.findByRole('region', { name: '待确认的方案' });
  expect(plan).toHaveTextContent('剩余 1 积分，不够生成这 2 张');
  const start = within(plan).getByRole('button', { name: '开始生成' });
  expect(start).toBeDisabled();

  await user.click(within(plan).getByRole('button', { name: '去掉「方图」' }));

  expect(plan).toHaveTextContent('1 张 · 预计 1 积分');
  // What the Agent planned stays told as it was, with what was dropped after.
  const steps = screen.getByRole('list', { name: 'Agent 的步骤' });
  expect(steps).toHaveTextContent('规划了 2 张图');
  expect(steps).toHaveTextContent('已去掉 1 张');
  expect(plan).not.toHaveTextContent('不够生成');
  expect(within(plan).queryByRole('button', { name: /^去掉/ })).not.toBeInTheDocument();
  await user.click(within(plan).getByRole('button', { name: '开始生成' }));
  await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(1));
  expect(generation.generate).toHaveBeenCalledWith(
    expect.objectContaining({ prompt: '雨夜的未来城市，竖版构图' }),
  );
});

it('makes a waiting plan with the settings in the composer when it is confirmed', async () => {
  const user = userEvent.setup();
  renderAgent();

  await send(user, '雨夜的未来城市，做两张');
  const plan = await screen.findByRole('region', { name: '待确认的方案' });
  expect(plan).not.toHaveTextContent('仅自己可见');

  // Asked first, the settings can still change before anything is made.
  await user.click(screen.getByRole('button', { name: '自定义生成参数' }));
  await user.click(
    within(screen.getByRole('group', { name: '可见范围' })).getByRole('menuitemradio', {
      name: '仅自己可见',
    }),
  );
  await user.click(
    within(screen.getByRole('group', { name: '清晰度' })).getByRole('menuitemradio', {
      name: '2K',
    }),
  );
  await user.keyboard('{Escape}');
  expect(plan).toHaveTextContent('仅自己可见');
  expect(plan).toHaveTextContent('预计 6 积分');

  await user.click(within(plan).getByRole('button', { name: '开始生成' }));

  await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(2));
  expect(generation.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: '雨夜的未来城市，竖版构图',
      isShared: false,
      resolution: '2k',
    }),
  );
});

it('runs by itself once told to, and keeps the pictures to their maker when asked', async () => {
  const user = userEvent.setup();
  renderAgent();

  await user.click(screen.getByRole('button', { name: '执行方式' }));
  await user.click(await screen.findByRole('menuitemradio', { name: /自动执行/ }));
  await user.click(screen.getByRole('button', { name: '自定义生成参数' }));
  await user.click(
    within(screen.getByRole('group', { name: '可见范围' })).getByRole('menuitemradio', {
      name: '仅自己可见',
    }),
  );
  await user.keyboard('{Escape}');
  await send(user, '雨夜的未来城市，做两张');

  await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(2));
  expect(generation.generate).toHaveBeenCalledWith(
    expect.objectContaining({ prompt: '雨夜的未来城市，竖版构图', isShared: false }),
  );
  expect(screen.queryByRole('region', { name: '待确认的方案' })).not.toBeInTheDocument();
  expect(await screen.findByText('生成了 2 张图')).toBeInTheDocument();
});

it('sends the pictures selected on the canvas with the request, as its references', async () => {
  const user = userEvent.setup();
  const session = createGenerationSession('雨夜');
  attachGenerationBatch(session.id, 'old-batch', '旧图');
  historyMocks.batches = [historyBatch('old-batch', 'old.png', '旧图')];
  renderAgent(`/agent?session=${session.id}`);

  const picture = await screen.findByRole('button', { name: '画布图片：旧图' });
  fireEvent.pointerDown(picture, { button: 0, clientX: 5, clientY: 5 });
  fireEvent.pointerUp(screen.getByRole('region', { name: '画布' }), {
    button: 0,
    clientX: 5,
    clientY: 5,
  });
  expect(screen.getByLabelText('作为参考的图')).toHaveTextContent('参考画布上选中的 1 张图');

  await send(user, '参考这张做暖色调');

  await waitFor(() =>
    expect(skills.selectSkillForBrief).toHaveBeenCalledWith('参考这张做暖色调', true),
  );
  expect(images.fetchOutputBlob).toHaveBeenCalledWith('/api/outputs/old.png');
  expect(screen.getByLabelText('参考 1 张图')).toBeInTheDocument();
  // The selection went with the request; the next one starts without it.
  expect(screen.queryByLabelText('作为参考的图')).not.toBeInTheDocument();
  const plan = await screen.findByRole('region', { name: '待确认的方案' });
  await user.click(within(plan).getByRole('button', { name: '开始生成' }));
  await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(2));
  expect(generation.generate).toHaveBeenCalledWith(
    expect.objectContaining({ referenceIds: ['ref-0'] }),
  );
});

it('says the text model could not pick a skill, rather than that no skill fits', async () => {
  const user = userEvent.setup();
  skills.selectSkillForBrief.mockResolvedValueOnce({ skillId: null, modelUnavailable: true });
  renderAgent();

  await send(user, '雨夜的未来城市，做两张');

  // The free plan can still come through once the model answers again.
  expect(await screen.findByRole('region', { name: '待确认的方案' })).toBeInTheDocument();
  const steps = screen.getByRole('list', { name: 'Agent 的步骤' });
  const step = within(steps).getByText('文本模型暂不可用，没能挑选技能，改为自己规划画面');
  expect(step.closest('.agent-step')).toHaveAttribute('data-state', 'error');
  expect(steps).not.toHaveTextContent('没有合适的技能');
  expect(steps).not.toHaveTextContent('理解需求');
  expect(steps).toHaveTextContent('规划了 2 张图');
});

it('tells in the conversation when a request cannot be planned, and sends it again on asking', async () => {
  const user = userEvent.setup();
  skills.planFreely.mockRejectedValueOnce(
    new Error('Agent 需要文本模型来规划画面，当前没有配置。'),
  );
  renderAgent();

  await send(user, '雨夜');

  const error = await screen.findByText(/Agent 需要文本模型/);
  expect(error.closest('.agent-step')).toHaveAttribute('data-state', 'error');
  expect(generation.generate).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '重新发送' }));
  expect(await screen.findByRole('region', { name: '待确认的方案' })).toBeInTheDocument();
  expect(screen.getAllByRole('list', { name: 'Agent 的步骤' })).toHaveLength(2);
});

it('starts on a request sent from another page, in the session it came from', async () => {
  const session = createGenerationSession('晨雾');
  renderAgent({
    pathname: '/agent',
    search: `?session=${session.id}`,
    state: agentRequestState('晨雾里的灯塔', []),
  });

  expect(await screen.findByRole('region', { name: '待确认的方案' })).toBeInTheDocument();
  expect(screen.getByText('晨雾里的灯塔')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '晨雾' })).toBeInTheDocument();
  const route = screen.getByLabelText('当前路由');
  expect(route).toHaveTextContent(`/agent?session=${session.id}`);
  // The request is read once; a reload does not send it again.
  await waitFor(() => expect(route).toHaveAttribute('data-state', 'none'));
});

it('stops a request while it is being planned, and nothing comes of the plan', async () => {
  const user = userEvent.setup();
  let resolvePlan!: (plan: typeof PLAN) => void;
  skills.planFreely.mockReturnValueOnce(
    new Promise<typeof PLAN>((resolve) => {
      resolvePlan = resolve;
    }),
  );
  renderAgent();

  await send(user, '雨夜');
  await user.click(await screen.findByRole('button', { name: '停止生成' }));

  expect(await screen.findByText('已取消')).toBeInTheDocument();
  await act(async () => {
    resolvePlan(PLAN);
    await Promise.resolve();
  });
  expect(screen.queryByRole('region', { name: '待确认的方案' })).not.toBeInTheDocument();
  expect(generation.generate).not.toHaveBeenCalled();
});

it('sets aside a plan still waiting for a yes when a new request comes', async () => {
  const user = userEvent.setup();
  renderAgent();

  await send(user, '第一个');
  await screen.findByRole('region', { name: '待确认的方案' });
  await send(user, '第二个');

  await waitFor(() =>
    expect(screen.getAllByRole('list', { name: 'Agent 的步骤' })).toHaveLength(2),
  );
  await waitFor(() =>
    expect(screen.getAllByRole('region', { name: '待确认的方案' })).toHaveLength(1),
  );
  expect(screen.getAllByRole('list', { name: 'Agent 的步骤' })[0]).toHaveTextContent('已取消');
});

it('folds the conversation away and brings it back', async () => {
  const user = userEvent.setup();
  renderAgent();

  await user.click(screen.getByRole('button', { name: '收起对话' }));
  expect(screen.queryByRole('complementary', { name: 'Agent 对话' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '展开对话' }));
  expect(screen.getByRole('complementary', { name: 'Agent 对话' })).toBeInTheDocument();
});
