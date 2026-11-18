import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { AgentThread } from '@/components/agent/AgentThread';
import type { AgentTurn } from '@/hooks/useAgentConversation';
import type {
  AspectRatio,
  GenerationSettingsSnapshot,
  HistoryEntry,
  TextCheckResult,
} from '@/types/image';
import { agentSets } from '@/utils/agentSets';
import type { FeedItem } from '@/utils/generationFeed';

const MADE_AT = new Date().toISOString();

function settings(prompt: string, aspectRatio: AspectRatio): GenerationSettingsSnapshot {
  return {
    prompt,
    model: 'gpt-image-2',
    count: 1,
    aspectRatio,
    resolution: 'standard',
    isPublic: false,
    referenceIds: [],
  };
}

function entry(id: string, record: Partial<HistoryEntry['record']> = {}): HistoryEntry {
  return {
    record: {
      id,
      createdAt: MADE_AT,
      prompt: '山水氛围，没有文字',
      model: 'gpt-image-2',
      width: 1024,
      height: 1024,
      isPublic: false,
      ...record,
    },
    imageUrl: `/api/outputs/${id}`,
  };
}

function item(id: string, entries: HistoryEntry[], aspect: AspectRatio): FeedItem {
  return { id, createdAt: MADE_AT, entries, settings: settings(id, aspect) };
}

const POSTER = '竖版主海报，标题“山柚观音”，副标题“冷泡系列”';
const LIGHTBOX = '地铁灯箱，写“新品上市”';
const PASSED: TextCheckResult = { status: 'passed', segments: [] };
const WRONG: TextCheckResult = {
  status: 'issues',
  segments: [{ text: '新品上市', found: '新吕上市', ok: false }],
};

function turn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: 'turn-1',
    createdAt: MADE_AT,
    brief: '山柚观音下周上新，出一套物料',
    references: [],
    status: 'done',
    thinkingMs: 1200,
    chosenSkill: null,
    planningMs: 3500,
    planTitle: '山柚观音上新',
    plan: {
      skillLabel: '山柚观音上新',
      steps: [
        { label: '主海报', settings: settings(POSTER, '3:4') },
        { label: '地铁灯箱', settings: settings(LIGHTBOX, '3:4') },
        { label: '氛围图', settings: settings('山水氛围', '3:4') },
      ],
    },
    plannedCount: 3,
    started: 3,
    failed: 0,
    batchIds: ['batch-1', 'batch-2', 'batch-3'],
    batchLabels: { 'batch-1': '主海报', 'batch-2': '地铁灯箱', 'batch-3': '氛围图' },
    notes: [],
    ...overrides,
  };
}

function renderThread(turns: AgentTurn[], feed: FeedItem[]) {
  const props = {
    busy: false,
    planBudget: () => ({ label: '预计 3 积分', isPrivate: false }),
    examples: [],
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onRemoveStep: vi.fn(),
    onRetry: vi.fn(),
    onReveal: vi.fn(),
    onRevealPiece: vi.fn(),
    onDownloadSet: vi.fn(),
    onSuggest: vi.fn(),
    onExample: vi.fn(),
  };
  const sets = new Map(agentSets(turns, feed).map((set) => [set.turnId, set]));
  render(<AgentThread turns={turns} sets={sets} {...props} />);
  return props;
}

it('delivers a set piece by piece, with each picture’s words, shape and text check', async () => {
  const user = userEvent.setup();
  const done = turn({ redraws: { 'batch-4': 'b.png' } });
  const props = renderThread(
    [done],
    [
      item('batch-1', [entry('a.png', { prompt: POSTER, textCheck: PASSED })], '3:4'),
      item('batch-2', [entry('b.png', { prompt: LIGHTBOX, textCheck: WRONG })], '3:4'),
      item('batch-3', [entry('c.png')], '3:4'),
      item('batch-4', [entry('d.png', { prompt: '请只修改图中的文字', textCheck: PASSED })], '3:4'),
    ],
  );

  const steps = screen.getByRole('list', { name: 'Agent 的步骤' });
  expect(steps).toHaveTextContent('按需求自己规划画面');
  expect(steps).toHaveTextContent('核对了 2 张图上的文字，1 张写错已重画');

  const delivery = screen.getByRole('region', { name: '交付清单' });
  expect(delivery).toHaveTextContent('山柚观音上新3 件');
  const rows = within(delivery).getAllByRole('button', { name: /^(主海报|地铁灯箱|氛围图)/ });
  expect(rows.map((row) => row.textContent)).toEqual([
    '主海报3:4图上文字山柚观音 · 冷泡系列文字无误',
    // The redraw stands in for the picture whose text it fixed.
    '地铁灯箱3:4图上文字新品上市重画后无误',
    '氛围图3:4',
  ]);
  await user.click(rows[1] as HTMLElement);
  expect(props.onRevealPiece).toHaveBeenCalledWith('d.png');

  await user.click(within(delivery).getByRole('button', { name: '下载整套' }));
  expect(props.onDownloadSet).toHaveBeenCalledWith(done);
  await user.click(within(delivery).getByRole('button', { name: '在画布上查看' }));
  expect(props.onReveal).toHaveBeenCalledWith(done);

  // Every piece is upright, so the set lacks a banner and a square.
  const next = screen.getByRole('group', { name: '接着可以' });
  expect(
    within(next)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['补一张横版 Banner', '补一张方图', '换个配色再出一套']);
  await user.click(within(next).getByRole('button', { name: '补一张方图' }));
  expect(props.onSuggest).toHaveBeenCalledWith(
    done,
    '按这一套的风格和文字，补一张方图（1:1），发社媒用',
  );
});

it('shows the pieces still to come and the checks still running while a request runs', () => {
  const running = turn({
    status: 'running',
    plan: {
      skillLabel: '电商主图',
      steps: [
        { label: '卖点长图', settings: settings('长图写“冷萃上新”', '3:4') },
        { label: '方图', settings: settings('方图', '1:1') },
        { label: '横版', settings: settings('横版', '16:9') },
      ],
    },
    planTitle: '冷萃上新',
    batchIds: ['batch-1'],
    batchLabels: { 'batch-1': '卖点长图' },
  });
  renderThread(
    [running],
    [
      item(
        'batch-1',
        [entry('a.png', { prompt: '长图写“冷萃上新”', analysisStatus: 'pending' })],
        '3:4',
      ),
      item('pending-1', [], '1:1'),
    ],
  );

  const check = within(screen.getByRole('list', { name: 'Agent 的步骤' })).getByText(
    '正在核对图上的文字…',
  );
  expect(check.closest('.agent-step')).toHaveAttribute('data-state', 'active');
  const delivery = screen.getByRole('region', { name: '交付清单' });
  expect(delivery).toHaveTextContent('冷萃上新1/3 件');
  expect(delivery).toHaveTextContent('卖点长图3:4图上文字冷萃上新核对文字中');
  expect(delivery).toHaveTextContent('方图1:1生成中');
  expect(delivery).toHaveTextContent('横版16:9排队中');
  expect(screen.queryByRole('group', { name: '接着可以' })).not.toBeInTheDocument();
});

it('says plainly when a check found wrong text that no redraw has fixed', () => {
  renderThread(
    [turn({ batchIds: ['batch-2'], batchLabels: { 'batch-2': '地铁灯箱' } })],
    [item('batch-2', [entry('b.png', { prompt: LIGHTBOX, textCheck: WRONG })], '3:4')],
  );

  const step = within(screen.getByRole('list', { name: 'Agent 的步骤' })).getByText(
    '核对了 1 张图上的文字，1 张有误',
  );
  expect(step.closest('.agent-step')).toHaveAttribute('data-state', 'error');
  const delivery = screen.getByRole('region', { name: '交付清单' });
  expect(within(delivery).getByText('文字有误')).toHaveAttribute(
    'title',
    '“新品上市”被写成了“新吕上市”',
  );
  // Pieces the board no longer shows are told as not made, once the request has ended.
  expect(delivery).toHaveTextContent('主海报3:4图上文字山柚观音 · 冷泡系列没有生成成功');
});
