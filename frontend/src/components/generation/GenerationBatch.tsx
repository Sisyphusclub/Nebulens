import {
  ArrowDownToLine,
  CircleAlert,
  CircleCheck,
  Copy,
  Download,
  ImagePlus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { Ref } from 'react';

import { EditablePromptBubble } from '@/components/generation/EditablePromptBubble';
import { GenerationElapsed } from '@/components/generation/GenerationElapsed';
import { ImageGenerationPlaceholder } from '@/components/generation/ImageGenerationPlaceholder';
import { PromptReferenceImages } from '@/components/generation/PromptReferenceImages';
import { SessionResultPreview } from '@/components/generation/SessionResultPreview';
import { TextCheckNotice, TextCheckProgress } from '@/components/generation/TextCheckNotice';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import type { AspectRatio, HistoryEntry } from '@/types/image';
import { downloadUrl } from '@/utils/download';
import { splitGenerationError, type FeedItem } from '@/utils/generationFeed';

function cssAspectRatio(aspectRatio: AspectRatio): string {
  return aspectRatio.replace(':', ' / ');
}

interface GenerationBatchProps {
  item: FeedItem;
  articleRef?: Ref<HTMLElement> | undefined;
  isGenerating: boolean;
  /** This batch just finished, so it shows the completion badge. */
  isCompleted: boolean;
  statusMessage: string;
  /** Id of the batch or image currently being changed, which disables its actions. */
  mutatingId: string | null;
  /** Image whose detail view is open, so its card can stay highlighted. */
  openEntryId: string | null;
  onHoverChange: (hovered: boolean) => void;
  onRegenerate: (prompt: string) => void;
  onRetry: () => void;
  onGenerateAgain: () => void;
  onReuseSettings: () => void;
  onDownloadBatch: () => void;
  onDeleteBatch: () => void;
  onOpenEntry: (entry: HistoryEntry) => void;
  onUseAsReference: (entry: HistoryEntry) => void;
  onFixText: (entry: HistoryEntry) => void;
  onDeleteEntry: (entry: HistoryEntry) => void;
}

/** One generation batch in the session feed: prompt, results or error, and actions. */
export function GenerationBatch({
  item,
  articleRef,
  isGenerating,
  isCompleted,
  statusMessage,
  mutatingId,
  openEntryId,
  onHoverChange,
  onRegenerate,
  onRetry,
  onGenerateAgain,
  onReuseSettings,
  onDownloadBatch,
  onDeleteBatch,
  onOpenEntry,
  onUseAsReference,
  onFixText,
  onDeleteEntry,
}: GenerationBatchProps) {
  const batchActions = item.entries.length ? (
    <div className="session-batch__actions" role="toolbar" aria-label="整组操作">
      <IconTooltip label="复用完整设置">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="复用完整设置"
          onClick={onReuseSettings}
        >
          <Copy aria-hidden="true" />
        </Button>
      </IconTooltip>
      <IconTooltip label="再次生成">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="再次生成"
          disabled={isGenerating}
          onClick={onGenerateAgain}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </IconTooltip>
      {item.entries.length > 1 ? (
        <>
          <IconTooltip label="下载整组图片">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="下载整组图片"
              onClick={onDownloadBatch}
            >
              <ArrowDownToLine aria-hidden="true" />
            </Button>
          </IconTooltip>
          <IconTooltip label="删除整组">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="session-delete"
              aria-label="删除整组"
              disabled={mutatingId === item.id}
              onClick={onDeleteBatch}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </IconTooltip>
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <article
      ref={articleRef}
      className={`session-batch${!item.entries.length && !item.error ? ' is-generating' : ''}`}
      data-generation-batch={item.id}
      data-state={!item.entries.length && !item.error ? 'generating' : undefined}
      data-count={item.entries.length || item.settings.count}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocusCapture={() => onHoverChange(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onHoverChange(false);
        }
      }}
    >
      <PromptReferenceImages item={item} />
      <header className="session-batch__header">
        {isCompleted ? (
          <span className="session-batch__completion" role="status">
            <CircleCheck aria-hidden="true" />
            生成完成
          </span>
        ) : null}
        <EditablePromptBubble
          item={item}
          disabled={isGenerating || mutatingId === item.id}
          onRegenerate={onRegenerate}
        />
      </header>
      {item.error ? (
        <div className="generation-error-grid">
          <div
            className="generation-error-card"
            style={{ aspectRatio: cssAspectRatio(item.settings.aspectRatio) }}
            role="alert"
          >
            <span className="generation-error-card__content">
              {(() => {
                const errorCopy = splitGenerationError(item.error);
                return (
                  <>
                    <CircleAlert aria-hidden="true" />
                    <strong>生成失败</strong>
                    <span>{errorCopy.message}</span>
                    {errorCopy.requestId ? (
                      <small
                        className="generation-error-card__request"
                        title={`请求编号：${errorCopy.requestId}`}
                      >
                        请求编号 {errorCopy.requestId}
                      </small>
                    ) : null}
                  </>
                );
              })()}
              <Button
                type="button"
                variant="secondary"
                size="compact"
                disabled={isGenerating}
                onClick={onRetry}
              >
                <RefreshCw aria-hidden="true" />
                重试
              </Button>
            </span>
          </div>
        </div>
      ) : item.entries.length ? (
        <div className="session-result-grid">
          {item.entries.map((entry) => (
            <article
              className={`session-result${openEntryId === entry.record.id ? ' is-detail-open' : ''}`}
              key={entry.record.id}
            >
              {/* Actions sit on the image, so they never cover the text check below it. */}
              <div className="session-result__media">
                <SessionResultPreview entry={entry} onOpen={() => onOpenEntry(entry)} />
                <div className="session-result__actions">
                  <IconTooltip label="用作参考图">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="用作参考图"
                      onClick={() => onUseAsReference(entry)}
                    >
                      <ImagePlus aria-hidden="true" />
                    </Button>
                  </IconTooltip>
                  <IconTooltip label="下载图片">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="下载图片"
                      onClick={() => void downloadUrl(entry.imageUrl, entry.record.id)}
                    >
                      <Download aria-hidden="true" />
                    </Button>
                  </IconTooltip>
                  <IconTooltip label="删除图片">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="删除图片"
                      disabled={mutatingId === entry.record.id}
                      onClick={() => onDeleteEntry(entry)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </IconTooltip>
                </div>
              </div>
              {/* One image: its text check and the batch toolbar share the row right under it,
                  instead of the toolbar trailing a row further down. */}
              <div className="session-result__footer">
                {entry.record.textCheck ? (
                  <TextCheckNotice
                    check={entry.record.textCheck}
                    disabled={isGenerating}
                    onFix={() => onFixText(entry)}
                  />
                ) : (
                  <TextCheckProgress record={entry.record} />
                )}
                {item.entries.length === 1 ? batchActions : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="generation-pending">
          <div className="generation-skeleton" role="status" aria-label={statusMessage}>
            {Array.from({ length: item.settings.count }, (_, index) => (
              <ImageGenerationPlaceholder
                key={`${item.id}-${index}`}
                aspectRatio={item.settings.aspectRatio}
                resolution={item.settings.resolution}
              />
            ))}
          </div>
          <GenerationElapsed startedAt={item.createdAt} />
        </div>
      )}
      {/* With several images the batch toolbar follows the whole grid. */}
      {item.entries.length > 1 ? batchActions : null}
    </article>
  );
}
