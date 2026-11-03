import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { TextCheckNotice, TextCheckProgress } from '@/components/generation/TextCheckNotice';

it('confirms text that was rendered exactly', () => {
  render(
    <TextCheckNotice
      check={{ status: 'passed', segments: [{ text: '新品上市', found: '新品上市', ok: true }] }}
      disabled={false}
      onFix={vi.fn()}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('文字核对无误');
  expect(screen.queryByRole('button', { name: '修正文字' })).not.toBeInTheDocument();
});

it('still lets the user redraw text the check passed', async () => {
  const user = userEvent.setup();
  const onFix = vi.fn();
  render(
    <TextCheckNotice
      check={{ status: 'passed', segments: [{ text: '新品上市', found: '新品上市', ok: true }] }}
      disabled={false}
      onFix={onFix}
    />,
  );
  await user.click(screen.getByRole('button', { name: '重画文字' }));
  expect(onFix).toHaveBeenCalledTimes(1);
});

it('lists wrong text and offers a fix', async () => {
  const user = userEvent.setup();
  const onFix = vi.fn();
  render(
    <TextCheckNotice
      check={{
        status: 'issues',
        segments: [
          { text: '中杯16元', found: '中杯15元', ok: false },
          { text: '大杯19元', found: null, ok: false },
        ],
      }}
      disabled={false}
      onFix={onFix}
    />,
  );

  const notice = screen.getByRole('status');
  expect(notice).toHaveTextContent('疑似错字');
  expect(notice).toHaveTextContent('“中杯16元”被写成了“中杯15元”');
  expect(notice).toHaveTextContent('没有找到“大杯19元”');
  await user.click(screen.getByRole('button', { name: '修正文字' }));
  expect(onFix).toHaveBeenCalledTimes(1);
});

it('disables the fix while another generation runs', () => {
  render(
    <TextCheckNotice
      check={{ status: 'issues', segments: [{ text: 'A', found: 'B', ok: false }] }}
      disabled
      onFix={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: '修正文字' })).toBeDisabled();
});

it('names deformed text separately from wrong text', () => {
  render(
    <TextCheckNotice
      check={{
        status: 'issues',
        segments: [{ text: '11月7日', found: '11月7日', ok: true, clear: false }],
      }}
      disabled={false}
      onFix={vi.fn()}
    />,
  );
  const notice = screen.getByRole('status');
  expect(notice).toHaveTextContent('文字有变形');
  expect(notice).not.toHaveTextContent('疑似错字');
  expect(notice).toHaveTextContent('“11月7日”有变形或挤压');
});

const NOW = '2026-11-02T08:00:00.000Z';

it('says the text is being checked while the quoted text of a fresh image waits for analysis', () => {
  render(
    <TextCheckProgress
      record={{ prompt: '海报写“新品上市”', analysisStatus: 'pending', createdAt: NOW }}
      now={Date.parse(NOW) + 5_000}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('正在核对图中文字');
});

it('admits when the text could not be checked, rather than saying nothing', () => {
  render(
    <TextCheckProgress
      record={{ prompt: '海报写“新品上市”', analysisStatus: 'failed', createdAt: NOW }}
      now={Date.parse(NOW)}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('未能自动核对文字');
});

it.each([
  [
    'a prompt with no text to check',
    { prompt: '晨雾中的玻璃山居', analysisStatus: 'pending' as const },
  ],
  ['a server that never analyzes', { prompt: '海报写“新品上市”' }],
  ['a finished check', { prompt: '海报写“新品上市”', analysisStatus: 'done' as const }],
])('stays out of the way for %s', (_label, record) => {
  const { container } = render(
    <TextCheckProgress record={{ ...record, createdAt: NOW }} now={Date.parse(NOW)} />,
  );

  expect(container).toBeEmptyDOMElement();
});

it('stops claiming a check is running once it is too old to still be coming', () => {
  const { container } = render(
    <TextCheckProgress
      record={{ prompt: '海报写“新品上市”', analysisStatus: 'pending', createdAt: NOW }}
      now={Date.parse(NOW) + 6 * 60_000}
    />,
  );

  expect(container).toBeEmptyDOMElement();
});
