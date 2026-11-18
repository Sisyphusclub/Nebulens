import { describe, expect, it } from 'vitest';

import type { AgentTurn } from '@/hooks/useAgentConversation';
import type { AspectRatio, GenerationSettingsSnapshot, HistoryEntry } from '@/types/image';
import { agentSets, pieceCheck, setFileName } from '@/utils/agentSets';
import type { FeedItem } from '@/utils/generationFeed';

const MADE_AT = '2026-11-17T08:00:00.000Z';
const NOW = Date.parse('2026-11-17T08:01:00.000Z');

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
      prompt: '画面里没有字',
      model: 'gpt-image-2',
      width: 1024,
      height: 1024,
      isPublic: false,
      ...record,
    },
    imageUrl: `/api/outputs/${id}`,
  };
}

function item(id: string, entries: HistoryEntry[], prompt: string, aspect: AspectRatio): FeedItem {
  return { id, createdAt: MADE_AT, entries, settings: settings(prompt, aspect) };
}

function turn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: 'turn-1',
    createdAt: MADE_AT,
    brief: '山柚观音下周上新，出一套物料',
    references: [],
    status: 'done',
    planTitle: '山柚观音上新',
    plan: {
      skillLabel: '活动海报',
      steps: [
        { label: '主海报', settings: settings('主海报提示词', '3:4') },
        { label: '方图', settings: settings('方图提示词', '1:1') },
      ],
    },
    started: 2,
    failed: 0,
    batchIds: ['batch-1', 'batch-2'],
    batchLabels: { 'batch-1': '主海报', 'batch-2': '方图' },
    notes: [],
    ...overrides,
  };
}

const FEED = [
  item('batch-1', [entry('a.png')], '主海报提示词（服务端改写过）', '3:4'),
  item('batch-2', [entry('b.png')], '方图提示词（服务端改写过）', '1:1'),
];

describe('agentSets', () => {
  it('names each picture after the planned piece it is, with the shape it was asked for', () => {
    const [set] = agentSets([turn()], FEED, NOW);

    expect(set).toMatchObject({
      turnId: 'turn-1',
      title: '山柚观音上新',
      planned: 2,
      running: false,
      keys: ['a.png', 'b.png'],
    });
    expect(set?.pieces.map(({ key, label, aspect }) => [key, label, aspect])).toEqual([
      ['a.png', '主海报', '3:4'],
      ['b.png', '方图', '1:1'],
    ]);
    expect(set?.finals.map((piece) => piece.key)).toEqual(['a.png', 'b.png']);
  });

  it('names pictures of requests kept from before batches were named by their prompt', () => {
    const feed = [
      item('batch-1', [entry('a.png')], '主海报提示词', '3:4'),
      item('batch-2', [entry('b.png')], '方图提示词', '1:1'),
    ];
    const old = turn({ batchIds: ['batch-2', 'batch-1'] });
    delete old.batchLabels;

    expect(agentSets([old], feed, NOW)[0]?.pieces.map((piece) => piece.label)).toEqual([
      '方图',
      '主海报',
    ]);
  });

  it('covers the pictures being made while its request runs, and leaves out other requests', () => {
    const pending = item('pending-1', [], '方图提示词', '1:1');
    const sets = agentSets(
      [
        turn({ id: 'turn-0', batchIds: [], planTitle: '别的请求' }),
        turn({ status: 'running', batchIds: ['batch-1'], started: 2 }),
      ],
      [FEED[0] as FeedItem, pending],
      NOW,
    );

    // A request whose pictures are not on the board has no set to frame.
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ running: true, keys: ['a.png', 'pending-1#0'] });
    expect(sets[0]?.finals).toHaveLength(1);
  });

  it('puts a redraw in place of the picture whose text it fixes', () => {
    const issues = {
      status: 'issues' as const,
      segments: [{ text: '新品上市', found: '新吕上市', ok: false }],
    };
    const feed = [
      item('batch-1', [entry('a.png')], '主海报提示词', '3:4'),
      item('batch-2', [entry('b.png', { textCheck: issues })], '方图提示词', '1:1'),
      item('batch-3', [entry('c.png')], '请只修改图中的文字', '1:1'),
    ];
    const [set] = agentSets([turn({ redraws: { 'batch-3': 'b.png' } })], feed, NOW);

    expect(
      set?.pieces.map(({ key, label, check, redrawOf }) => [key, label, check, redrawOf]),
    ).toEqual([
      ['a.png', '主海报', 'none', undefined],
      ['b.png', '方图', 'redrawn', undefined],
      ['c.png', '方图', 'none', 'b.png'],
    ]);
    expect(set?.pieces[1]?.issues).toEqual(['“新品上市”被写成了“新吕上市”']);
    expect(set?.finals.map((piece) => piece.key)).toEqual(['a.png', 'c.png']);
    expect(set?.keys).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('covers the failure card of a piece that could not be made, in the set it was planned for', () => {
    const failed: FeedItem = {
      ...item('pending-failed', [], '方图提示词', '1:1'),
      createdAt: '2026-11-17T08:00:30.000Z',
      error: '上游超时',
    };
    const elsewhere: FeedItem = {
      ...item('pending-other', [], '别的提示词', '1:1'),
      error: '失败',
    };
    const earlier = turn({
      id: 'turn-0',
      createdAt: '2026-11-17T07:00:00.000Z',
      batchIds: ['batch-0'],
      batchLabels: { 'batch-0': '主海报' },
    });
    const latest = turn({ batchIds: ['batch-1'], batchLabels: { 'batch-1': '主海报' }, failed: 1 });
    const feed = [
      item('batch-0', [entry('z.png')], '主海报提示词', '3:4'),
      FEED[0] as FeedItem,
      failed,
      elsewhere,
    ];

    const sets = agentSets([earlier, latest], feed, NOW);

    // The same plan was sent twice; the card belongs to the request that was running then.
    expect(sets.map((set) => [set.turnId, set.keys])).toEqual([
      ['turn-0', ['z.png']],
      ['turn-1', ['a.png', 'pending-failed#0']],
    ]);
    expect(sets[1]?.finals.map((piece) => piece.key)).toEqual(['a.png']);
  });

  it('makes no set of a request whose pieces all failed', () => {
    const failed: FeedItem = { ...item('pending-failed', [], '方图提示词', '1:1'), error: '失败' };

    expect(agentSets([turn({ batchIds: [], batchLabels: {}, failed: 2 })], [failed], NOW)).toEqual(
      [],
    );
  });
});

describe('pieceCheck', () => {
  const quoted = '海报上写着“新品上市”';

  it('reads the verdict, or where the check stands without one', () => {
    const passed = { status: 'passed' as const, segments: [] };
    expect(pieceCheck(entry('a', { prompt: quoted, textCheck: passed }), false, NOW)).toBe(
      'passed',
    );
    expect(pieceCheck(entry('a', { prompt: quoted, analysisStatus: 'pending' }), false, NOW)).toBe(
      'checking',
    );
    expect(pieceCheck(entry('a', { prompt: quoted, analysisStatus: 'failed' }), false, NOW)).toBe(
      'unchecked',
    );
    // Nothing quoted means nothing to check; neither does a check that never came back.
    expect(pieceCheck(entry('a', { analysisStatus: 'pending' }), false, NOW)).toBe('none');
    const later = NOW + 10 * 60_000;
    expect(
      pieceCheck(entry('a', { prompt: quoted, analysisStatus: 'pending' }), false, later),
    ).toBe('none');
  });
});

describe('setFileName', () => {
  it('names a picture after its set and its place in it, in characters files can carry', () => {
    expect(setFileName({ title: '山柚观音 / 上新' }, 0, '主海报')).toBe(
      '山柚观音-上新-1-主海报.png',
    );
  });
});
