import { CircleAlert, CircleCheck, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { TextCheckResult } from '@/types/image';
import { describeTextIssues, hasMisspelledText } from '@/utils/textCheck';

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
