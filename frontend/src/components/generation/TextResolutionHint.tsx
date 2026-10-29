import { Type } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ImageResolution } from '@/types/image';
import { isTextDense } from '@/utils/visibleText';

/** Suggests 2K when a text-heavy prompt would render small text at standard resolution. */
export function TextResolutionHint({
  prompt,
  resolution,
  onUse2k,
}: {
  prompt: string;
  resolution: ImageResolution;
  onUse2k: () => void;
}) {
  if (resolution !== 'standard' || !isTextDense(prompt)) return null;
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
