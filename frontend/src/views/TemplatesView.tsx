import { ArrowUpRight, Copy, ExternalLink, Heart, Search, X } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useToast } from '@/components/common/ToastProvider';
import { OperationalPageHeader } from '@/components/common/OperationalPageHeader';
import { MorphicCard, MorphicCardModal } from '@/components/premium/morphic-card-modal';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { Input } from '@/components/ui/input';
import { SelectMenu } from '@/components/ui/select-menu';
import {
  CREATION_TEMPLATES,
  orderTemplatesWithAnimeLast,
  TEMPLATE_CATEGORIES,
  templateMatchesQuery,
  type CreationTemplate,
} from '@/data/creationTemplates';
import { useTemplatePreferences } from '@/hooks/useTemplatePreferences';
import { cn } from '@/lib/utils';
import { ASPECT_RATIO_LABELS, IMAGE_RESOLUTION_LABELS } from '@/types/image';
import { TEMPLATE_THUMBNAIL_WIDTH, templateThumbnailUrl } from '@/utils/thumbnail';

type TemplateSort = 'featured' | 'recent' | 'title';
type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

const ALL_CATEGORIES: TemplateCategory = '全部';
/** Every category stays in view, the fullest ones first after 全部. */
const CATEGORY_CHIPS: readonly TemplateCategory[] = [
  ALL_CATEGORIES,
  ...TEMPLATE_CATEGORIES.filter((value) => value !== ALL_CATEGORIES)
    .map((value) => ({
      value,
      size: CREATION_TEMPLATES.filter((template) => template.category === value).length,
    }))
    .sort((a, b) => b.size - a.size)
    .map(({ value }) => value),
];
const SORT_OPTIONS: readonly { value: TemplateSort; label: string }[] = [
  { value: 'featured', label: '精选排序' },
  { value: 'recent', label: '最近使用' },
  { value: 'title', label: '名称排序' },
];
const INITIAL_TEMPLATE_COUNT = 24;
/** The previewed template lives in the address, so a link or a refresh reopens it. */
const TEMPLATE_PARAM = 'template';
/** The picked category is in the address too, so other pages can link straight to it. */
const CATEGORY_PARAM = 'category';

function isTemplateCategory(value: string | null): value is TemplateCategory {
  return value !== null && (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}
const TEMPLATE_BATCH_SIZE = 24;

function templateSearchParams(template: CreationTemplate): string {
  return new URLSearchParams({
    prompt: template.prompt,
    aspect: template.settings.aspectRatio,
    count: String(template.settings.count),
    resolution: template.settings.resolution,
  }).toString();
}

export function TemplatesView() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { favoriteIds, recent, toggleFavorite, markUsed } = useTemplatePreferences();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TemplateSort>('featured');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get(TEMPLATE_PARAM);
  const categoryParam = searchParams.get(CATEGORY_PARAM);
  const category = isTemplateCategory(categoryParam) ? categoryParam : ALL_CATEGORIES;
  const selected = useMemo(
    () => CREATION_TEMPLATES.find((template) => template.id === selectedId) ?? null,
    [selectedId],
  );
  const [visibleCount, setVisibleCount] = useState(INITIAL_TEMPLATE_COUNT);
  const categoryChipsRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const items = CREATION_TEMPLATES.filter((template) => {
      if (category !== ALL_CATEGORIES && template.category !== category) return false;
      if (favoritesOnly && !favoriteIds.includes(template.id)) return false;
      return templateMatchesQuery(template, query);
    });
    if (sort === 'recent') {
      return [...items].sort((a, b) => (recent[b.id] ?? '').localeCompare(recent[a.id] ?? ''));
    }
    if (sort === 'title') {
      return [...items].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    }
    return orderTemplatesWithAnimeLast(items);
  }, [category, favoriteIds, favoritesOnly, query, recent, sort]);
  const visibleTemplates = filtered.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(INITIAL_TEMPLATE_COUNT);
  }, [category, favoritesOnly, query, sort]);

  // On a narrow screen the chips scroll sideways; a category opened from a link stays in view.
  useEffect(() => {
    const chips = categoryChipsRef.current;
    const active = chips?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!chips || !active) return;
    chips.scrollTo?.({
      left: active.offsetLeft - (chips.clientWidth - active.offsetWidth) / 2,
      behavior: 'auto',
    });
  }, [category]);

  useEffect(() => {
    if (!selected) return;

    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [selected]);

  const copyPrompt = async (template: CreationTemplate): Promise<void> => {
    try {
      await navigator.clipboard.writeText(template.prompt);
      notify('提示词已复制。');
    } catch {
      notify('复制失败，请手动复制。', 'error');
    }
  };
  const applyTemplate = (template: CreationTemplate): void => {
    markUsed(template.id);
    void navigate(`/generate?${templateSearchParams(template)}`);
  };
  const setAddressParam = (name: string, value: string | null): void => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  };
  const setSelectedId = (id: string | null): void => {
    setAddressParam(TEMPLATE_PARAM, id);
  };
  const setCategory = (value: TemplateCategory): void => {
    setAddressParam(CATEGORY_PARAM, value === ALL_CATEGORIES ? null : value);
  };
  const closePreview = (): void => {
    setSelectedId(null);
  };

  return (
    <section className="workspace-page templates-page" data-view="templates" aria-label="创作模板">
      <OperationalPageHeader
        id="templates-title"
        title="创作模板"
        meta={`${filtered.length} 个模板`}
      />
      <div className="operational-toolbar template-toolbar">
        <label className="search-field template-search">
          <Search aria-hidden="true" />
          <span className="sr-only">搜索创作模板</span>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模板"
          />
        </label>
        <SelectMenu label="模板排序" value={sort} options={SORT_OPTIONS} onValueChange={setSort} />
        <IconTooltip label="仅显示收藏模板">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('icon-button', favoritesOnly && 'is-active')}
            aria-label="仅显示收藏模板"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((current) => !current)}
          >
            <Heart aria-hidden="true" />
          </Button>
        </IconTooltip>
      </div>
      <div
        ref={categoryChipsRef}
        className="template-category-chips"
        role="group"
        aria-label="模板分类"
      >
        {CATEGORY_CHIPS.map((value) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="compact"
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {value}
          </Button>
        ))}
      </div>

      {filtered.length ? (
        <div className="template-gallery" aria-label="创作模板列表">
          {visibleTemplates.map((template, index) => {
            const favorite = favoriteIds.includes(template.id);
            const used = recent[template.id] !== undefined;
            const wide = index % 5 === 0;
            return (
              <article
                className={cn('template-tile', wide && 'template-tile--wide')}
                key={template.id}
              >
                <MorphicCard id={`template-${template.id}`} className="template-tile__morph">
                  <Button
                    type="button"
                    variant="ghost"
                    className="template-tile__preview"
                    aria-label={`预览模板：${template.title}`}
                    onClick={() => setSelectedId(template.id)}
                  >
                    <img
                      src={templateThumbnailUrl(template.imageUrl)}
                      // Wide cards span about 620px, so sharp screens pick the original.
                      {...(wide
                        ? {
                            srcSet: `${templateThumbnailUrl(template.imageUrl)} ${TEMPLATE_THUMBNAIL_WIDTH}w, ${template.imageUrl} ${template.width}w`,
                            sizes: '(min-width: 861px) 620px, 100vw',
                          }
                        : {})}
                      alt={`${template.title}示例`}
                      loading="lazy"
                      onError={(event) => {
                        // A template added without running the thumbnail script still shows.
                        const image = event.currentTarget;
                        if (image.dataset.fallback === 'true') return;
                        image.dataset.fallback = 'true';
                        image.removeAttribute('srcset');
                        image.src = template.imageUrl;
                      }}
                    />
                    <span className="template-tile__label">
                      <small>{used ? '最近使用' : template.category}</small>
                      <strong>{template.title}</strong>
                    </span>
                  </Button>
                </MorphicCard>
                <div className="template-tile__actions">
                  <IconTooltip label={favorite ? '取消收藏模板' : '收藏模板'}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={
                        favorite ? `取消收藏 ${template.title}` : `收藏 ${template.title}`
                      }
                      aria-pressed={favorite}
                      onClick={() => toggleFavorite(template.id)}
                    >
                      <Heart aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
                    </Button>
                  </IconTooltip>
                  <IconTooltip label="使用模板">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`使用模板 ${template.title}`}
                      onClick={() => applyTemplate(template)}
                    >
                      <ArrowUpRight aria-hidden="true" />
                    </Button>
                  </IconTooltip>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state template-empty" role="status">
          <p>没有匹配的模板。</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setQuery('');
              setCategory(ALL_CATEGORIES);
              setFavoritesOnly(false);
            }}
          >
            清除筛选
          </Button>
        </div>
      )}

      {visibleTemplates.length < filtered.length ? (
        <div className="template-gallery-more">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setVisibleCount((current) => Math.min(current + TEMPLATE_BATCH_SIZE, filtered.length))
            }
          >
            加载更多
          </Button>
        </div>
      ) : null}

      {selected
        ? createPortal(
            <MorphicCardModal
              id={`template-${selected.id}`}
              open
              onClose={closePreview}
              className="template-detail-modal"
              sharedLayout={false}
              radius={24}
            >
              <section
                className="template-detail"
                style={
                  { '--template-image-ratio': selected.width / selected.height } as CSSProperties
                }
                role="dialog"
                aria-modal="true"
                aria-labelledby="template-detail-title"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="icon-button template-detail__close"
                  aria-label="关闭模板预览"
                  onClick={closePreview}
                >
                  <X aria-hidden="true" />
                </Button>
                <div className="template-detail__media">
                  <img
                    src={selected.imageUrl}
                    alt={`${selected.title}示例`}
                    width={selected.width}
                    height={selected.height}
                  />
                </div>
                <div className="template-detail__body">
                  <h2 id="template-detail-title">{selected.title}</h2>
                  <p className="template-detail__prompt">{selected.prompt}</p>
                  <dl className="metadata-grid">
                    <div>
                      <dt>分类</dt>
                      <dd>{selected.category}</dd>
                    </div>
                    <div>
                      <dt>比例</dt>
                      <dd>{ASPECT_RATIO_LABELS[selected.settings.aspectRatio]}</dd>
                    </div>
                    <div>
                      <dt>数量</dt>
                      <dd>{selected.settings.count} 张</dd>
                    </div>
                    <div>
                      <dt>清晰度</dt>
                      <dd>{IMAGE_RESOLUTION_LABELS[selected.settings.resolution]}</dd>
                    </div>
                  </dl>
                  <a
                    className="template-detail__source"
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden="true" />
                    查看来源
                  </a>
                  <div className="detail-actions detail-actions--stack">
                    <Button type="button" onClick={() => applyTemplate(selected)}>
                      使用模板
                      <ArrowUpRight aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void copyPrompt(selected)}
                    >
                      <Copy aria-hidden="true" />
                      复制提示词
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => toggleFavorite(selected.id)}
                    >
                      <Heart
                        aria-hidden="true"
                        fill={favoriteIds.includes(selected.id) ? 'currentColor' : 'none'}
                      />
                      {favoriteIds.includes(selected.id) ? '取消收藏' : '收藏'}
                    </Button>
                  </div>
                </div>
              </section>
            </MorphicCardModal>,
            document.body,
          )
        : null}
    </section>
  );
}
