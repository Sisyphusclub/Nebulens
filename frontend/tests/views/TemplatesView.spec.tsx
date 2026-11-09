import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';

import { ToastProvider } from '@/components/common/ToastProvider';
import { CREATION_TEMPLATES, orderTemplatesWithAnimeLast } from '@/data/creationTemplates';
import { TemplatesView } from '@/views/TemplatesView';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="当前地址">{`${location.pathname}${location.search}`}</output>;
}

function renderView(initialEntry = '/templates') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/templates"
            element={
              <>
                <TemplatesView />
                <LocationProbe />
              </>
            }
          />
          <Route path="/generate" element={<LocationProbe />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function currentSearch(): URLSearchParams {
  const address = screen.getByLabelText('当前地址').textContent ?? '';
  return new URLSearchParams(address.split('?')[1] ?? '');
}

beforeEach(() => {
  localStorage.clear();
});

it('opens the template named in the address, so a shared link shows its preview', () => {
  const template = CREATION_TEMPLATES[3]!;
  renderView(`/templates?template=${encodeURIComponent(template.id)}`);

  const dialog = screen.getByRole('dialog', { name: template.title });
  expect(within(dialog).getByText(template.prompt)).toBeInTheDocument();
});

it('writes the opened template into the address and removes it on close', async () => {
  const user = userEvent.setup();
  const template = orderTemplatesWithAnimeLast(CREATION_TEMPLATES)[0]!;
  renderView();

  await user.click(screen.getByRole('button', { name: `预览模板：${template.title}` }));

  expect(screen.getByRole('dialog', { name: template.title })).toBeInTheDocument();
  expect(currentSearch().get('template')).toBe(template.id);

  await user.click(screen.getByRole('button', { name: '关闭模板预览' }));

  expect(screen.queryByRole('dialog', { name: template.title })).not.toBeInTheDocument();
  expect(currentSearch().has('template')).toBe(false);
});

it('ignores an unknown template id instead of showing an empty preview', () => {
  renderView('/templates?template=no-such-template');

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('创作模板列表')).toBeInTheDocument();
});

it('shows every category as a visible chip and filters by the one in the address', () => {
  const category = '科研配图';
  const expected = CREATION_TEMPLATES.filter((template) => template.category === category);
  renderView(`/templates?category=${encodeURIComponent(category)}`);

  const chips = screen.getByRole('group', { name: '模板分类' });
  expect(within(chips).getByRole('button', { name: category })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(within(chips).getByRole('button', { name: '全部' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByText(`${expected.length} 个模板`)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '模板分类' })).not.toBeInTheDocument();
});

it('writes the picked category into the address and drops it again for 全部', async () => {
  const user = userEvent.setup();
  renderView();
  const chips = screen.getByRole('group', { name: '模板分类' });

  await user.click(within(chips).getByRole('button', { name: '海报字体' }));

  expect(currentSearch().get('category')).toBe('海报字体');
  expect(within(chips).getByRole('button', { name: '海报字体' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await user.click(within(chips).getByRole('button', { name: '全部' }));

  expect(currentSearch().has('category')).toBe(false);
  expect(screen.getByText(`${CREATION_TEMPLATES.length} 个模板`)).toBeInTheDocument();
});

it('falls back to every template for a category that does not exist', () => {
  renderView('/templates?category=不存在的分类');

  expect(
    within(screen.getByRole('group', { name: '模板分类' })).getByRole('button', { name: '全部' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(`${CREATION_TEMPLATES.length} 个模板`)).toBeInTheDocument();
});
