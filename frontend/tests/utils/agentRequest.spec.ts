import { describe, expect, it } from 'vitest';

import {
  type AgentRequestSettings,
  agentRequestState,
  readAgentRequest,
} from '@/utils/agentRequest';

describe('a request handed to the Agent canvas from another page', () => {
  it('carries the brief, the pictures and the settings it was written with', () => {
    const file = new File(['reference'], 'reference.png', { type: 'image/png' });
    const settings: AgentRequestSettings = {
      model: 'gpt-image-2.5-sunburst',
      resolution: '2k',
      quality: 'high',
    };

    expect(readAgentRequest(agentRequestState('晨雾里的灯塔', [file], settings))).toEqual({
      brief: '晨雾里的灯塔',
      files: [file],
      settings,
    });
  });

  it('leaves the settings out when none were sent', () => {
    expect(readAgentRequest(agentRequestState('晨雾里的灯塔', []))).toEqual({
      brief: '晨雾里的灯塔',
      files: [],
    });
  });

  it('drops settings it does not know, and keeps the request', () => {
    const withSettings = (settings: unknown) => ({
      agentRequest: { brief: '晨雾', files: [], settings },
    });

    for (const settings of [
      { model: 'dall-e-9', resolution: '2k', quality: 'high' },
      { model: 'gpt-image-2', resolution: '8k', quality: 'high' },
      { model: 'gpt-image-2', resolution: '2k', quality: 'ultra' },
      'fast',
    ]) {
      expect(readAgentRequest(withSettings(settings))).toEqual({ brief: '晨雾', files: [] });
    }
  });

  it('ignores anything that is not a request', () => {
    expect(readAgentRequest(null)).toBeNull();
    expect(readAgentRequest({ agentRequest: { brief: '   ', files: [] } })).toBeNull();
  });
});
