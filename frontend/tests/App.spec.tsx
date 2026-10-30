import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generation = vi.hoisted(() => ({
  generate: vi.fn(),
  cancel: vi.fn(),
}));

const quotaMocks = vi.hoisted(() => ({
  checkIn: vi.fn().mockResolvedValue({
    total: 25,
    remaining: 21,
    checkedInToday: true,
    dailyCheckInReward: 5,
    claimed: true,
  }),
}));

const historyMocks = vi.hoisted(() => ({
  batches: [] as unknown[],
}));

const authMocks = vi.hoisted(
  (): {
    user: {
      id: string;
      email: string;
      username: string;
      isAdmin: boolean;
    } | null;
    isAuthenticated: boolean;
    isLoading: boolean;
  } => ({
    user: {
      id: 'admin',
      email: 'admin@example.com',
      username: 'admin',
      isAdmin: true,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
);

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authMocks.user,
    isAuthenticated: authMocks.isAuthenticated,
    isLoading: authMocks.isLoading,
    isAdmin: true,
    refreshProfile: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithUsername: vi.fn(),
    signUpWithUsername: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useImageQuota', () => ({
  useImageQuota: () => ({
    quota: {
      total: 20,
      remaining: 16,
      checkedInToday: false,
      dailyCheckInReward: 5,
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    checkIn: quotaMocks.checkIn,
  }),
}));

vi.mock('@/hooks/useImageApiKey', () => ({
  useImageApiKey: () => ({
    status: { configured: false },
    isLoading: false,
    isMutating: false,
    error: null,
    refresh: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock('@/hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    isLoading: false,
    error: null,
    statusMessage: '准备生成',
    generate: generation.generate,
    cancel: generation.cancel,
  }),
}));

const recommendationMocks = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock('@/hooks/useTeamRecommendations', () => ({
  useTeamRecommendations: () => ({ items: recommendationMocks.items }),
}));

const showcaseMocks = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock('@/hooks/useTeamShowcase', () => ({
  useTeamShowcase: () => showcaseMocks.items,
}));

const promptMocks = vi.hoisted(() => ({
  enhancePrompt: vi.fn((prompt: string) => Promise.resolve(`${prompt}，霓虹倒影，电影级广角构图`)),
}));

vi.mock('@/services/api/promptApi', () => ({ enhancePrompt: promptMocks.enhancePrompt }));

const skillMocks = vi.hoisted(() => ({ fetchSkillForms: vi.fn(), planSkill: vi.fn() }));
vi.mock('@/services/api/skillsApi', () => ({
  fetchSkillForms: skillMocks.fetchSkillForms,
  planSkill: skillMocks.planSkill,
}));

vi.mock('@/hooks/useImageHistory', () => ({
  useImageHistory: () => ({
    records: [],
    entries: [],
    batches: historyMocks.batches,
    isHydrated: true,
    isHydrating: false,
    hydrateError: null,
    refresh: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    removeBatch: vi.fn(),
    getEntry: vi.fn(),
    getBatch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAdminUsers', () => ({
  useAdminUsers: () => ({
    users: [],
    isLoading: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    createUser: vi.fn(),
    updateQuota: vi.fn(),
    removeUser: vi.fn(),
  }),
}));

import { App } from '@/App';
import { ToastProvider } from '@/components/common/ToastProvider';
import {
  attachGenerationBatch,
  createGenerationSession,
  rememberGenerationSession,
  resetGenerationSessionsForTests,
} from '@/hooks/useGenerationSessions';

const SKILL_FORMS = [
  {
    id: 'ecommerce',
    label: '电商主图',
    description: '填商品和卖点，一次出主图、场景图和卖点图',
    reference: 'optional',
    referenceLabel: '商品图（上传后保留商品原样）',
    fields: [
      { id: 'product', label: '商品名称', kind: 'text', required: true, maxLength: 30 },
      { id: 'points', label: '卖点', kind: 'list', maxItems: 3, maxLength: 16 },
      {
        id: 'style',
        label: '风格',
        kind: 'choice',
        options: ['简约白底', '节日促销'],
        defaultValue: '简约白底',
      },
    ],
    outputs: [
      { id: 'main', label: '主图' },
      { id: 'points', label: '卖点图' },
    ],
  },
  {
    id: 'poster',
    label: '活动海报',
    description: '填活动信息，一次出竖版海报、朋友圈方图和横幅',
    reference: 'optional',
    fields: [{ id: 'title', label: '主标题', kind: 'text', required: true, maxLength: 12 }],
    outputs: [{ id: 'portrait', label: '竖版海报' }],
  },
  {
    id: 'background',
    label: '商品换背景',
    description: '上传商品图，商品原样不动，一次出三种构图的新背景',
    reference: 'required',
    referenceLabel: '商品图',
    fields: [{ id: 'scene', label: '新背景', kind: 'text', required: true, maxLength: 40 }],
    outputs: [{ id: 'front', label: '原角度' }],
  },
];

type TestRouteEntry =
  | string
  | { pathname: string; search?: string; state?: Record<string, unknown> | null };

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="当前路由" data-has-state={location.state === null ? 'false' : 'true'}>
      {`${location.pathname}${location.search}`}
    </output>
  );
}

function mockHistoryBatch(batchId: string, prompt: string) {
  return {
    batchId,
    createdAt: '2026-08-29T08:00:00.000Z',
    prompt,
    model: 'gpt-image-2',
    entries: [
      {
        record: {
          id: `${batchId}.png`,
          batchId,
          createdAt: '2026-08-29T08:00:00.000Z',
          prompt,
          model: 'gpt-image-2',
          aspectRatio: '16:9',
          width: 1792,
          height: 1024,
          count: 1,
          resolution: 'standard',
          isPublic: false,
          isFavorite: false,
        },
        imageUrl: `/${batchId}.png`,
      },
    ],
    settings: {
      prompt,
      model: 'gpt-image-2',
      count: 1,
      aspectRatio: '16:9',
      resolution: 'standard',
      isPublic: false,
      referenceIds: [],
    },
  };
}

function renderRoute(entry: TestRouteEntry) {
  return render(<RouteFixture entry={entry} />);
}

function RouteFixture({ entry }: { entry: TestRouteEntry }) {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetGenerationSessionsForTests();
  authMocks.user = {
    id: 'admin',
    email: 'admin@example.com',
    username: 'admin',
    isAdmin: true,
  };
  authMocks.isAuthenticated = true;
  authMocks.isLoading = false;
  historyMocks.batches = [];
  skillMocks.fetchSkillForms.mockResolvedValue(SKILL_FORMS);
  recommendationMocks.items = [];
  showcaseMocks.items = [];
  generation.generate.mockResolvedValue({
    batchId: 'landing-batch',
    aspectRatio: '16:9',
    generationMode: 'text-to-image',
    entries: [
      {
        record: {
          id: 'landing-result.png',
          batchId: 'landing-batch',
          createdAt: '2026-08-03T08:00:00.000Z',
          prompt: '雨夜的未来城市',
          model: 'gpt-image-2',
          aspectRatio: '16:9',
          width: 1792,
          height: 1024,
          count: 2,
          resolution: 'standard',
          isPublic: true,
          isFavorite: false,
        },
        imageUrl: '/landing-result.png',
      },
    ],
  });
});

describe('React application routes', () => {
  it('shows template cards as small thumbnails and falls back to the original', async () => {
    renderRoute('/templates');

    const [image] = await screen.findAllByRole('img', { name: /示例$/ });
    const original = image?.getAttribute('src')?.replace('/thumbs/', '/') ?? '';
    expect(image).toHaveAttribute('src', expect.stringMatching(/\/thumbs\/[^/]+\.webp$/));
    // The first card is a wide one, so sharp screens can still pick the original.
    expect(image).toHaveAttribute('srcset', expect.stringContaining(`${original} `));

    if (image) fireEvent.error(image);
    expect(image?.getAttribute('src')).toMatch(/\/media\/templates\/[^/]+\/[^/]+\.\w+$/);
    expect(image?.getAttribute('src')).not.toContain('/thumbs/');
    expect(original).toContain('/media/templates/');
  });

  it('names templates in Chinese with the English original as a subtitle', async () => {
    const user = userEvent.setup();
    renderRoute('/templates');

    const card = await screen.findByRole('button', { name: '预览模板：亲自然生物科技实验室' });
    expect(card).toHaveTextContent('Biophilic Biotech Lab');

    // The English title still finds the template.
    await user.type(screen.getByRole('searchbox', { name: '搜索创作模板' }), 'Biophilic');
    expect(screen.getAllByRole('button', { name: /预览模板：/ })).toHaveLength(1);
  });

  it('places creation templates between generation and assets in the landing navigation', async () => {
    const { container } = renderRoute('/');
    const navigation = within(await screen.findByRole('navigation', { name: '首页导航' }));
    const productLinks = navigation
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((label) => ['发现', '生图', '创作模板', '资产'].includes(label ?? ''));

    expect(productLinks).toEqual(['发现', '生图', '创作模板', '资产']);
    expect(navigation.getByRole('link', { name: '创作模板' })).toHaveAttribute(
      'href',
      '/templates',
    );
    expect(container.querySelector('.landing-navigation-shell')).toHaveStyle({
      '--sidebar-width-icon': '6.875rem',
    });
    expect(container.querySelector(".landing-sidebar [data-sidebar='separator']")).toBeNull();
  });

  it('opens a skill form from a capsule and can fall back to the example prompt', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    const capsules = await screen.findByRole('group', { name: '常用技能' });
    await user.click(within(capsules).getByRole('button', { name: '电商主图' }));
    const panel = await screen.findByRole('dialog', { name: '电商主图' });

    expect(within(panel).getByLabelText('将生成')).toHaveTextContent('主图卖点图');
    expect(within(panel).getByText('共 2 张 · 消耗 2 额度')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '开始生成' })).toBeDisabled();

    await user.click(within(panel).getByRole('button', { name: '改为自己写提示词' }));

    expect(screen.queryByRole('dialog', { name: '电商主图' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '首页创作提示词' })).toHaveTextContent('限时特惠');
    expect(screen.getByRole('button', { name: '自定义生成参数' })).toHaveTextContent('1:1');
  });

  it('asks for the image a reference-based skill works from before it can start', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    const gallery = await screen.findByRole('region', { name: '技能' });
    await user.click(within(gallery).getByRole('button', { name: '使用技能：商品换背景' }));
    const panel = await screen.findByRole('dialog', { name: '商品换背景' });
    await user.type(within(panel).getByLabelText('新背景'), '海边礁石');
    const start = within(panel).getByRole('button', { name: '开始生成' });

    expect(start).toBeDisabled();
    await user.upload(
      within(panel).getByLabelText('上传商品图'),
      new File(['cup'], 'cup.png', { type: 'image/png' }),
    );

    expect(within(panel).getByRole('img', { name: '已选的参考图' })).toBeInTheDocument();
    expect(start).toBeEnabled();
  });

  it('runs a skill: plans every image, then generates them one by one in a new session', async () => {
    const user = userEvent.setup();
    skillMocks.planSkill.mockResolvedValue({
      title: '电商主图 · 山川绿茶',
      outputs: [
        { id: 'main', label: '主图', aspect: '1:1', prompt: '山川绿茶主图，右下角写着“¥199”' },
        { id: 'points', label: '卖点图', aspect: '3:4', prompt: '山川绿茶卖点图，列出“高山云雾”' },
      ],
    });
    generation.generate.mockImplementation((options: { prompt: string; aspectRatio: string }) => {
      const batchId = `skill-${options.aspectRatio}`;
      return Promise.resolve({
        batchId,
        aspectRatio: options.aspectRatio,
        generationMode: 'text-to-image',
        entries: [
          {
            record: {
              id: `${batchId}.png`,
              batchId,
              createdAt: '2026-10-29T08:00:00.000Z',
              prompt: options.prompt,
              model: 'gpt-image-2',
              aspectRatio: options.aspectRatio,
              width: 1024,
              height: 1024,
              count: 1,
              resolution: 'standard',
              isPublic: false,
            },
            imageUrl: `/${batchId}.png`,
          },
        ],
      });
    });
    renderRoute('/');

    const capsules = await screen.findByRole('group', { name: '常用技能' });
    await user.click(within(capsules).getByRole('button', { name: '电商主图' }));
    const panel = await screen.findByRole('dialog', { name: '电商主图' });
    await user.type(within(panel).getByLabelText('商品名称'), '山川绿茶');
    await user.type(within(panel).getByRole('textbox', { name: '卖点 1' }), '高山云雾');
    await user.click(within(panel).getByRole('radio', { name: '节日促销' }));
    await user.click(within(panel).getByRole('button', { name: '开始生成' }));

    expect(skillMocks.planSkill).toHaveBeenCalledWith(
      'ecommerce',
      { product: '山川绿茶', points: ['高山云雾'], style: '节日促销' },
      false,
    );
    await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(2));
    expect(
      generation.generate.mock.calls.map(([options]) => [
        (options as { prompt: string }).prompt,
        (options as { aspectRatio: string }).aspectRatio,
        (options as { count: number }).count,
      ]),
    ).toEqual([
      ['山川绿茶主图，右下角写着“¥199”', '1:1', 1],
      ['山川绿茶卖点图，列出“高山云雾”', '3:4', 1],
    ]);
    expect(screen.getByLabelText('当前路由')).toHaveTextContent('/generate?session=');
  });

  it('resumes a recent creation from the homepage in its own session', async () => {
    const user = userEvent.setup();
    const session = createGenerationSession('雾中的未来车站');
    attachGenerationBatch(session.id, 'recent-batch', '雾中的未来车站');
    historyMocks.batches = [mockHistoryBatch('recent-batch', '雾中的未来车站')];
    renderRoute('/');

    const recent = await screen.findByRole('navigation', { name: '继续上次创作' });
    await user.click(within(recent).getByRole('button', { name: '继续创作：雾中的未来车站' }));

    await waitFor(() =>
      expect(screen.getByLabelText('当前路由')).toHaveTextContent(
        `/generate?session=${session.id}`,
      ),
    );
  });

  it('greets visitors with a Chinese headline', async () => {
    renderRoute('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: '把想法，变成画面' }),
    ).toBeInTheDocument();
  });

  it('hides recent creations when there is no history', async () => {
    renderRoute('/');
    await screen.findByRole('group', { name: '常用技能' });
    expect(screen.queryByRole('navigation', { name: '继续上次创作' })).not.toBeInTheDocument();
  });

  it('swaps the homepage shortcuts for similar teammate work and reuses its prompt', async () => {
    const user = userEvent.setup();
    recommendationMocks.items = [
      {
        record: {
          id: 'team-tea.png',
          createdAt: '2026-10-28T00:00:00.000Z',
          prompt: '奶茶新品上市海报，清新绿色',
          model: 'gpt-image-2',
          aspectRatio: '3:4',
          width: 1024,
          height: 1360,
          isPublic: false,
          isShared: true,
        },
        ownerName: 'alice',
        reason: '同为海报',
      },
    ];
    renderRoute('/');

    const panel = await screen.findByRole('region', { name: '成果库里相似的作品' });
    expect(screen.queryByRole('group', { name: '常用技能' })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: '用这个提示词' }));

    expect(screen.getByRole('textbox', { name: '首页创作提示词' })).toHaveTextContent(
      '奶茶新品上市海报，清新绿色',
    );
    expect(screen.getByRole('button', { name: '自定义生成参数' })).toHaveTextContent('3:4');
  });

  it('makes a similar image from the library showcase', async () => {
    const user = userEvent.setup();
    showcaseMocks.items = [
      {
        id: 'team-tea.png',
        createdAt: '2026-10-29T00:00:00.000Z',
        prompt: '奶茶新品上市海报，清新绿色',
        model: 'gpt-image-2',
        aspectRatio: '3:4',
        width: 1024,
        height: 1360,
        isPublic: false,
        ownerName: 'alice',
      },
    ];
    renderRoute('/');

    const showcase = await screen.findByRole('region', { name: '成果库精选' });
    await user.click(
      within(showcase).getByRole('button', { name: '做同款：奶茶新品上市海报，清新绿色' }),
    );

    expect(screen.getByRole('textbox', { name: '首页创作提示词' })).toHaveTextContent(
      '奶茶新品上市海报，清新绿色',
    );
    expect(screen.getByRole('button', { name: '自定义生成参数' })).toHaveTextContent('3:4');
  });

  it('polishes the homepage prompt with AI and can undo it', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    const prompt = await screen.findByRole('textbox', { name: '首页创作提示词' });
    await user.type(prompt, '雨夜的未来城市');
    await user.click(screen.getByRole('button', { name: 'AI 润色提示词' }));

    expect(promptMocks.enhancePrompt).toHaveBeenCalledWith('雨夜的未来城市');
    expect(await screen.findByText('雨夜的未来城市，霓虹倒影，电影级广角构图')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '撤销润色' }));
    expect(prompt).toHaveTextContent('雨夜的未来城市');
    expect(prompt).not.toHaveTextContent('霓虹倒影');
  });

  it('suggests 2K on the homepage when the scene brief has a lot of text', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    const capsules = await screen.findByRole('group', { name: '常用技能' });
    await user.click(within(capsules).getByRole('button', { name: '活动海报' }));
    const panel = await screen.findByRole('dialog', { name: '活动海报' });
    await user.click(within(panel).getByRole('button', { name: '改为自己写提示词' }));
    await user.click(screen.getByRole('button', { name: '切换到 2K' }));

    expect(screen.getByRole('button', { name: '自定义生成参数' })).toHaveTextContent('2K');
  });

  it('shows the functional homepage model selector', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    expect(screen.queryByRole('button', { name: /选择模型和推理强度/ })).not.toBeInTheDocument();
    const trigger = await screen.findByRole('button', { name: '选择模型' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('data-beui-pointer-focus');
    expect(screen.getByRole('menuitemradio', { name: 'gpt-image-2.5-flare' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: 'gpt-image-2.5-sunburst' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Nano Banana Pro' })).toBeInTheDocument();
  });

  it('shows the current generation credit cost in the homepage submit action', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    const submit = await screen.findByRole('button', { name: '带着提示词开始创作' });
    expect(submit).toHaveTextContent('1');
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '自定义生成参数' }));
    await user.click(
      within(screen.getByRole('group', { name: '生成张数' })).getByRole('menuitemradio', {
        name: '2 张',
      }),
    );
    expect(submit).toHaveTextContent('2');

    const resolutionGroup = screen.getByRole('group', { name: '清晰度' });
    await user.click(within(resolutionGroup).getByRole('menuitemradio', { name: '2K' }));
    expect(submit).toHaveTextContent('6');
    await user.click(within(resolutionGroup).getByRole('menuitemradio', { name: '4K' }));
    expect(submit).toHaveTextContent('6');
    await user.click(within(resolutionGroup).getByRole('menuitemradio', { name: '1K' }));
    expect(submit).toHaveTextContent('2');

    await user.type(screen.getByRole('textbox', { name: '首页创作提示词' }), '玻璃城市');
    expect(submit).toBeEnabled();
  });

  it('opens the daily check-in surface and claims the reward', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    await user.click(screen.getByRole('button', { name: '个人积分 16，可签到' }));
    expect(screen.getByText('赢取每日灵感值！')).toBeInTheDocument();
    expect(screen.getByText('每日签到可得 5 积分')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '签到' }));

    await waitFor(() => expect(quotaMocks.checkIn).toHaveBeenCalledTimes(1));
    expect(quotaMocks.checkIn).toHaveReturned();
    expect(screen.queryByText(/签到成功/)).not.toBeInTheDocument();
    expect(screen.queryByText('今日已签到。')).not.toBeInTheDocument();
  });

  it('does not show a success toast when checking in from the mobile sidebar', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const user = userEvent.setup();
    renderRoute('/');

    await user.click(screen.getByRole('button', { name: '打开首页菜单' }));
    await user.click(screen.getByRole('button', { name: '签到领 5 积分' }));

    await waitFor(() => expect(quotaMocks.checkIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/签到成功/)).not.toBeInTheDocument();
    expect(screen.queryByText('今日已签到。')).not.toBeInTheDocument();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('keeps the React Bits border glow independent from homepage prompt focus', async () => {
    const user = userEvent.setup();
    const { container } = renderRoute('/');
    const prompt = screen.getByRole('textbox', { name: '首页创作提示词' });

    await user.click(prompt);

    expect(prompt).toHaveFocus();
    const borderGlow = container.querySelector<HTMLElement>('.border-glow-card');
    expect(borderGlow).not.toHaveAttribute('data-glow-active');
    expect(borderGlow?.style.getPropertyValue('--fill-opacity')).toBe('0');
  });

  it('carries a homepage prompt into the generation workspace and starts generation', async () => {
    const user = userEvent.setup();
    const { container } = renderRoute('/');
    const referenceFiles = Array.from(
      { length: 5 },
      (_, index) =>
        new File([`reference-${index + 1}`], `reference-${index + 1}.png`, { type: 'image/png' }),
    );

    await user.click(await screen.findByRole('button', { name: '添加参考图或技能' }));
    await user.click(screen.getByRole('menuitem', { name: '添加参考图' }));
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
    await user.upload(fileInput!, referenceFiles);
    expect(screen.getByText('参考图最多支持 4 张，已保留前 4 张。')).toBeInTheDocument();
    expect(screen.getByText('reference-4.png')).toBeInTheDocument();
    expect(screen.queryByText('reference-5.png')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: '首页创作提示词' }), '雨夜的未来城市');
    await user.click(screen.getByRole('button', { name: '选择模型' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'gpt-image-2.5-sunburst' }));
    await user.click(screen.getByRole('button', { name: '自定义生成参数' }));
    await user.click(
      within(screen.getByRole('group', { name: '质量' })).getByRole('menuitemradio', {
        name: 'xhigh',
      }),
    );
    await user.click(
      within(screen.getByRole('group', { name: '画面比例' })).getByRole('menuitemradio', {
        name: '16:9',
      }),
    );
    await user.click(
      within(screen.getByRole('group', { name: '生成张数' })).getByRole('menuitemradio', {
        name: '2 张',
      }),
    );
    await user.click(
      within(screen.getByRole('group', { name: '清晰度' })).getByRole('menuitemradio', {
        name: '2K',
      }),
    );
    expect(screen.queryByRole('switch', { name: '发布到发现页' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '带着提示词开始创作' }));

    expect(await screen.findByRole('region', { name: '图像生成工作区' })).toBeInTheDocument();
    await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(1));
    expect(generation.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '雨夜的未来城市',
        model: 'gpt-image-2.5-sunburst',
        aspectRatio: '16:9',
        count: 2,
        resolution: '2k',
        quality: 'xhigh',
        referenceFiles: referenceFiles.slice(0, 4),
      }),
    );
    expect(generation.generate.mock.calls[0]?.[0]).not.toHaveProperty('isPublic');
    expect(screen.getByRole('region', { name: '本次创作结果' })).toHaveTextContent(
      '雨夜的未来城市',
    );
    expect(screen.getByRole('button', { name: '自定义生成参数' })).toHaveTextContent('16:9');
    expect(screen.getByRole('button', { name: '自定义生成参数' })).toHaveTextContent('2K');
    expect(screen.getByRole('button', { name: '自定义生成参数' })).toHaveTextContent('xhigh');
    expect(screen.getByRole('status', { name: '2 张' })).toBeInTheDocument();
  });

  it('opens and closes the shadcn mobile sidebar', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const user = userEvent.setup();
    renderRoute('/');

    const openMenu = screen.getByRole('button', { name: '打开首页菜单' });
    await user.click(openMenu);

    expect(screen.getByRole('navigation', { name: '首页导航' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭首页菜单' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭首页菜单' }));
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: '首页导航' })).not.toBeInTheDocument();
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('keeps the generation route and its operational controls', async () => {
    renderRoute('/generate');
    const workspace = await screen.findByRole(
      'region',
      { name: '图像生成工作区' },
      { timeout: 5_000 },
    );
    const generate = within(workspace);
    expect(generate.getByRole('button', { name: '选择模型' })).toHaveTextContent('gpt-image-2');
    expect(generate.getByLabelText('今日生成额度')).toBeInTheDocument();
    expect(generate.getByRole('button', { name: '自定义生成参数' })).toBeInTheDocument();
    expect(generate.getByRole('button', { name: /生成图片/ })).toBeInTheDocument();
    expect(workspace).toHaveClass('is-empty');
    expect(generate.queryByRole('region', { name: '本次创作结果' })).not.toBeInTheDocument();
  });

  it('uses the discovery navigation state without the workspace session controls', () => {
    renderRoute('/generate');

    const navigation = screen.getByRole('navigation', { name: '首页导航' });
    expect(within(navigation).getByRole('link', { name: '生图' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('region', { name: '最近会话' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '新建生成' })).not.toBeInTheDocument();
  });

  it('keeps generated results when submitting multiple prompts in the active session', async () => {
    generation.generate
      .mockResolvedValueOnce({
        batchId: 'session-a-batch',
        aspectRatio: '1:1',
        generationMode: 'text-to-image',
        entries: [
          {
            record: {
              id: 'session-a.png',
              batchId: 'session-a-batch',
              createdAt: '2026-08-04T09:00:00.000Z',
              prompt: '橙色机械城市',
              model: 'gpt-image-2',
              aspectRatio: '1:1',
              width: 1024,
              height: 1024,
              count: 1,
              resolution: 'standard',
              isPublic: false,
              isFavorite: false,
            },
            imageUrl: '/session-a.png',
          },
        ],
      })
      .mockResolvedValueOnce({
        batchId: 'session-b-batch',
        aspectRatio: '1:1',
        generationMode: 'text-to-image',
        entries: [
          {
            record: {
              id: 'session-b.png',
              batchId: 'session-b-batch',
              createdAt: '2026-08-04T09:01:00.000Z',
              prompt: '蓝色玻璃森林',
              model: 'gpt-image-2',
              aspectRatio: '1:1',
              width: 1024,
              height: 1024,
              count: 1,
              resolution: 'standard',
              isPublic: false,
              isFavorite: false,
            },
            imageUrl: '/session-b.png',
          },
        ],
      });
    const user = userEvent.setup();
    renderRoute('/generate');

    await user.type(screen.getByRole('textbox', { name: '图像提示词' }), '橙色机械城市');
    await user.click(screen.getByRole('button', { name: '生成图片' }));
    expect(await screen.findByRole('button', { name: '查看图片：橙色机械城市' })).toBeVisible();

    const promptInput = screen.getByRole('textbox', { name: '图像提示词' });
    await user.clear(promptInput);
    await user.type(promptInput, '蓝色玻璃森林');
    await user.click(screen.getByRole('button', { name: '生成图片' }));
    expect(await screen.findByRole('button', { name: '查看图片：蓝色玻璃森林' })).toBeVisible();
    expect(screen.getByRole('button', { name: '查看图片：橙色机械城市' })).toBeVisible();
  });

  it('restores the last viewed generation session after navigating away and back', async () => {
    const session = createGenerationSession('雾中的未来车站');
    attachGenerationBatch(session.id, 'route-return-batch', '雾中的未来车站');
    createGenerationSession('另一个更晚创建的会话');
    historyMocks.batches = [mockHistoryBatch('route-return-batch', '雾中的未来车站')];
    const user = userEvent.setup();
    renderRoute(`/generate?session=${session.id}`);

    expect(await screen.findByRole('button', { name: '查看图片：雾中的未来车站' })).toBeVisible();

    await user.click(
      within(screen.getByRole('navigation', { name: '首页导航' })).getByRole('link', {
        name: '创作模板',
      }),
    );
    expect(await screen.findByRole('region', { name: '创作模板' })).toBeVisible();

    await user.click(
      within(screen.getByRole('navigation', { name: '首页导航' })).getByRole('link', {
        name: '生图',
      }),
    );

    expect(await screen.findByRole('button', { name: '查看图片：雾中的未来车站' })).toBeVisible();
    expect(screen.getByLabelText('当前路由')).toHaveTextContent(`/generate?session=${session.id}`);
  });

  it('keeps the remembered generation session across browser tabs', async () => {
    const session = createGenerationSession('跨标签页保留的会话');
    attachGenerationBatch(session.id, 'cross-tab-batch', '跨标签页保留的会话');
    rememberGenerationSession('admin', session.id);
    window.sessionStorage.clear();
    historyMocks.batches = [mockHistoryBatch('cross-tab-batch', '跨标签页保留的会话')];

    renderRoute('/generate');

    expect(
      await screen.findByRole('button', { name: '查看图片：跨标签页保留的会话' }),
    ).toBeVisible();
    expect(screen.getByLabelText('当前路由')).toHaveTextContent(`/generate?session=${session.id}`);
  });

  it('migrates a legacy tab-scoped remembered session to persistent storage', async () => {
    const session = createGenerationSession('旧版标签页会话');
    attachGenerationBatch(session.id, 'legacy-tab-batch', '旧版标签页会话');
    window.sessionStorage.setItem(
      'nebulens-active-generation-session-by-user-v1',
      JSON.stringify({ admin: session.id }),
    );
    historyMocks.batches = [mockHistoryBatch('legacy-tab-batch', '旧版标签页会话')];

    renderRoute('/generate');

    expect(await screen.findByRole('button', { name: '查看图片：旧版标签页会话' })).toBeVisible();
    expect(
      JSON.parse(
        window.localStorage.getItem('nebulens-active-generation-session-by-user-v1') ?? '{}',
      ),
    ).toMatchObject({ admin: session.id });
    expect(
      window.sessionStorage.getItem('nebulens-active-generation-session-by-user-v1'),
    ).toBeNull();
  });

  it('rebuilds a generation session from server history when browser indexes are missing', async () => {
    historyMocks.batches = [mockHistoryBatch('server-history-batch', '服务端保留的历史')];

    renderRoute('/generate');

    expect(await screen.findByRole('button', { name: '查看图片：服务端保留的历史' })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText('当前路由').textContent).toMatch(/^\/generate\?session=/),
    );
    const stored = JSON.parse(
      window.localStorage.getItem('nebulens-generation-sessions-v1') ?? '[]',
    ) as Array<{ batchIds?: string[] }>;
    expect(stored[0]?.batchIds).toEqual(['server-history-batch']);
  });

  it('restores server history after the same account logs out and back in', async () => {
    const view = renderRoute('/generate');
    expect(
      await screen.findByRole('region', { name: '图像生成工作区' }, { timeout: 3000 }),
    ).toBeVisible();

    act(() => {
      authMocks.user = null;
      authMocks.isAuthenticated = false;
    });
    view.rerender(<RouteFixture entry="/generate" />);

    act(() => {
      authMocks.user = {
        id: 'admin',
        email: 'admin@example.com',
        username: 'admin',
        isAdmin: true,
      };
      authMocks.isAuthenticated = true;
      historyMocks.batches = [mockHistoryBatch('relogin-batch', '重新登录后的历史')];
    });
    view.rerender(<RouteFixture entry="/generate" />);

    expect(await screen.findByRole('button', { name: '查看图片：重新登录后的历史' })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText('当前路由').textContent).toMatch(/^\/generate\?session=/),
    );
  });

  it('does not replace a prompt handoff with a remembered session', () => {
    const session = createGenerationSession('旧会话');
    attachGenerationBatch(session.id, 'old-batch', '旧会话');
    rememberGenerationSession('admin', session.id);
    historyMocks.batches = [mockHistoryBatch('old-batch', '旧会话')];

    renderRoute('/generate?prompt=%E6%96%B0%E7%9A%84%E5%88%9B%E4%BD%9C');

    expect(screen.getByLabelText('当前路由')).toHaveTextContent(
      '/generate?prompt=%E6%96%B0%E7%9A%84%E5%88%9B%E4%BD%9C',
    );
    expect(screen.getByRole('textbox', { name: '图像提示词' })).toHaveTextContent('新的创作');
    expect(screen.queryByRole('button', { name: '查看图片：旧会话' })).not.toBeInTheDocument();
  });

  it('starts a real automatic generation entry instead of restoring a remembered session', async () => {
    const session = createGenerationSession('旧会话');
    attachGenerationBatch(session.id, 'old-batch', '旧会话');
    rememberGenerationSession('admin', session.id);
    historyMocks.batches = [mockHistoryBatch('old-batch', '旧会话')];

    renderRoute({
      pathname: '/generate',
      search:
        '?prompt=%E8%87%AA%E5%8A%A8%E7%94%9F%E6%88%90%E7%9A%84%E6%96%B0%E7%94%BB%E9%9D%A2&aspect=16%3A9&count=1&isPublic=false',
      state: { autoGenerate: true },
    });

    await waitFor(() => expect(generation.generate).toHaveBeenCalledTimes(1));
    expect(generation.generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: '自动生成的新画面' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('当前路由').textContent).toMatch(/^\/generate\?session=/),
    );
    expect(screen.getByLabelText('当前路由')).not.toHaveTextContent(session.id);
    // The new session only shows its own batches; the old one stays in history.
    expect(screen.queryByRole('button', { name: '查看图片：旧会话' })).not.toBeInTheDocument();
  });

  it('does not restore a remembered session for a state-only automatic entry', async () => {
    const session = createGenerationSession('旧会话');
    attachGenerationBatch(session.id, 'old-batch', '旧会话');
    rememberGenerationSession('admin', session.id);
    historyMocks.batches = [mockHistoryBatch('old-batch', '旧会话')];

    renderRoute({ pathname: '/generate', state: { autoGenerate: true } });

    await waitFor(() =>
      expect(screen.getByLabelText('当前路由')).toHaveAttribute('data-has-state', 'false'),
    );
    expect(screen.getByLabelText('当前路由')).toHaveTextContent(/^\/generate$/);
    expect(generation.generate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '查看图片：旧会话' })).not.toBeInTheDocument();
  });

  it('does not restore after the bare route has already been initialized', async () => {
    renderRoute('/generate');

    act(() => {
      historyMocks.batches = [mockHistoryBatch('late-batch', '另一标签页的会话')];
      const session = createGenerationSession('另一标签页的会话');
      attachGenerationBatch(session.id, 'late-batch', '另一标签页的会话');
      rememberGenerationSession('admin', session.id);
    });

    await waitFor(() =>
      expect(screen.getByLabelText('当前路由')).toHaveTextContent(/^\/generate$/),
    );
    expect(
      screen.queryByRole('button', { name: '查看图片：另一标签页的会话' }),
    ).not.toBeInTheDocument();
  });

  it('recovers current history instead of a session remembered by another account', async () => {
    const session = createGenerationSession('账号 A 的会话');
    attachGenerationBatch(session.id, 'account-a-batch', '账号 A 的会话');
    rememberGenerationSession('account-a', session.id);
    historyMocks.batches = [mockHistoryBatch('admin-batch', '当前账号的历史')];

    renderRoute('/generate');

    expect(await screen.findByRole('button', { name: '查看图片：当前账号的历史' })).toBeVisible();
    expect(screen.getByLabelText('当前路由')).not.toHaveTextContent(session.id);
    expect(
      screen.queryByRole('button', { name: '查看图片：账号 A 的会话' }),
    ).not.toBeInTheDocument();
  });

  it('keeps session management hidden while preserving the generation workspace', () => {
    renderRoute('/generate');

    expect(screen.queryByRole('alertdialog', { name: '删除历史会话' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '最近会话' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '新建生成' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '图像生成工作区' })).toHaveClass('is-empty');
  });

  it('automatically names a new session from its first generation prompt', async () => {
    const user = userEvent.setup();
    renderRoute('/generate');

    await user.type(screen.getByRole('textbox', { name: '图像提示词' }), '薄雾中的未来海港');
    await user.click(screen.getByRole('button', { name: '生成图片' }));

    await screen.findByRole('button', { name: '生成图片' });
    expect(generation.generate).toHaveBeenCalledTimes(1);
  });

  it('opens the creation template library and carries a template into generation', async () => {
    const user = userEvent.setup();
    renderRoute('/templates');

    expect(await screen.findByRole('region', { name: '创作模板' })).toHaveClass('workspace-page');
    const templatesTitle = screen.getByRole('heading', { level: 1, name: '创作模板' });
    expect(templatesTitle.closest('header')).toHaveClass('operational-page-header');
    expect(within(templatesTitle.closest('header')!).getByText('163 个模板')).toHaveClass(
      'operational-page-header__meta',
    );
    expect(screen.queryByText('NEBULENS / LIBRARY')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '搜索创作模板' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(24);
    while (screen.queryByRole('button', { name: '加载更多' })) {
      await user.click(screen.getByRole('button', { name: '加载更多' }));
    }
    expect(screen.getAllByRole('article')).toHaveLength(163);
    const templateImages = within(screen.getByRole('region', { name: '创作模板' })).getAllByRole(
      'img',
    );
    expect(templateImages).toHaveLength(163);
    expect(new Set(templateImages.map((image) => image.getAttribute('src'))).size).toBe(163);
    templateImages.forEach((image) => {
      expect(image).toHaveAttribute(
        'src',
        expect.stringMatching(/^\/media\/templates\/gpt-image2\//),
      );
    });
    const templateCategories = screen
      .getAllByRole('article')
      .map((card) => card.querySelector('small')?.textContent);
    expect(templateCategories.slice(0, 12).every((value) => value !== '动漫漫画')).toBe(true);
    expect(templateCategories.slice(-12).every((value) => value === '动漫漫画')).toBe(true);

    await user.click(screen.getByRole('button', { name: '模板排序' }));
    await user.click(screen.getByRole('menuitemradio', { name: '名称排序' }));
    expect(screen.getAllByRole('button', { name: /预览模板：/ })[0]).toHaveAccessibleName(
      '预览模板：《潮汐兄弟》19 页漫画样张',
    );
    await user.click(screen.getByRole('button', { name: '模板排序' }));
    await user.click(screen.getByRole('menuitemradio', { name: '精选排序' }));

    await user.click(screen.getAllByRole('button', { name: /预览模板：/ })[0]!);
    const preview = await screen.findByRole('dialog');
    expect(screen.getByRole('region', { name: '创作模板' })).not.toContainElement(preview);
    const previewImage = within(preview).getByRole('img');
    const width = Number(previewImage.getAttribute('width'));
    const height = Number(previewImage.getAttribute('height'));
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(preview.style.getPropertyValue('--template-image-ratio')).toBe(String(width / height));
    await waitFor(() =>
      expect(within(preview).getByRole('button', { name: '关闭模板预览' })).toHaveFocus(),
    );
    await user.click(within(preview).getByRole('button', { name: '使用模板' }));
    // The generate route loads lazily, so wait for it rather than assuming it is cached.
    expect(await screen.findByRole('region', { name: '图像生成工作区' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '图像提示词' })).toHaveTextContent(
      'Generate a high-end photorealistic render of a future-facing biotech laboratory',
    );
    expect(screen.getByRole('button', { name: '自定义生成参数' })).toHaveTextContent('16:9');
    expect(screen.getByRole('status', { name: '1 张' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '发布到发现页' })).not.toBeInTheDocument();
    expect(generation.generate).not.toHaveBeenCalled();
  }, 10_000);

  it('keeps history and admin routes', async () => {
    const history = renderRoute('/history');
    expect(await screen.findByRole('region', { name: '个人资产' })).toHaveClass('workspace-page');
    expect(screen.getByRole('heading', { level: 1, name: '资产' }).closest('header')).toHaveClass(
      'operational-page-header',
    );
    history.unmount();
    renderRoute('/admin/users');
    await screen.findByRole('region', { name: '用户管理' });
    expect(
      screen.getByRole('heading', { level: 1, name: '用户管理' }).closest('header'),
    ).toHaveClass('operational-page-header');
    expect(screen.getByRole('region', { name: '用户管理' })).toHaveClass('workspace-page');
    expect(screen.getByRole('button', { name: '创建用户' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('form', { name: '创建新用户' })).not.toBeInTheDocument();
  });
});
