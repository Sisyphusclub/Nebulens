import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AgentCanvas } from '@/components/agent/AgentCanvas';
import type { HistoryEntry } from '@/types/image';
import { boardSlots, type Point } from '@/utils/canvasLayout';
import type { FeedItem } from '@/utils/generationFeed';

// jsdom has no PointerEvent; a mouse event carries the button, position and keys a canvas reads.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
Object.defineProperty(window, 'PointerEvent', { configurable: true, value: TestPointerEvent });

function entry(id: string): HistoryEntry {
  return {
    record: {
      id,
      createdAt: '2026-11-16T08:00:00.000Z',
      prompt: `提示词 ${id}`,
      model: 'gpt-image-2',
      width: 1024,
      height: 1024,
      isPublic: false,
      isFavorite: false,
    },
    imageUrl: `/api/outputs/${id}`,
  };
}

function item(id: string, entries: HistoryEntry[], overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    createdAt: '2026-11-16T08:00:00.000Z',
    entries,
    settings: {
      prompt: id,
      model: 'gpt-image-2',
      count: 1,
      aspectRatio: '1:1',
      resolution: 'standard',
      isPublic: false,
      referenceIds: [],
    },
    ...overrides,
  };
}

const feed = [
  item('batch-a', [entry('a.png'), entry('b.png')]),
  item('pending-1', []),
  item('failed-1', [], { error: '上游失败（请求编号：req-9）' }),
];
const positions: Record<string, Point> = {
  'a.png': { x: 0, y: 0 },
  'b.png': { x: 344, y: 0 },
  'pending-1#0': { x: 0, y: 344 },
  'failed-1#0': { x: 344, y: 344 },
};

function renderCanvas(overrides: Partial<ComponentProps<typeof AgentCanvas>> = {}) {
  const props: ComponentProps<typeof AgentCanvas> = {
    sessionKey: 'session-1',
    slots: boardSlots(feed),
    positions,
    placed: { keys: [], serial: 0 },
    focus: null,
    selection: [],
    onSelectionChange: vi.fn(),
    onMove: vi.fn(),
    onOpen: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
    insetLeft: 0,
    insetBottom: 0,
    empty: <span>还没有图</span>,
    ...overrides,
  };
  const view = render(<AgentCanvas {...props} />);
  return { ...view, props, canvas: screen.getByRole('region', { name: '画布' }) };
}

const picture = (id: string) => screen.getByRole('button', { name: `画布图片：提示词 ${id}` });

function press(target: Element, canvas: Element, init: PointerEventInit = {}) {
  fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10, ...init });
  fireEvent.pointerUp(canvas, { button: 0, clientX: 10, clientY: 10, ...init });
}

describe('AgentCanvas', () => {
  it('draws pictures, pictures being made and failed batches where the board placed them', () => {
    const { props } = renderCanvas();

    expect(picture('a.png')).toHaveStyle({
      left: '0px',
      top: '0px',
      width: '320px',
      height: '320px',
    });
    expect(picture('b.png')).toHaveStyle({ left: '344px' });
    expect(screen.getByRole('img', { name: '正在生成的图片' })).toHaveTextContent('正在生成');
    const failed = screen.getByRole('group', { name: '生成失败的图片' });
    // The request id stays out of the card; it is for support, not for reading.
    expect(failed).toHaveTextContent('上游失败');
    expect(failed).not.toHaveTextContent('req-9');
    fireEvent.click(within(failed).getByRole('button', { name: '重试' }));
    expect(props.onRetry).toHaveBeenCalledWith(feed[2]);
    expect(screen.queryByText('还没有图')).not.toBeInTheDocument();
  });

  it('says what the board is for while it is empty', () => {
    renderCanvas({ slots: [] });

    expect(screen.getByText('还没有图')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '显示全部' })).toBeDisabled();
  });

  it('selects a picture on a click, adds to the selection with shift, and clears it on the board', () => {
    const { props, canvas } = renderCanvas({ selection: ['a.png'] });

    press(picture('b.png'), canvas);
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(['b.png']);

    press(picture('b.png'), canvas, { shiftKey: true });
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(['a.png', 'b.png']);

    press(canvas, canvas, { clientX: 900, clientY: 900 });
    expect(props.onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('moves the selection by the distance it was dragged', () => {
    const { props, canvas } = renderCanvas({ selection: ['a.png', 'b.png'] });

    fireEvent.pointerDown(picture('a.png'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 110, clientY: 60 });
    // While dragging, the pictures follow the pointer without the board being saved.
    expect(picture('b.png').style.transform).toBe('translate3d(100px, 50px, 0)');
    expect(props.onMove).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas, { clientX: 110, clientY: 60 });

    expect(props.onMove).toHaveBeenCalledWith({
      'a.png': { x: 100, y: 50 },
      'b.png': { x: 444, y: 50 },
    });
    // A press on a picture of a larger selection that turns into a drag keeps the selection.
    expect(props.onSelectionChange).not.toHaveBeenCalled();
  });

  it('selects what a marquee dragged over the board touches', () => {
    const { props, canvas } = renderCanvas();

    fireEvent.pointerDown(canvas, { button: 0, clientX: -20, clientY: -20 });
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 100 });
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(['a.png', 'b.png']);
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: 100 });
    expect(document.querySelector('.agent-canvas__marquee')).toBeNull();
  });

  it('offers details, download and delete for one picture, and lines several up', async () => {
    const user = userEvent.setup();
    const single = renderCanvas({ selection: ['a.png'] });
    const tools = screen.getByRole('toolbar', { name: '选中的图片' });

    await user.click(within(tools).getByRole('button', { name: '查看详情' }));
    expect(single.props.onOpen).toHaveBeenCalledWith(feed[0]?.entries[0]);
    await user.click(within(tools).getByRole('button', { name: '下载' }));
    expect(single.props.onDownload).toHaveBeenCalledWith([feed[0]?.entries[0]]);
    await user.click(within(tools).getByRole('button', { name: '删除' }));
    expect(single.props.onDelete).toHaveBeenCalledWith(feed[0]?.entries[0]);
    single.unmount();

    const several = renderCanvas({ selection: ['a.png', 'pending-1#0'] });
    const severalTools = screen.getByRole('toolbar', { name: '选中的图片' });
    expect(severalTools).toHaveTextContent('已选 2 项');
    expect(within(severalTools).queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    await user.click(within(severalTools).getByRole('button', { name: '横向排列' }));
    expect(several.props.onMove).toHaveBeenCalledWith({
      'a.png': { x: 0, y: 0 },
      'pending-1#0': { x: 344, y: 0 },
    });
  });

  it('opens a picture on a double click and selects it from the keyboard', async () => {
    const user = userEvent.setup();
    const { props } = renderCanvas();

    await user.dblClick(picture('a.png'));
    expect(props.onOpen).toHaveBeenCalledWith(feed[0]?.entries[0]);

    picture('b.png').focus();
    await user.keyboard('{Enter}');
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(['b.png']);
  });

  it('answers the keys of a drawing tool while the pointer is over it', async () => {
    const user = userEvent.setup();
    const { props, canvas } = renderCanvas({ selection: ['a.png'] });
    const hand = screen.getByRole('button', { name: '抓手' });

    // Elsewhere on the page the keys are left alone.
    await user.keyboard('h');
    expect(hand).toHaveAttribute('aria-pressed', 'false');

    fireEvent.pointerEnter(canvas);
    await user.keyboard('h');
    expect(hand).toHaveAttribute('aria-pressed', 'true');
    expect(canvas).toHaveAttribute('data-tool', 'hand');
    await user.keyboard('v');
    expect(screen.getByRole('button', { name: '选择' })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Delete}');
    expect(props.onDelete).toHaveBeenCalledWith(feed[0]?.entries[0]);
    await user.keyboard('{Escape}');
    expect(props.onSelectionChange).toHaveBeenLastCalledWith([]);
    await user.keyboard('{Control>}a{/Control}');
    expect(props.onSelectionChange).toHaveBeenLastCalledWith([
      'a.png',
      'b.png',
      'pending-1#0',
      'failed-1#0',
    ]);
  });

  it('zooms in steps and back to 100%', async () => {
    const user = userEvent.setup();
    renderCanvas();

    await user.click(screen.getByRole('button', { name: '放大' }));
    const zoom = screen.getByRole('button', { name: /^缩放 125%/ });
    expect(zoom).toHaveTextContent('125%');
    await user.click(zoom);
    expect(screen.getByRole('button', { name: /^缩放 100%/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '缩小' }));
    expect(screen.getByRole('button', { name: /^缩放 80%/ })).toBeInTheDocument();
  });

  it('pans with the hand tool', () => {
    const { canvas } = renderCanvas();
    fireEvent.click(screen.getByRole('button', { name: '抓手' }));
    const world = canvas.querySelector<HTMLElement>('.agent-canvas__world');

    act(() => {
      fireEvent.pointerDown(canvas, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(canvas, { clientX: 40, clientY: -30 });
      fireEvent.pointerUp(canvas, { clientX: 40, clientY: -30 });
    });

    expect(world?.style.transform).toBe('translate3d(40px, -30px, 0) scale(1)');
  });

  it('frames a set under its name, selects or downloads it whole, and names each picture', async () => {
    const user = userEvent.setup();
    const { props } = renderCanvas({
      groups: [
        {
          key: 'turn-1',
          title: '山柚观音上新',
          meta: '2 件',
          keys: ['a.png', 'b.png', 'pending-1#0'],
        },
      ],
      captions: new Map([
        ['a.png', { label: '主海报', aspect: '3:4', check: 'passed' as const, issues: [] }],
        [
          'b.png',
          {
            label: '方图',
            aspect: '1:1',
            check: 'issues' as const,
            issues: ['“新品上市”被写成了“新吕上市”'],
          },
        ],
      ]),
      onDownloadGroup: vi.fn(),
    });

    const name = screen.getByRole('button', { name: '选中整套：山柚观音上新' });
    expect(name).toHaveTextContent('山柚观音上新2 件');
    // The frame reaches 16 past the pictures it holds, the one still being made included.
    expect(name.closest('.agent-group')).toHaveStyle({
      left: '-16px',
      top: '-16px',
      width: '696px',
      height: '696px',
    });

    await user.click(name);
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(['a.png', 'b.png', 'pending-1#0']);
    await user.click(screen.getByRole('button', { name: '下载整套：山柚观音上新' }));
    expect(props.onDownloadGroup).toHaveBeenCalledWith('turn-1');

    expect(
      screen.getByRole('button', { name: '画布图片：提示词 a.png（主海报 · 3:4 · 文字无误）' }),
    ).toHaveTextContent('主海报3:4文字无误');
    expect(
      screen.getByRole('button', { name: '画布图片：提示词 b.png（方图 · 1:1 · 文字有误）' }),
    ).toHaveTextContent('文字有误');
    expect(screen.getByTitle(/新吕上市/)).toHaveAttribute('data-check', 'issues');
  });

  it('marks a whole set as selected when every picture in it is', () => {
    renderCanvas({
      groups: [{ key: 'turn-1', title: '山柚观音上新', meta: '2 件', keys: ['a.png', 'b.png'] }],
      selection: ['a.png', 'b.png'],
    });

    expect(
      screen.getByRole('button', { name: '选中整套：山柚观音上新' }).closest('.agent-group'),
    ).toHaveAttribute('data-selected', 'true');
    // A set the page cannot download offers no download.
    expect(screen.queryByRole('button', { name: /^下载整套/ })).not.toBeInTheDocument();
  });
});
