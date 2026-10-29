import { useEffect, useRef, useState } from 'react';

import { openAuthModal } from '@/hooks/useAuthModal';
import { enhancePrompt } from '@/services/api/promptApi';

/**
 * AI polishing for a composer prompt: replaces the prompt with a fuller one and
 * keeps the original for undo. A result that arrives after the user kept typing
 * is dropped, so polishing never overwrites their edits.
 */
export function usePromptEnhancer({
  prompt,
  setPrompt,
  isAuthenticated,
  notify,
}: {
  prompt: string;
  setPrompt: (prompt: string) => void;
  isAuthenticated: boolean;
  notify: (message: string, tone?: 'success' | 'error') => void;
}): {
  enhancing: boolean;
  canUndo: boolean;
  enhance: () => Promise<void>;
  undo: () => void;
} {
  const [enhancing, setEnhancing] = useState(false);
  const [polish, setPolish] = useState<{ original: string; result: string } | null>(null);
  const latestPrompt = useRef(prompt);
  useEffect(() => {
    latestPrompt.current = prompt;
  }, [prompt]);

  const enhance = async (): Promise<void> => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    const original = prompt;
    setEnhancing(true);
    try {
      const result = await enhancePrompt(original.trim());
      if (latestPrompt.current !== original) {
        notify('提示词已修改，没有应用润色结果。');
        return;
      }
      setPolish({ original, result });
      setPrompt(result);
    } catch (err) {
      notify(err instanceof Error ? err.message : '提示词润色失败，请稍后重试。', 'error');
    } finally {
      setEnhancing(false);
    }
  };

  const undo = (): void => {
    if (polish === null) return;
    setPrompt(polish.original);
    setPolish(null);
  };

  return { enhancing, canUndo: polish !== null && polish.result === prompt, enhance, undo };
}
