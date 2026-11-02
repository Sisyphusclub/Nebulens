import { Copy, Download, ImagePlus, Lock, Trash2, Users, X } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';

import { MorphicCardModal } from '@/components/premium/morphic-card-modal';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { SelectMenu } from '@/components/ui/select-menu';
import { useImageDetailModalState } from '@/hooks/useImageDetailModalState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  IMAGE_CATEGORIES,
  IMAGE_CATEGORY_LABELS,
  imageModelLabel,
  type HistoryEntry,
  type ImageCategory,
} from '@/types/image';
import { downloadUrl } from '@/utils/download';
import { formatDateTime } from '@/utils/format';

interface ImageDetailModalProps {
  entry: HistoryEntry | null;
  canDelete?: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onCopyPrompt?: (entry: HistoryEntry) => void;
  onReuse?: (entry: HistoryEntry) => void;
  onUseAsReference?: (entry: HistoryEntry) => void;
  onDelete?: (entry: HistoryEntry) => void;
  /** Owner only: file the image under another usage, or clear it with null. */
  onCategoryChange?: (entry: HistoryEntry, category: ImageCategory | null) => void;
  /** Owner only: share the image with the team or keep it private. */
  onToggleShared?: (entry: HistoryEntry) => void;
  /** Shown for a teammate's image. */
  ownerName?: string;
}

const CATEGORY_OPTIONS: readonly { value: ImageCategory | 'none'; label: string }[] = [
  { value: 'none', label: '未分类' },
  ...IMAGE_CATEGORIES.map((value) => ({ value, label: IMAGE_CATEGORY_LABELS[value] })),
];

export function ImageDetailModal({
  entry,
  canDelete = false,
  isDeleting = false,
  onClose,
  onCopyPrompt,
  onReuse,
  onUseAsReference,
  onDelete,
  onCategoryChange,
  onToggleShared,
  ownerName,
}: ImageDetailModalProps) {
  const id = useRef(Symbol('image-detail'));
  const roomForWideImage = useMediaQuery('(min-width: 1501px)');
  const { openImageDetailModal, closeImageDetailModal } = useImageDetailModalState();

  // Track only open/closed: callers may pass a new entry object on every render.
  const isOpen = entry !== null;
  useEffect(() => {
    const currentId = id.current;
    if (!isOpen) {
      closeImageDetailModal(currentId);
      return;
    }
    openImageDetailModal(currentId);
    return () => {
      closeImageDetailModal(currentId);
    };
  }, [closeImageDetailModal, isOpen, openImageDetailModal]);

  if (!entry) return null;
  const filename = entry.record.id.includes('.') ? entry.record.id : `${entry.record.id}.png`;
  const ratio = entry.record.width / entry.record.height;
  // Beside the panel a wide image would sit in a tall gap: it goes above the details instead.
  const stacked = ratio >= 2.5 || (ratio >= 1.7 && !roomForWideImage);

  return (
    <MorphicCardModal
      id={entry.record.id}
      open
      onClose={onClose}
      sharedLayout={false}
      radius={24}
      backdropClassName="!bg-black/[0.78]"
      className="image-detail-modal w-fit max-w-[92vw] min-h-[580px] h-[80vh] max-h-[720px] flex overflow-hidden"
    >
      <section
        className="dialog image-detail flex h-full min-h-0 w-full overflow-hidden"
        style={
          {
            '--image-detail-image-ratio': ratio,
          } as CSSProperties
        }
        data-stacked={stacked ? '' : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-detail-title"
      >
        <div className="image-detail__close">
          <IconTooltip label="关闭图片详情" side="left" showOnFocus={false}>
            <Button
              className="icon-button"
              type="button"
              variant="ghost"
              size="icon"
              aria-label="关闭图片详情"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </Button>
          </IconTooltip>
        </div>
        <div className="image-detail__media h-full w-auto min-w-0 flex items-center justify-center">
          <img
            src={entry.imageUrl}
            alt={entry.record.prompt || '生成图片'}
            width={entry.record.width}
            height={entry.record.height}
            className="image-detail__image h-full w-auto max-h-full max-w-[calc(92vw-380px)] object-contain"
          />
        </div>
        <div className="image-detail__body w-[340px] flex-shrink-0 h-full flex flex-col min-h-0">
          <div className="image-detail__body-content flex-1 min-h-0 overflow-y-auto">
            <h2 id="image-detail-title">图片详情</h2>
            <p className="image-detail__prompt">{entry.record.prompt}</p>
            <dl className="metadata-grid">
              <div>
                <dt>模型</dt>
                <dd>{imageModelLabel(entry.record.model)}</dd>
              </div>
              <div>
                <dt>尺寸</dt>
                <dd>
                  {entry.record.width} × {entry.record.height}
                </dd>
              </div>
              <div>
                <dt>比例</dt>
                <dd>{entry.record.aspectRatio ?? '智能'}</dd>
              </div>
              <div>
                <dt>时间</dt>
                <dd>{formatDateTime(entry.record.createdAt)}</dd>
              </div>
              {ownerName ? (
                <div>
                  <dt>作者</dt>
                  <dd>{ownerName}</dd>
                </div>
              ) : null}
              <div>
                <dt>用途</dt>
                <dd>
                  {onCategoryChange ? (
                    <SelectMenu
                      label="修改用途"
                      value={entry.record.category ?? 'none'}
                      options={CATEGORY_OPTIONS}
                      onValueChange={(value) =>
                        onCategoryChange(entry, value === 'none' ? null : value)
                      }
                    />
                  ) : entry.record.category ? (
                    IMAGE_CATEGORY_LABELS[entry.record.category]
                  ) : (
                    '未分类'
                  )}
                </dd>
              </div>
              {entry.record.isShared !== undefined ? (
                <div>
                  <dt>共享</dt>
                  <dd>{entry.record.isShared ? '已入库' : '仅自己'}</dd>
                </div>
              ) : null}
            </dl>
            {entry.record.description ? (
              <p className="image-detail__description">{entry.record.description}</p>
            ) : null}
            {entry.record.tags?.length ? (
              <ul className="image-detail__tags" aria-label="标签">
                {entry.record.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="detail-actions detail-actions--stack flex-shrink-0">
            <Button type="button" onClick={() => void downloadUrl(entry.imageUrl, filename)}>
              <Download aria-hidden="true" />
              保存图片
            </Button>
            {onCopyPrompt ? (
              <Button type="button" variant="secondary" onClick={() => onCopyPrompt(entry)}>
                <Copy aria-hidden="true" />
                复制提示词
              </Button>
            ) : null}
            {onReuse ? (
              <Button type="button" variant="secondary" onClick={() => onReuse(entry)}>
                <Copy aria-hidden="true" />
                复用设置
              </Button>
            ) : null}
            {onUseAsReference ? (
              <Button type="button" variant="secondary" onClick={() => onUseAsReference(entry)}>
                <ImagePlus aria-hidden="true" />
                用作参考图
              </Button>
            ) : null}
            {onToggleShared ? (
              <Button type="button" variant="ghost" onClick={() => onToggleShared(entry)}>
                {entry.record.isShared ? <Lock aria-hidden="true" /> : <Users aria-hidden="true" />}
                {entry.record.isShared ? '设为仅自己' : '共享到成果库'}
              </Button>
            ) : null}
            {canDelete && onDelete ? (
              <IconTooltip label="删除" className="image-detail__delete" showOnFocus={false}>
                <Button
                  type="button"
                  variant="danger"
                  disabled={isDeleting}
                  onClick={() => onDelete(entry)}
                >
                  <Trash2 aria-hidden="true" />
                  <span className="sr-only">{isDeleting ? '删除中…' : '删除'}</span>
                </Button>
              </IconTooltip>
            ) : null}
          </div>
        </div>
      </section>
    </MorphicCardModal>
  );
}
