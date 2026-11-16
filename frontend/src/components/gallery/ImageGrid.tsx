import { Check, Copy, Download, Heart, Lock, RefreshCw, Square, Trash2, Users } from 'lucide-react';

import { MorphicCard } from '@/components/premium/morphic-card-modal';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { cn } from '@/lib/utils';
import type { HistoryEntry } from '@/types/image';
import { MEDIA_CARD_GRID_STYLE, MEDIA_CARD_INFO_ROWS, masonryCardStyle } from '@/utils/masonry';
import { promptTitle } from '@/utils/promptTitle';
import { thumbnailUrl } from '@/utils/thumbnail';

interface ImageGridProps {
  entries: readonly HistoryEntry[];
  emptyMessage?: string;
  selectedIds?: ReadonlySet<string>;
  onSelect: (entry: HistoryEntry) => void;
  onToggleSelection?: (entry: HistoryEntry) => void;
  onToggleFavorite?: (entry: HistoryEntry) => void;
  onCopyPrompt?: (entry: HistoryEntry) => void;
  onReuse?: (entry: HistoryEntry) => void;
  onDownload?: (entry: HistoryEntry) => void;
  onToggleShared?: (entry: HistoryEntry) => void;
  onRemove?: (entry: HistoryEntry) => void;
  /** A short line under each image's title, such as who made it and why it was found. */
  captionFor?: (entry: HistoryEntry) => string | undefined;
}

export function ImageGrid({
  entries,
  emptyMessage = '暂无符合条件的资产。',
  selectedIds = new Set(),
  onSelect,
  onToggleSelection,
  onToggleFavorite,
  onCopyPrompt,
  onReuse,
  onDownload,
  onToggleShared,
  onRemove,
  captionFor,
}: ImageGridProps) {
  if (!entries.length) {
    return (
      <div className="empty-state">
        <p>{emptyMessage}</p>
      </div>
    );
  }
  return (
    // A wall of cards: each as tall as its picture and the caption under it need.
    <div className="masonry masonry--cards">
      <div className="image-grid masonry__grid" style={MEDIA_CARD_GRID_STYLE}>
        {entries.map((entry) => {
          const selected = selectedIds.has(entry.record.id);
          const caption = captionFor?.(entry);
          return (
            <article
              className={cn('image-tile media-card', selected && 'is-selected')}
              key={entry.record.id}
              style={masonryCardStyle(
                entry.record.width,
                entry.record.height,
                MEDIA_CARD_INFO_ROWS,
              )}
            >
              <MorphicCard
                id={entry.record.id}
                className="image-tile__morph"
                animateLayout={false}
                sharedLayout={false}
                style={{ aspectRatio: `${entry.record.width} / ${entry.record.height}` }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="image-tile__preview"
                  aria-label={`查看图片：${entry.record.prompt}`}
                  onClick={() => onSelect(entry)}
                >
                  <img
                    src={thumbnailUrl(entry.imageUrl, 640)}
                    alt={entry.record.prompt || '生成图片'}
                    loading="lazy"
                  />
                </Button>
                <div className="image-tile__actions" role="toolbar" aria-label="图片操作">
                  {onCopyPrompt ? (
                    <IconTooltip label="复制提示词">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label="复制提示词"
                        onClick={() => onCopyPrompt(entry)}
                      >
                        <Copy aria-hidden="true" />
                      </Button>
                    </IconTooltip>
                  ) : null}
                  {onReuse ? (
                    <IconTooltip label="复用设置">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label="复用设置"
                        onClick={() => onReuse(entry)}
                      >
                        <RefreshCw aria-hidden="true" />
                      </Button>
                    </IconTooltip>
                  ) : null}
                  {onDownload ? (
                    <IconTooltip label="下载图片">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label="下载图片"
                        onClick={() => onDownload(entry)}
                      >
                        <Download aria-hidden="true" />
                      </Button>
                    </IconTooltip>
                  ) : null}
                  {onToggleShared && entry.record.isShared !== undefined ? (
                    <IconTooltip
                      label={entry.record.isShared ? '设为仅自己可见' : '设为所有人可见'}
                    >
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label={entry.record.isShared ? '设为仅自己可见' : '设为所有人可见'}
                        onClick={() => onToggleShared(entry)}
                      >
                        {entry.record.isShared ? (
                          <Users aria-hidden="true" />
                        ) : (
                          <Lock aria-hidden="true" />
                        )}
                      </Button>
                    </IconTooltip>
                  ) : null}
                  {onRemove ? (
                    <IconTooltip label="删除图片">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label={`删除图片 ${entry.record.id}`}
                        onClick={() => onRemove(entry)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </IconTooltip>
                  ) : null}
                </div>
              </MorphicCard>
              <div className="image-tile__info media-card__info">
                {/* Prompts run long: the card is titled by the first clause. */}
                <h3 className="media-card__title">{promptTitle(entry.record.prompt)}</h3>
                {caption ? <p className="image-tile__caption media-card__meta">{caption}</p> : null}
              </div>
              {onToggleSelection ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="image-tile__select"
                  aria-label={selected ? `取消选择 ${entry.record.id}` : `选择 ${entry.record.id}`}
                  aria-pressed={selected}
                  onClick={() => onToggleSelection(entry)}
                >
                  {selected ? <Check aria-hidden="true" /> : <Square aria-hidden="true" />}
                </Button>
              ) : null}
              {onToggleFavorite ? (
                <IconTooltip
                  label={entry.record.isFavorite ? '取消收藏' : '收藏'}
                  className="image-tile__favorite-trigger"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="image-tile__favorite"
                    aria-label={entry.record.isFavorite ? '取消收藏图片' : '收藏图片'}
                    aria-pressed={entry.record.isFavorite === true}
                    onClick={() => onToggleFavorite(entry)}
                  >
                    <Heart
                      aria-hidden="true"
                      fill={entry.record.isFavorite ? 'currentColor' : 'none'}
                    />
                  </Button>
                </IconTooltip>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
