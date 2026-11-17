import {
  IMAGE_MODELS,
  type ImageModel,
  type ImageQuality,
  type ImageResolution,
  isImageQuality,
  isImageResolution,
} from '@/types/image';
import { isRecord } from '@/utils/narrowing';

/** The picture settings a request was written with, so the canvas plans and prices with them. */
export interface AgentRequestSettings {
  model: ImageModel;
  resolution: ImageResolution;
  quality: ImageQuality;
}

/** A request typed elsewhere, such as the home composer in Agent mode, for the Agent canvas. */
export interface AgentRequest {
  brief: string;
  files: File[];
  settings?: AgentRequestSettings;
}

/** The navigation state that opens the Agent canvas on a request. */
export function agentRequestState(
  brief: string,
  files: readonly File[],
  settings?: AgentRequestSettings,
): { agentRequest: AgentRequest } {
  return {
    agentRequest: { brief, files: [...files], ...(settings === undefined ? {} : { settings }) },
  };
}

/** Reads a request from navigation state; anything malformed is ignored. */
export function readAgentRequest(state: unknown): AgentRequest | null {
  if (!isRecord(state) || !isRecord(state.agentRequest)) return null;
  const { brief, files, settings } = state.agentRequest;
  if (typeof brief !== 'string' || brief.trim() === '') return null;
  const request: AgentRequest = {
    brief,
    files: Array.isArray(files) ? files.filter((file): file is File => file instanceof File) : [],
  };
  const carried = readSettings(settings);
  return carried === null ? request : { ...request, settings: carried };
}

/** Settings are taken whole or not at all; anything unknown leaves the canvas's own. */
function readSettings(value: unknown): AgentRequestSettings | null {
  if (!isRecord(value)) return null;
  const model = IMAGE_MODELS.find((candidate) => candidate === value.model);
  const { resolution, quality } = value;
  if (model === undefined || typeof resolution !== 'string' || typeof quality !== 'string') {
    return null;
  }
  if (!isImageResolution(resolution) || !isImageQuality(quality)) return null;
  return { model, resolution, quality };
}
