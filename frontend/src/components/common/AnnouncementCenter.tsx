import { Bell } from 'lucide-react';
import { useState } from 'react';

import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from '@/components/motion/popover-morph';
import { Button } from '@/components/ui/button';
import { ANNOUNCEMENT_KIND_LABELS, ANNOUNCEMENTS, type Announcement } from '@/data/announcements';

/** Ids of the announcements this browser has already seen. */
export const READ_ANNOUNCEMENTS_STORAGE_KEY = 'nebulens.read-announcements.v1';

function readSeenIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(READ_ANNOUNCEMENTS_STORAGE_KEY) ?? '[]',
    );
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeenIds(ids: readonly string[]): void {
  try {
    localStorage.setItem(READ_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Without storage the bell simply shows the dot again next time.
  }
}

/**
 * A bell in the top bar with a dot while there is news not yet read. Opening it lists
 * every announcement and marks them all read; the ones that were new stay labelled as
 * such until the panel closes. Nothing to announce means no bell at all.
 */
export function AnnouncementCenter({
  announcements = ANNOUNCEMENTS,
}: {
  announcements?: readonly Announcement[];
}) {
  const [seenIds, setSeenIds] = useState(readSeenIds);
  const [open, setOpen] = useState(false);
  const [newWhenOpened, setNewWhenOpened] = useState<ReadonlySet<string>>(new Set());

  if (announcements.length === 0) return null;

  const unread = announcements.filter((item) => !seenIds.includes(item.id));
  const label = unread.length > 0 ? `公告与更新，${unread.length} 条未读` : '公告与更新';

  const changeOpen = (next: boolean): void => {
    setOpen(next);
    if (!next) return;
    setNewWhenOpened(new Set(unread.map((item) => item.id)));
    if (unread.length === 0) return;
    const nextSeen = [...new Set([...seenIds, ...announcements.map((item) => item.id)])];
    setSeenIds(nextSeen);
    writeSeenIds(nextSeen);
  };

  return (
    <MorphPopover open={open} onOpenChange={changeOpen}>
      <MorphPopoverTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="landing-account-actions__icon announcement-bell"
          aria-label={label}
        >
          <Bell aria-hidden="true" />
          {unread.length > 0 ? (
            <span className="announcement-bell__dot" aria-hidden="true" />
          ) : null}
        </Button>
      </MorphPopoverTrigger>
      <MorphPopoverContent
        className="landing-account-popover announcement-popover"
        radius={16}
        sideOffset={12}
      >
        <p className="announcement-popover__title">公告与更新</p>
        <ol className="announcement-list">
          {announcements.map((item) => (
            <li key={item.id} className="announcement-list__item">
              <div className="announcement-list__meta">
                <span className="announcement-list__kind" data-kind={item.kind}>
                  {ANNOUNCEMENT_KIND_LABELS[item.kind]}
                </span>
                <time dateTime={item.date}>{item.date}</time>
                {newWhenOpened.has(item.id) ? (
                  <span className="announcement-list__new">新</span>
                ) : null}
              </div>
              <h3>{item.title}</h3>
              <ul>
                {item.items.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </MorphPopoverContent>
    </MorphPopover>
  );
}
