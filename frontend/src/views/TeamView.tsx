import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { OperationalPageHeader } from '@/components/common/OperationalPageHeader';
import { useToast } from '@/components/common/ToastProvider';
import { ImageDetailModal } from '@/components/gallery/ImageDetailModal';
import { ImageGrid } from '@/components/gallery/ImageGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectMenu } from '@/components/ui/select-menu';
import { useAuth } from '@/hooks/useAuth';
import { openAuthModal } from '@/hooks/useAuthModal';
import { useTeamRecommendations } from '@/hooks/useTeamRecommendations';
import { fetchTeamHistory } from '@/services/api/historyApi';
import { buildApiUrl } from '@/services/api/imagesApi';
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_RESOLUTION,
  IMAGE_CATEGORIES,
  IMAGE_CATEGORY_LABELS,
  type HistoryEntry,
  type ImageCategory,
  type TeamImageRecord,
} from '@/types/image';
import { downloadUrl } from '@/utils/download';

const CATEGORY_FILTER_OPTIONS: readonly { value: ImageCategory | 'all'; label: string }[] = [
  { value: 'all', label: '全部用途' },
  ...IMAGE_CATEGORIES.map((value) => ({ value, label: IMAGE_CATEGORY_LABELS[value] })),
];

/** The recommendations API's ceiling, so a search shows everything relevant it finds. */
const SEARCH_LIMIT = 12;

function toEntry(record: TeamImageRecord): HistoryEntry {
  return { record, imageUrl: buildApiUrl(`/api/outputs/${record.id}`) };
}

/** Teammates' shared work, browsable by usage category. */
export function TeamView() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [category, setCategory] = useState<ImageCategory | 'all'>('all');
  const [records, setRecords] = useState<TeamImageRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TeamImageRecord | null>(null);
  const requestId = useRef(0);
  const selectedEntry = useMemo(() => (selected === null ? null : toEntry(selected)), [selected]);
  const [query, setQuery] = useState('');
  // Describing a need searches the library with AI instead of browsing it by category.
  const search = useTeamRecommendations(query, isAuthenticated, SEARCH_LIMIT);
  const matches = useMemo(
    () => search.items.map((item) => ({ ...item.record, ownerName: item.ownerName })),
    [search.items],
  );
  const reasons = useMemo(
    () => new Map(search.items.map((item) => [item.record.id, item.reason])),
    [search.items],
  );
  const visibleRecords = search.active ? matches : records;

  const load = useCallback(
    async (cursor?: string): Promise<void> => {
      const current = ++requestId.current;
      setIsLoading(true);
      setError(null);
      try {
        const page = await fetchTeamHistory({
          ...(category === 'all' ? {} : { category }),
          ...(cursor === undefined ? {} : { cursor }),
        });
        if (current !== requestId.current) return;
        setRecords((existing) =>
          cursor === undefined ? page.records : [...existing, ...page.records],
        );
        setNextCursor(page.nextCursor);
      } catch (loadError) {
        if (current !== requestId.current) return;
        setError(loadError instanceof Error ? loadError.message : '无法加载成果库。');
      } finally {
        if (current === requestId.current) setIsLoading(false);
      }
    },
    [category],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    setRecords([]);
    setNextCursor(undefined);
    void load();
  }, [isAuthenticated, load]);

  const copyPrompt = async (entry: HistoryEntry): Promise<void> => {
    try {
      await navigator.clipboard.writeText(entry.record.prompt);
      notify('提示词已复制。');
    } catch {
      notify('复制失败，请手动复制。', 'error');
    }
  };

  /** A teammate's reference images stay theirs, so only the prompt and settings carry over. */
  const reuse = (entry: HistoryEntry): void => {
    const params = new URLSearchParams({
      prompt: entry.record.prompt,
      aspect: entry.record.aspectRatio ?? DEFAULT_ASPECT_RATIO,
      model: entry.record.model,
      resolution: entry.record.resolution ?? DEFAULT_IMAGE_RESOLUTION,
    });
    void navigate(`/generate?${params.toString()}`);
  };

  const findRecord = (entry: HistoryEntry): TeamImageRecord | null =>
    visibleRecords.find((record) => record.id === entry.record.id) ?? null;

  return (
    <section className="workspace-page assets-page team-page" aria-label="成果库">
      <OperationalPageHeader
        id="team-title"
        title="成果库"
        meta={
          !isAuthenticated
            ? undefined
            : search.active
              ? search.loading
                ? 'AI 正在成果库里找…'
                : `AI 找到 ${matches.length} 个相关作品`
              : `${records.length}${nextCursor ? '+' : ''} 项共享成果`
        }
      />
      {authLoading ? (
        <div className="asset-loading" role="status" aria-label="正在确认登录状态" />
      ) : !isAuthenticated ? (
        <div className="auth-gate">
          <h2>登录后查看成果库</h2>
          <Button type="button" onClick={() => openAuthModal()}>
            登录
          </Button>
        </div>
      ) : (
        <>
          <div className="operational-toolbar asset-commandbar">
            <div className="asset-commandbar__primary">
              <label className="search-field asset-search">
                <Search aria-hidden="true" />
                <Input
                  type="search"
                  aria-label="描述你要找的作品"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="描述你要找的作品，如：奶茶新品海报"
                />
              </label>
            </div>
            <div className="asset-commandbar__controls">
              <SelectMenu
                label="用途筛选"
                value={category}
                options={CATEGORY_FILTER_OPTIONS}
                disabled={search.active}
                onValueChange={setCategory}
              />
            </div>
          </div>
          {error ? (
            <div className="empty-state" role="alert">
              <p>{error}</p>
              <Button type="button" variant="secondary" onClick={() => void load()}>
                重新加载
              </Button>
            </div>
          ) : (
            <ImageGrid
              entries={visibleRecords.map(toEntry)}
              emptyMessage={
                search.active
                  ? search.loading
                    ? 'AI 正在成果库里找…'
                    : '没找到相关作品，换个说法试试。'
                  : isLoading
                    ? '正在加载成果库…'
                    : category === 'all'
                      ? '成果库还是空的。新生成的图片默认会共享到成果库。'
                      : `“${IMAGE_CATEGORY_LABELS[category]}”下还没有共享成果。`
              }
              {...(search.active
                ? {
                    captionFor: (entry: HistoryEntry) => {
                      const match = findRecord(entry);
                      const reason = reasons.get(entry.record.id);
                      return match && reason ? `${match.ownerName} · ${reason}` : undefined;
                    },
                  }
                : {})}
              onSelect={(entry) => setSelected(findRecord(entry))}
              onCopyPrompt={(entry) => void copyPrompt(entry)}
              onReuse={reuse}
              onDownload={(entry) => void downloadUrl(entry.imageUrl, entry.record.id)}
            />
          )}
          {nextCursor !== undefined && !error && !search.active ? (
            <div className="team-page__more">
              <Button
                type="button"
                variant="secondary"
                disabled={isLoading}
                onClick={() => void load(nextCursor)}
              >
                {isLoading ? '加载中…' : '加载更多'}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <ImageDetailModal
        entry={selectedEntry}
        {...(selected === null ? {} : { ownerName: selected.ownerName })}
        onClose={() => setSelected(null)}
        onCopyPrompt={(entry) => void copyPrompt(entry)}
        onReuse={(entry) => {
          setSelected(null);
          reuse(entry);
        }}
      />
    </section>
  );
}
