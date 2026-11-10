'use client';

import { motion } from 'motion/react';

import { SPRING_PRESS } from '@/lib/ease';
import { cn } from '@/lib/utils';

import type { AgentChatMode } from './types';

interface ComposerModeSwitchProps {
  modes: readonly AgentChatMode[];
  value: string;
  disabled: boolean;
  reduce: boolean;
  onChange: (mode: string) => void;
}

/** The composer's modes as one row of pressed-or-not buttons; the page decides what each does. */
export function ComposerModeSwitch({
  modes,
  value,
  disabled,
  reduce,
  onChange,
}: ComposerModeSwitchProps) {
  return (
    <div className="agent-chat-input__modes" role="group" aria-label="创作模式">
      {modes.map((mode) => {
        const selected = mode.id === value;
        return (
          <motion.button
            key={mode.id}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            whileTap={reduce ? {} : { scale: 0.96 }}
            transition={SPRING_PRESS}
            className={cn('agent-chat-input__mode', selected && 'agent-chat-input__mode--selected')}
            onClick={() => onChange(mode.id)}
          >
            {mode.icon}
            <span>{mode.label}</span>
            {mode.badge ? (
              <small className="agent-chat-input__mode-badge">{mode.badge}</small>
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
}
