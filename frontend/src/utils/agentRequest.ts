import { isRecord } from '@/utils/narrowing';

/** A request typed elsewhere, such as the home composer in Agent mode, for the Agent canvas. */
export interface AgentRequest {
  brief: string;
  files: File[];
}

/** The navigation state that opens the Agent canvas on a request. */
export function agentRequestState(
  brief: string,
  files: readonly File[],
): { agentRequest: AgentRequest } {
  return { agentRequest: { brief, files: [...files] } };
}

/** Reads a request from navigation state; anything malformed is ignored. */
export function readAgentRequest(state: unknown): AgentRequest | null {
  if (!isRecord(state) || !isRecord(state.agentRequest)) return null;
  const { brief, files } = state.agentRequest;
  if (typeof brief !== 'string' || brief.trim() === '') return null;
  return {
    brief,
    files: Array.isArray(files) ? files.filter((file): file is File => file instanceof File) : [],
  };
}
