'use client';

import { FileText, Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { SPRING_PRESS, SPRING_SWAP } from '@/lib/ease';

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
 * The add tile and the reference images in the composer's top-left corner, with how many
 * more fit underneath.
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
  const full = limit !== undefined && attachments.length >= limit;

  return (
    <div className="agent-chat-input__references">
      <div className="agent-chat-input__reference-row">
        <motion.button
          type="button"
          aria-label="添加参考图"
          title={full ? `最多 ${limit} 张参考图` : '添加参考图'}
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
      <span className="agent-chat-input__reference-count">
        参考图 {attachments.length}
        {limit === undefined ? '' : `/${limit}`}
      </span>
    </div>
  );
}
