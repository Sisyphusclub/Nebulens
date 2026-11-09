import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { LandingTemplateShortcuts } from '@/components/landing/LandingTemplateShortcuts';
import { TEMPLATE_CATEGORIES, TEMPLATE_SHORTCUT_CATEGORIES } from '@/data/creationTemplates';

it('only offers shortcuts to categories the templates page really has', () => {
  expect(TEMPLATE_SHORTCUT_CATEGORIES.length).toBeGreaterThanOrEqual(3);
  for (const category of TEMPLATE_SHORTCUT_CATEGORIES) {
    expect(TEMPLATE_CATEGORIES).toContain(category);
  }
});

it('links each shortcut straight to its category on the templates page', () => {
  render(
    <MemoryRouter>
      <LandingTemplateShortcuts />
    </MemoryRouter>,
  );

  const nav = screen.getByRole('navigation', { name: '按分类找模板' });
  for (const category of TEMPLATE_SHORTCUT_CATEGORIES) {
    expect(within(nav).getByRole('link', { name: category })).toHaveAttribute(
      'href',
      `/templates?${new URLSearchParams({ category }).toString()}`,
    );
  }
  expect(within(nav).getByRole('link', { name: '全部模板' })).toHaveAttribute('href', '/templates');
});
