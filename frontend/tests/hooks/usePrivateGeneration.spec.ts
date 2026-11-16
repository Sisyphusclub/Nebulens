import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GENERATION_PRIVATE_STORAGE_KEY, usePrivateGeneration } from '@/hooks/usePrivateGeneration';

describe('usePrivateGeneration', () => {
  it('shows new images to everyone until asked not to', () => {
    const { result } = renderHook(() => usePrivateGeneration());

    expect(result.current[0]).toBe(false);
  });

  it('remembers the choice in this browser and tells every composer on the page', () => {
    const home = renderHook(() => usePrivateGeneration());
    const studio = renderHook(() => usePrivateGeneration());

    act(() => home.result.current[1](true));

    expect(home.result.current[0]).toBe(true);
    expect(studio.result.current[0]).toBe(true);
    expect(localStorage.getItem(GENERATION_PRIVATE_STORAGE_KEY)).toBe('true');
    // A page opened later starts from the remembered choice.
    expect(renderHook(() => usePrivateGeneration()).result.current[0]).toBe(true);

    act(() => studio.result.current[1](false));

    expect(home.result.current[0]).toBe(false);
    expect(localStorage.getItem(GENERATION_PRIVATE_STORAGE_KEY)).toBeNull();
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => usePrivateGeneration());

    act(() => {
      localStorage.setItem(GENERATION_PRIVATE_STORAGE_KEY, 'true');
      window.dispatchEvent(new StorageEvent('storage', { key: GENERATION_PRIVATE_STORAGE_KEY }));
    });

    expect(result.current[0]).toBe(true);
  });

  it('keeps the choice for as long as the page is open when the browser blocks storage', () => {
    const blocked = (): never => {
      throw new Error('storage is blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    const { result } = renderHook(() => usePrivateGeneration());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
