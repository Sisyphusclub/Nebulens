import { MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { SESSION_TITLE_MAX_LENGTH, useGenerationSessions } from '@/hooks/useGenerationSessions';
import { useImageHistory } from '@/hooks/useImageHistory';
import { sidebarSessions } from '@/utils/sidebarSessions';

/** Opens the generate page on a blank session; the session is saved on first generation. */
export const NEW_CREATION_PATH = '/generate?prompt=';

/** A title cut short from a long prompt ends in "…", which is not part of the name. */
function editableTitle(title: string): string {
  return title.endsWith('…') ? title.slice(0, -1).trimEnd() : title;
}

interface SidebarCreationHistoryProps {
  onNavigate: () => void;
}

/**
 * The creation sessions of the signed-in user, to switch, rename or remove; visitors get
 * a sign-in prompt in their place.
 */
export function SidebarCreationHistory({ onNavigate }: SidebarCreationHistoryProps) {
  const { isAuthenticated } = useAuth();
  const { sessions, rename, remove } = useGenerationSessions();
  const history = useImageHistory();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [initialTitle, setInitialTitle] = useState('');

  const activeSessionId = location.pathname === '/generate' ? searchParams.get('session') : null;
  const items = useMemo(
    () => sidebarSessions(sessions, history.batches, activeSessionId),
    [activeSessionId, history.batches, sessions],
  );

  if (!isAuthenticated) {
    return (
      <SidebarGroup className="sidebar-history" aria-labelledby="sidebar-history-title">
        <SidebarGroupLabel id="sidebar-history-title">创作记录</SidebarGroupLabel>
        <SidebarGroupContent>
          <Button
            type="button"
            variant="ghost"
            className="sidebar-history__login"
            onClick={() => {
              onNavigate();
              openAuthModal();
            }}
          >
            登录，开启创作
          </Button>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const startRename = (id: string, title: string): void => {
    setEditingId(id);
    setDraftTitle(editableTitle(title));
    setInitialTitle(editableTitle(title));
  };
  /** Saves a changed, non-empty name; leaving it as it was keeps the title untouched. */
  const commitRename = (): void => {
    const next = draftTitle.trim();
    if (editingId !== null && next !== '' && next !== initialTitle.trim()) rename(editingId, next);
    setEditingId(null);
  };
  const handleRenameKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditingId(null);
    }
  };
  const removeSession = (id: string): void => {
    remove(id);
    if (id === activeSessionId) void navigate(NEW_CREATION_PATH);
  };

  return (
    <SidebarGroup className="sidebar-history" aria-labelledby="sidebar-history-title">
      <SidebarGroupLabel id="sidebar-history-title">创作记录</SidebarGroupLabel>
      <SidebarGroupAction asChild title="新建创作">
        <Link to={NEW_CREATION_PATH} aria-label="新建创作" onClick={onNavigate}>
          <Plus aria-hidden="true" />
        </Link>
      </SidebarGroupAction>
      <SidebarGroupContent>
        {items.length === 0 ? (
          <p className="sidebar-history__empty">生成第一张图后，创作会出现在这里</p>
        ) : (
          <SidebarMenu aria-label="创作记录">
            {items.map((item) => {
              const active = item.id === activeSessionId;
              if (item.id === editingId) {
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarInput
                      className="sidebar-history__rename"
                      aria-label="重命名创作"
                      value={draftTitle}
                      maxLength={SESSION_TITLE_MAX_LENGTH}
                      autoFocus
                      // Typing replaces the whole name, as when renaming a file.
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={handleRenameKey}
                      onBlur={commitRename}
                    />
                  </SidebarMenuItem>
                );
              }
              return (
                <SidebarMenuItem key={item.id} className="sidebar-history__item">
                  <SidebarMenuButton asChild isActive={active}>
                    <Link
                      to={`/generate?session=${encodeURIComponent(item.id)}`}
                      aria-current={active ? 'page' : undefined}
                      title={item.title}
                      onClick={onNavigate}
                    >
                      <MessageSquare aria-hidden="true" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    showOnHover
                    className="sidebar-history__action sidebar-history__action--rename"
                    aria-label={`重命名：${item.title}`}
                    title="重命名"
                    onClick={() => startRename(item.id, item.title)}
                  >
                    <Pencil aria-hidden="true" />
                  </SidebarMenuAction>
                  <SidebarMenuAction
                    showOnHover
                    className="sidebar-history__action"
                    aria-label={`移出创作记录：${item.title}`}
                    title="移出创作记录（图片仍保留在资产中）"
                    onClick={() => removeSession(item.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
