import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

const skillMocks = vi.hoisted(() => ({ fetchSkillForms: vi.fn() }));
vi.mock('@/services/api/skillsApi', () => ({ fetchSkillForms: skillMocks.fetchSkillForms }));

import { SkillPanel } from '@/components/landing/SkillPanel';
import { LANDING_SKILLS } from '@/data/landingSkills';
import type { SkillForm } from '@/types/skill';

const INFOGRAPHIC: SkillForm = {
  id: 'infographic',
  label: '信息图',
  description: '填标题和步骤，一次出竖版和横版两张图解',
  reference: 'none',
  fields: [
    { id: 'title', label: '标题', kind: 'text', required: true, maxLength: 16 },
    { id: 'steps', label: '步骤或要点', kind: 'list', required: true, maxItems: 2, maxLength: 12 },
  ],
  outputs: [
    { id: 'vertical', label: '竖版' },
    { id: 'horizontal', label: '横版' },
  ],
};
const skill = LANDING_SKILLS.find((candidate) => candidate.id === 'infographic')!;

beforeEach(() => {
  skillMocks.fetchSkillForms.mockResolvedValue([INFOGRAPHIC]);
});

function renderPanel(onSubmit = vi.fn(() => Promise.resolve())) {
  render(
    <SkillPanel
      skill={skill}
      open
      creditCost={3}
      onClose={vi.fn()}
      onSubmit={onSubmit}
      onUseExamplePrompt={vi.fn()}
    />,
  );
  return onSubmit;
}

it('collects list answers up to the limit and submits only once everything required is filled', async () => {
  const user = userEvent.setup();
  const onSubmit = renderPanel();
  const panel = await screen.findByRole('dialog', { name: '信息图' });

  expect(within(panel).getByText('共 2 张 · 消耗 6 额度')).toBeInTheDocument();
  await user.type(within(panel).getByLabelText('标题'), '三步完成注册');
  expect(within(panel).getByRole('button', { name: '开始生成' })).toBeDisabled();

  await user.type(within(panel).getByRole('textbox', { name: '步骤或要点 1' }), '下载应用');
  await user.click(within(panel).getByRole('button', { name: '再加一条步骤或要点' }));
  await user.type(within(panel).getByRole('textbox', { name: '步骤或要点 2' }), '验证手机号');
  expect(within(panel).queryByRole('button', { name: '再加一条步骤或要点' })).toBeNull();
  await user.click(within(panel).getByRole('button', { name: '开始生成' }));

  expect(onSubmit).toHaveBeenCalledWith({
    form: INFOGRAPHIC,
    values: { title: '三步完成注册', steps: ['下载应用', '验证手机号'] },
    referenceFile: null,
  });
});

it('shows why a run could not start and keeps the answers', async () => {
  const user = userEvent.setup();
  renderPanel(vi.fn(() => Promise.reject(new Error('额度不足，请先签到。'))));
  const panel = await screen.findByRole('dialog', { name: '信息图' });

  await user.type(within(panel).getByLabelText('标题'), '三步完成注册');
  await user.type(within(panel).getByRole('textbox', { name: '步骤或要点 1' }), '下载应用');
  await user.click(within(panel).getByRole('button', { name: '开始生成' }));

  expect(await within(panel).findByRole('alert')).toHaveTextContent('额度不足，请先签到。');
  expect(within(panel).getByLabelText('标题')).toHaveValue('三步完成注册');
});
