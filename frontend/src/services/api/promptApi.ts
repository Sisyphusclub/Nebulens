import { isRecord } from '@/utils/narrowing';

import {
  ImageApiError,
  authedFetch,
  buildApiError,
  buildApiUrl,
  parseJsonResponse,
} from './httpClient';

/** Rewrites a short description into a fuller image prompt, keeping quoted text exact. */
export async function enhancePrompt(prompt: string): Promise<string> {
  const response = await authedFetch(buildApiUrl('/api/prompt/enhance'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isRecord(payload) || typeof payload.prompt !== 'string') {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '润色接口返回了无法识别的响应。');
  }
  return payload.prompt;
}
