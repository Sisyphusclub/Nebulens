/**
 * Request headers for the OpenAI-compatible chat API behind image analysis and prompt
 * polishing. OpenCode Go rejects requests without a stable `x-opencode-session` and
 * asks clients to name themselves in the user agent; other providers ignore both.
 * Each feature keeps its own session, since its instructions are the shared prefix
 * that prompt caching can reuse.
 */
export function chatApiHeaders(apiKey: string, session: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    'user-agent': 'nebulens/1.0',
    'x-opencode-session': session,
  };
}
