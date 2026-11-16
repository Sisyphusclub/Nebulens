import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AGENT_EXECUTION_STORAGE_KEY, useAgentExecution } from '@/hooks/useAgentExecution';

describe('useAgentExecution', () => {
  it('asks before it runs until told to run by itself, and remembers the choice', () => {
    const { result } = renderHook(() => useAgentExecution());
    expect(result.current[0]).toBe('ask');

    act(() => result.current[1]('auto'));

    expect(result.current[0]).toBe('auto');
    expect(localStorage.getItem(AGENT_EXECUTION_STORAGE_KEY)).toBe('auto');
    expect(renderHook(() => useAgentExecution()).result.current[0]).toBe('auto');

    act(() => result.current[1]('ask'));
    expect(localStorage.getItem(AGENT_EXECUTION_STORAGE_KEY)).toBeNull();
  });

  it('falls back to asking when what is stored is not a way to run', () => {
    localStorage.setItem(AGENT_EXECUTION_STORAGE_KEY, 'whenever');

    expect(renderHook(() => useAgentExecution()).result.current[0]).toBe('ask');
  });
});
