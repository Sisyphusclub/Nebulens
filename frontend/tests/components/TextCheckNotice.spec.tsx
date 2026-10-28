import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { TextCheckNotice } from '@/components/generation/TextCheckNotice';

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
