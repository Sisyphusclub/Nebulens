import { createBrowserChoice, useBrowserChoice } from '@/lib/browserChoice';

export const AGENT_EXECUTION_STORAGE_KEY = 'nebulens.agent-execution.v1';

/** How the Agent runs: it shows its plan and waits for a yes, or goes straight ahead. */
export type AgentExecution = 'ask' | 'auto';

export const AGENT_EXECUTION_LABELS: Record<AgentExecution, string> = {
  ask: '询问执行',
  auto: '自动执行',
};

const choice = createBrowserChoice<AgentExecution>(
  AGENT_EXECUTION_STORAGE_KEY,
  ['ask', 'auto'],
  'ask',
);

/** Asking first is the default: a plan can spend several images' worth of credits. */
export function useAgentExecution(): readonly [
  execution: AgentExecution,
  setExecution: (execution: AgentExecution) => void,
] {
  return useBrowserChoice(choice);
}
