'use client';

import { LibraryBig } from 'lucide-react';

import {
  AnimatedDropdown,
  AnimatedDropdownContent,
  AnimatedDropdownItem,
  AnimatedDropdownLabel,
  AnimatedDropdownTrigger,
} from '@/components/premium/animated-dropdown';

import type { AgentChatLibrarySkill } from './types';

interface SkillLibraryProps {
  skills: readonly AgentChatLibrarySkill[];
  side: 'top' | 'bottom';
  disabled: boolean;
  onSelect: (skillId: string) => void;
}

/** Every skill as a card with an example; picking one starts skill mode in the composer. */
export function SkillLibrary({ skills, side, disabled, onSelect }: SkillLibraryProps) {
  return (
    <AnimatedDropdown modal={false}>
      <AnimatedDropdownTrigger asChild>
        <button
          type="button"
          // Named here: on a phone the label is hidden and only the icon shows.
          aria-label="技能库"
          className="agent-chat-input__library-trigger"
          disabled={disabled}
        >
          <LibraryBig aria-hidden="true" />
          <span>技能库</span>
        </button>
      </AnimatedDropdownTrigger>
      <AnimatedDropdownContent
        side={side}
        align="start"
        className="agent-chat-input__library-panel"
        aria-label="技能库"
      >
        <AnimatedDropdownLabel className="agent-chat-input__library-header">
          <strong>技能库</strong>
          <span>选一个技能，按它的做法一次出一组配套的图</span>
        </AnimatedDropdownLabel>
        <div className="agent-chat-input__library-grid">
          {skills.map((skill) => (
            <AnimatedDropdownItem
              key={skill.id}
              className="agent-chat-input__library-item"
              onSelect={() => onSelect(skill.id)}
            >
              {skill.image ? (
                <img src={skill.image} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="agent-chat-input__library-icon">{skill.icon}</span>
              )}
              <span className="agent-chat-input__library-text">
                <strong>{skill.label}</strong>
                <small>{skill.description}</small>
              </span>
            </AnimatedDropdownItem>
          ))}
        </div>
      </AnimatedDropdownContent>
    </AnimatedDropdown>
  );
}
