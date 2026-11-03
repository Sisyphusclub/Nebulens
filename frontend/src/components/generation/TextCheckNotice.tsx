import { CircleAlert, CircleCheck, LoaderCircle, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ANALYSIS_POLL_WINDOW_MS } from '@/hooks/useImageHistory';
import type { ImageRecord, TextCheckResult } from '@/types/image';
import { describeTextIssues, hasMisspelledText, promptQuotesText } from '@/utils/textCheck';

/**
 * What the check is doing before it has a verdict. It runs in the background after the image
 * appears, so without this a picture with wrong text looks finished until the notice pops in.
 */
export function TextCheckProgress({
  record,
  now = Date.now(),
}: {
  record: Pick<ImageRecord, 'prompt' | 'analysisStatus' | 'createdAt'>;
  now?: number;
}) {
  if (!promptQuotesText(record.prompt)) return null;
  if (record.analysisStatus === 'failed') {
    return (
      <div className="text-check text-check--passed" role="status">
        <CircleAlert aria-hidden="true" />
        <span>未能自动核对文字，请留意检查</span>
      </div>
    );
  }
  const stillComing =
    record.analysisStatus === 'pending' &&
    now - Date.parse(record.createdAt) < ANALYSIS_POLL_WINDOW_MS;
  if (!stillComing) return null;
  return (
    <div className="text-check text-check--passed" role="status">
      <LoaderCircle className="text-check__spinner" aria-hidden="true" />
      <span>正在核对图中文字…</span>
    </div>
  );
}

/** The vision model's verdict on an image's quoted text, with a fix for wrong text. */
export function TextCheckNotice({
  check,
  disabled,
  onFix,
}: {
  check: TextCheckResult;
  disabled: boolean;
  onFix: () => void;
}) {
  if (check.status === 'passed') {
    return (
      <div className="text-check text-check--passed" role="status">
        <CircleCheck aria-hidden="true" />
        <span>文字核对无误</span>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          className="text-check__redraw"
          disabled={disabled}
          onClick={onFix}
        >
          <Wand2 aria-hidden="true" />
          重画文字
        </Button>
      </div>
    );
  }
  return (
    <div className="text-check text-check--issues" role="status">
      <p className="text-check__title">
        <CircleAlert aria-hidden="true" />
        {hasMisspelledText(check) ? '疑似错字' : '文字有变形'}
      </p>
      <ul className="text-check__list">
        {describeTextIssues(check).map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <Button type="button" variant="secondary" size="compact" disabled={disabled} onClick={onFix}>
        <Wand2 aria-hidden="true" />
        修正文字
      </Button>
    </div>
  );
}
