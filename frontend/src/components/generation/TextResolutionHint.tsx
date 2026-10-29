import { Type } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ImageResolution } from '@/types/image';
import { isTextDense } from '@/utils/visibleText';

/** Suggests 2K when a text-heavy prompt would render small text at standard resolution. */
export function TextResolutionHint({
  prompt,
  resolution,
  canUse2k,
  onUse2k,
}: {
  prompt: string;
  resolution: ImageResolution;
  /** A 2K key or enough permanent credits; otherwise 2K requests are refused. */
  canUse2k: boolean;
  onUse2k: () => void;
}) {
  if (resolution !== 'standard' || !isTextDense(prompt)) return null;
  if (!canUse2k) {
    return (
      <div className="text-resolution-hint" role="status">
        <Type aria-hidden="true" />
        <span>画面文字较多，标准清晰度下小字容易变形，生成后可用“重画文字”修正。</span>
      </div>
    );
  }
  return (
    <div className="text-resolution-hint" role="status">
      <Type aria-hidden="true" />
      <span>画面文字较多，标准清晰度下小字容易变形，建议切换到 2K。</span>
      <Button type="button" variant="ghost" size="compact" onClick={onUse2k}>
        切换到 2K
      </Button>
    </div>
  );
}
