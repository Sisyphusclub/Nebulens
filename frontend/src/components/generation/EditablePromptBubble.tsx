import { Copy, Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useToast } from '@/components/common/ToastProvider';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { Textarea } from '@/components/ui/textarea';
import type { FeedItem } from '@/utils/generationFeed';

interface EditablePromptBubbleProps {
  item: FeedItem;
  disabled: boolean;
  onRegenerate: (prompt: string) => void;
}

const PROMPT_EDITOR_MIN_HEIGHT = 56;
const PROMPT_EDITOR_MAX_HEIGHT = 120;

function resizePromptEditor(textarea: HTMLTextAreaElement): void {
  textarea.style.height = '0px';
  const contentHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.max(
    PROMPT_EDITOR_MIN_HEIGHT,
    Math.min(contentHeight, PROMPT_EDITOR_MAX_HEIGHT),
  )}px`;
  textarea.style.overflowY = contentHeight > PROMPT_EDITOR_MAX_HEIGHT ? 'auto' : 'hidden';
}

export function EditablePromptBubble({ item, disabled, onRegenerate }: EditablePromptBubbleProps) {
  const { notify } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(item.settings.prompt);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedDraft = draft.trim();

  useEffect(() => {
    if (!isEditing) setDraft(item.settings.prompt);
  }, [isEditing, item.settings.prompt]);

  useEffect(() => {
    if (!isEditing) return;
    const textarea = textareaRef.current;
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [isEditing]);

  useLayoutEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    resizePromptEditor(textareaRef.current);
  }, [draft, isEditing]);

  const cancelEditing = (): void => {
    setDraft(item.settings.prompt);
    setIsEditing(false);
  };

  const copyPrompt = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(item.settings.prompt);
      notify('提示词已复制。');
    } catch {
      notify('复制失败，请手动复制。', 'error');
    }
  };

  if (isEditing) {
    return (
      <form
        className="session-batch__prompt session-batch__prompt--editing"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmedDraft || disabled) return;
          setIsEditing(false);
          onRegenerate(trimmedDraft);
        }}
      >
        <Textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          aria-label="编辑生成提示词"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEditing();
            } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="session-batch__prompt-edit-footer">
          <div
            className="session-batch__prompt-edit-actions"
            role="group"
            aria-label="提示词编辑操作"
          >
            <Button
              type="button"
              variant="secondary"
              size="compact"
              className="session-batch__prompt-cancel"
              onClick={cancelEditing}
            >
              取消
            </Button>
            <Button
              type="submit"
              size="compact"
              className="session-batch__prompt-regenerate"
              disabled={!trimmedDraft || disabled}
            >
              修改
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="session-batch__prompt-shell">
      <div className="session-batch__prompt session-batch__prompt--editable">
        <p>{item.settings.prompt}</p>
      </div>
      <div className="session-batch__prompt-actions" role="toolbar" aria-label="提示词操作">
        <IconTooltip label="复制提示词">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="session-batch__prompt-action"
            aria-label="复制提示词"
            onClick={() => void copyPrompt()}
          >
            <Copy aria-hidden="true" />
          </Button>
        </IconTooltip>
        <IconTooltip label="编辑提示词">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="session-batch__prompt-action"
            aria-label="编辑提示词"
            disabled={disabled}
            onClick={() => setIsEditing(true)}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}
