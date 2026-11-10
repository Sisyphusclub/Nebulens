import { Bot, Image as ImageIcon, Video, type LucideIcon } from 'lucide-react';
import { createElement } from 'react';

import type {
  AgentChatLibrarySkill,
  AgentChatMode,
  AgentChatSkill,
} from '@/components/premium/agent-chat-input/types';
import { LANDING_SKILLS, type LandingSkill } from '@/data/landingSkills';

/** A decorative icon; the label next to it names the thing. */
function icon(Icon: LucideIcon) {
  return createElement(Icon, { 'aria-hidden': true });
}

/** Skills offered in the composer's + menu and after typing "/". */
export const COMPOSER_SKILLS: AgentChatSkill[] = LANDING_SKILLS.map((skill) => ({
  id: skill.id,
  label: skill.label,
  description: skill.tagline,
  icon: icon(skill.icon),
}));

/** Every skill as the composer's skill library lists it, with its example image. */
export const LIBRARY_SKILLS: AgentChatLibrarySkill[] = LANDING_SKILLS.map((skill) => ({
  id: skill.id,
  label: skill.label,
  description: skill.description,
  icon: icon(skill.icon),
  image: skill.image,
}));

export type ComposerModeId = 'agent' | 'image' | 'video';

/** The composer's modes. Video is listed ahead of its model, so it only says it is coming. */
export const COMPOSER_MODES: AgentChatMode[] = [
  { id: 'agent', label: 'Agent 模式', icon: icon(Bot) },
  { id: 'image', label: '图片生成', icon: icon(ImageIcon) },
  { id: 'video', label: '视频生成', icon: icon(Video), badge: '即将上线' },
];

export const VIDEO_COMING_SOON = '视频生成即将上线，现在可以先用 Agent 模式或图片生成。';

export const AGENT_PLACEHOLDER = '说说你想做什么，Agent 会挑合适的技能，一次出一组图…';

/** Agent mode examples say which kind of set they want, the way people ask for one. */
export const AGENT_PROMPT_EXAMPLES: readonly string[] = LANDING_SKILLS.filter(
  (skill) => skill.everyday && !['restyle', 'background'].includes(skill.id),
)
  .slice(0, 6)
  .map((skill) => `做一套${skill.label}：${skill.briefExample}`);

export function findLandingSkill(id: string): LandingSkill | undefined {
  return LANDING_SKILLS.find((skill) => skill.id === id);
}

/** The skill whose "/name" pill is in the composer; while there is one, it is in skill mode. */
export function skillInPrompt(prompt: string): LandingSkill | undefined {
  return LANDING_SKILLS.find((skill) => prompt.includes(`/${skill.label}`));
}

/** The composer text without skill pills: in skill mode, the brief the server reads. */
export function withoutSkills(prompt: string): string {
  return LANDING_SKILLS.reduce((text, skill) => text.replaceAll(`/${skill.label}`, ''), prompt)
    .replace(/\s+/gu, ' ')
    .trim();
}
