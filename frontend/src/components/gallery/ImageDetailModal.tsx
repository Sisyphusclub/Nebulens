import { Copy, Download, EyeOff, Globe2, ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';

import { MorphicCardModal } from '@/components/premium/morphic-card-modal';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { useImageDetailModalState } from '@/hooks/useImageDetailModalState';
import { imageModelLabel, type HistoryEntry } from '@/types/image';
import { downloadUrl } from '@/utils/download';
import { formatDateTime } from '@/utils/format';
import { getImageVisibilityActionLabel, getImageVisibilityLabel } from '@/utils/imageVisibility';

interface ImageDetailModalProps {
  entry: HistoryEntry | null;
  canDelete?: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onCopyPrompt?: (entry: HistoryEntry) => void;
  onReuse?: (entry: HistoryEntry) => void;
  onUseAsReference?: (entry: HistoryEntry) => void;
  onToggleVisibility?: (entry: HistoryEntry) => void;
  onDelete?: (entry: HistoryEntry) => void;
}

export function ImageDetailModal({
  entry,
  canDelete = false,
  isDeleting = false,
  onClose,
  onCopyPrompt,
  onReuse,
  onUseAsReference,
  onToggleVisibility,
  onDelete,
}: ImageDetailModalProps) {
  const id = useRef(Symbol('image-detail'));
  const { openImageDetailModal, closeImageDetailModal } = useImageDetailModalState();

  useEffect(() => {
    const currentId = id.current;
    if (!entry) {
      closeImageDetailModal(currentId);
      return;
    }
    openImageDetailModal(currentId);
    return () => {
      closeImageDetailModal(currentId);
    };
  }, [closeImageDetailModal, entry, openImageDetailModal]);

  if (!entry) return null;
  const filename = entry.record.id.includes('.') ? entry.record.id : `${entry.record.id}.png`;

  return (
    <MorphicCardModal
      id={entry.record.id}
      open
      onClose={onClose}
      sharedLayout={false}
      backdropClassName="!bg-black/[0.78]"
      className="image-detail-modal w-fit max-w-[92vw] min-h-[580px] h-[80vh] max-h-[720px] flex overflow-hidden rounded-2xl !bg-card !text-card-foreground !shadow-[var(--shadow-modal)]"
    >
      <section
        className="dialog image-detail flex h-full min-h-0 w-full overflow-hidden rounded-2xl"
        style={
          {
            '--image-detail-image-ratio': entry.record.width / entry.record.height,
          } as CSSProperties
        }
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
        <div className="image-detail__media h-full w-auto min-w-0 flex items-center justify-center bg-black/40">
          <img
            src={entry.imageUrl}
            alt={entry.record.prompt || '生成图片'}
            width={entry.record.width}
            height={entry.record.height}
            className="image-detail__image h-full w-auto max-h-full max-w-[calc(92vw-360px)] object-contain"
          />
        </div>
        <div className="image-detail__body w-[340px] flex-shrink-0 h-full flex flex-col min-h-0 bg-[#141414] p-5">
          <div className="image-detail__body-content flex-1 min-h-0 overflow-y-auto space-y-2">
            <p className="eyebrow">NEBULENS OUTPUT</p>
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
              <div>
                <dt>可见范围</dt>
                <dd>{getImageVisibilityLabel(entry.record.isPublic)}</dd>
              </div>
            </dl>
          </div>
          <div className="detail-actions flex-shrink-0 mt-auto pt-3 space-y-1.5">
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
            {onToggleVisibility ? (
              <Button type="button" variant="ghost" onClick={() => onToggleVisibility(entry)}>
                {entry.record.isPublic ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Globe2 aria-hidden="true" />
                )}
                {getImageVisibilityActionLabel(entry.record.isPublic)}
              </Button>
            ) : null}
            {canDelete && onDelete ? (
              <Button
                type="button"
                variant="danger"
                disabled={isDeleting}
                onClick={() => onDelete(entry)}
              >
                <Trash2 aria-hidden="true" />
                {isDeleting ? '删除中…' : '删除'}
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </MorphicCardModal>
  );
}
