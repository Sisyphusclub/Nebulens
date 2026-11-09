import { Sparkles, Undo2, WandSparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IMAGE_CATEGORY_LABELS, type ImageResolution } from '@/types/image';
import { analyzePrompt } from '@/utils/promptInsight';

/** Fewer characters than this rarely say enough to read anything from. */
const MIN_PROMPT_CHARS = 4;

/**
 * Shows, while typing, what the AI has understood from the prompt: the usage, the text it
 * will render, whether small text calls for 2K, and how much similar work the library holds.
 */
export function AiInsightBar({
  prompt,
  resolution,
  canUse2k,
  similarCount,
  onUse2k,
  enhance,
}: {
  prompt: string;
  resolution: ImageResolution;
  /** A 2K/4K key or enough quota for one 2K image. */
  canUse2k: boolean;
  similarCount: number;
  onUse2k: () => void;
  /** AI polishing of the prompt; omitted where polishing is unavailable. */
  enhance?: {
    enhancing: boolean;
    canUndo: boolean;
    onEnhance: () => void;
    onUndo: () => void;
  };
}) {
  if (Array.from(prompt.replace(/\s/gu, '')).length < MIN_PROMPT_CHARS) return null;
  const insight = analyzePrompt(prompt);
  const facts = [
    ...(insight.category ? [`识别为${IMAGE_CATEGORY_LABELS[insight.category]}`] : []),
    ...(insight.texts.length > 0 ? [`${insight.texts.length} 段画面文字`] : []),
    ...(similarCount > 0 ? [`成果库有 ${similarCount} 个相似作品`] : []),
    ...(enhance?.canUndo ? ['已润色'] : []),
  ];
  const adviseResolution = insight.dense && resolution === 'standard';

  const offer2k = adviseResolution && canUse2k;

  // What the AI read on the left, what can be done about it on the right.
  return (
    <div className="ai-insight" role="status" aria-label="AI 理解">
      <span className="ai-insight__facts">
        <span className="ai-insight__badge">
          <Sparkles aria-hidden="true" />
          AI
        </span>
        {facts.length > 0 ? (
          facts.map((fact) => (
            <span className="ai-insight__fact" key={fact}>
              {fact}
            </span>
          ))
        ) : (
          <span className="ai-insight__tip">用引号写出要出现在图中的文字，AI 会逐字核对。</span>
        )}
        {adviseResolution ? (
          <span className="ai-insight__tip ai-insight__tip--warn">
            {canUse2k ? '小字较多' : '小字较多，生成后可重画文字'}
          </span>
        ) : null}
      </span>
      {offer2k || enhance ? (
        <span className="ai-insight__actions">
          {offer2k ? (
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="ai-insight__action"
              onClick={onUse2k}
            >
              切换到 2K
            </Button>
          ) : null}
          {enhance?.canUndo ? (
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="ai-insight__action"
              aria-label="撤销润色"
              onClick={enhance.onUndo}
            >
              <Undo2 aria-hidden="true" />
              撤销
            </Button>
          ) : null}
          {enhance ? (
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="ai-insight__action ai-insight__action--enhance"
              aria-label="AI 润色提示词"
              disabled={enhance.enhancing}
              onClick={enhance.onEnhance}
            >
              <WandSparkles aria-hidden="true" />
              {enhance.enhancing ? '润色中…' : '润色'}
            </Button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
