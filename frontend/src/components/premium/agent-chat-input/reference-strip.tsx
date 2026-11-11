'use client';

import { FileText, Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { SPRING_PRESS, SPRING_SWAP } from '@/lib/ease';
import { cn } from '@/lib/utils';

import { isImageAttachment } from './attachment-utils';
import type { AgentChatAttachment } from './types';

interface ReferenceStripProps {
  attachments: readonly AgentChatAttachment[];
  previewUrls: Record<string, string>;
  limit?: number | undefined;
  disabled: boolean;
  reduce: boolean;
  onAdd: () => void;
  onPreview: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * The add tile and the reference images in the composer's top-left corner, beside the text.
 * Alone, the tile carries the limit in its tip; once there are images the count is written
 * underneath them.
 */
export function ReferenceStrip({
  attachments,
  previewUrls,
  limit,
  disabled,
  reduce,
  onAdd,
  onPreview,
  onRemove,
}: ReferenceStripProps) {
  const filled = attachments.length > 0;
  const full = limit !== undefined && attachments.length >= limit;
  const addTip =
    limit === undefined
      ? '添加参考图'
      : full
        ? `最多 ${limit} 张参考图`
        : `添加参考图，最多 ${limit} 张`;

  return (
    <div
      className={cn(
        'agent-chat-input__references',
        filled && 'agent-chat-input__references--filled',
      )}
    >
      <div className="agent-chat-input__reference-row">
        <motion.button
          type="button"
          aria-label="添加参考图"
          title={addTip}
          disabled={disabled || full}
          whileTap={reduce ? {} : { scale: 0.94 }}
          transition={SPRING_PRESS}
          className="agent-chat-input__reference-add"
          onClick={onAdd}
        >
          <Plus aria-hidden="true" />
        </motion.button>
        <AnimatePresence initial={false}>
          {attachments.map((attachment) => {
            const imageUrl = previewUrls[attachment.id];
            return (
              <motion.div
                key={attachment.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? {} : { opacity: 0, scale: 0.92 }}
                transition={reduce ? { duration: 0 } : SPRING_SWAP}
                className="agent-chat-input__reference"
              >
                {isImageAttachment(attachment) && imageUrl ? (
                  <button
                    type="button"
                    aria-label={`预览参考图 ${attachment.name}`}
                    className="agent-chat-input__reference-preview"
                    onClick={() => onPreview(attachment.id)}
                  >
                    <img src={imageUrl} alt={attachment.name} />
                  </button>
                ) : (
                  <span className="agent-chat-input__reference-file" title={attachment.name}>
                    <FileText aria-hidden="true" />
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`移除参考图 ${attachment.name}`}
                  className="agent-chat-input__reference-remove"
                  onClick={() => onRemove(attachment.id)}
                >
                  <X aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {filled ? (
        <span className="agent-chat-input__reference-count">
          参考图 {attachments.length}
          {limit === undefined ? '' : `/${limit}`}
        </span>
      ) : null}
    </div>
  );
}
