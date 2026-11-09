import { ArrowUpRight, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CREATION_TEMPLATES,
  orderTemplatesWithAnimeLast,
  TEMPLATE_SHORTCUT_CATEGORIES,
  templateMatchesQuery,
  type CreationTemplate,
} from '@/data/creationTemplates';
import { buildApiUrl } from '@/services/api/imagesApi';
import { IMAGE_CATEGORY_LABELS, type TeamImageRecord } from '@/types/image';
import { templateThumbnailUrl, thumbnailUrl } from '@/utils/thumbnail';

/** Six rows of four for one category or a search. */
const FEED_SIZE = 24;
/** One row of four per section on the featured tab. */
const SECTION_SIZE = 4;
/** Shared work gets two rows on the featured tab. */
const TEAM_SECTION_SIZE = 8;
const FEATURED = '精选';
const TABS = [FEATURED, ...TEMPLATE_SHORTCUT_CATEGORIES];
const ORDERED_TEMPLATES = orderTemplatesWithAnimeLast(CREATION_TEMPLATES);

interface FeedSection {
  title: string;
  more?: { label: string; to: string };
  records: readonly TeamImageRecord[];
  templates: readonly CreationTemplate[];
}

function categoryHref(category: string): string {
  return `/templates?${new URLSearchParams({ category }).toString()}`;
}

function featuredSections(records: readonly TeamImageRecord[]): FeedSection[] {
  const sections: FeedSection[] = [];
  if (records.length > 0) {
    sections.push({
      title: '团队作品',
      more: { label: '成果库', to: '/team' },
      records: records.slice(0, TEAM_SECTION_SIZE),
      templates: [],
    });
  }
  for (const category of TEMPLATE_SHORTCUT_CATEGORIES) {
    sections.push({
      title: category,
      more: { label: `更多${category}`, to: categoryHref(category) },
      records: [],
      templates: ORDERED_TEMPLATES.filter((template) => template.category === category).slice(
        0,
        SECTION_SIZE,
      ),
    });
  }
  return sections;
}

/**
 * Inspiration under the tool cards: category tabs and a search, then rows of large cards.
 * The featured tab shows the team's newest shared work and a row per template category,
 * so it is never empty, even for visitors who are not signed in. Picking a card fills the
 * composer.
 */
export function LandingShowcase({
  records,
  onUse,
  onUseTemplate,
}: {
  records: readonly TeamImageRecord[];
  onUse: (record: TeamImageRecord) => void;
  onUseTemplate: (template: CreationTemplate) => void;
}) {
  const [tab, setTab] = useState(FEATURED);
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const sections = useMemo<FeedSection[]>(() => {
    if (tab === FEATURED && !searching) return featuredSections(records);
    // A category or a search looks through every template; shared work has categories
    // of its own, so it only joins a search on the featured tab.
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    const matchingRecords =
      tab === FEATURED
        ? records.filter((record) =>
            record.prompt.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
          )
        : [];
    const matchingTemplates = ORDERED_TEMPLATES.filter(
      (template) =>
        (tab === FEATURED || template.category === tab) && templateMatchesQuery(template, query),
    );
    const shownRecords = matchingRecords.slice(0, FEED_SIZE);
    return [
      {
        title: searching ? '搜索结果' : tab,
        ...(searching || tab === FEATURED
          ? {}
          : { more: { label: `更多${tab}`, to: categoryHref(tab) } }),
        records: shownRecords,
        templates: matchingTemplates.slice(0, Math.max(0, FEED_SIZE - shownRecords.length)),
      },
    ];
  }, [query, records, searching, tab]);
  const empty = sections.every(
    (section) => section.records.length === 0 && section.templates.length === 0,
  );

  return (
    <section className="home-feed" aria-label="灵感">
      <div className="home-feed__bar">
        <div className="home-feed__tabs" role="group" aria-label="灵感分类">
          {TABS.map((label) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              className="home-feed__tab"
              aria-pressed={tab === label}
              onClick={() => setTab(label)}
            >
              {label}
            </Button>
          ))}
        </div>
        <label className="search-field home-feed__search">
          <Search aria-hidden="true" />
          <span className="sr-only">搜索灵感</span>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索作品和模板"
          />
        </label>
      </div>
      {empty ? (
        <p className="home-feed__empty">没有找到相关作品，换个关键词试试</p>
      ) : (
        sections.map((section) =>
          section.records.length === 0 && section.templates.length === 0 ? null : (
            <section key={section.title} className="home-feed__section" aria-label={section.title}>
              <header className="home-feed__section-header">
                <h2>{section.title}</h2>
                {section.more === undefined ? null : (
                  <Link className="home-feed__more" to={section.more.to}>
                    {section.more.label}
                    <ChevronRight aria-hidden="true" />
                  </Link>
                )}
              </header>
              <div className="home-feed__grid">
                {section.records.map((record) => (
                  <FeedCard
                    key={record.id}
                    label={record.prompt}
                    author={record.ownerName}
                    meta={record.category ? IMAGE_CATEGORY_LABELS[record.category] : undefined}
                    imageUrl={thumbnailUrl(buildApiUrl(`/api/outputs/${record.id}`), 640)}
                    onUse={() => onUse(record)}
                  />
                ))}
                {section.templates.map((template) => (
                  <FeedCard
                    key={template.id}
                    label={template.title}
                    author="创作模板"
                    meta={template.category}
                    imageUrl={templateThumbnailUrl(template.imageUrl)}
                    onUse={() => onUseTemplate(template)}
                  />
                ))}
              </div>
            </section>
          ),
        )
      )}
    </section>
  );
}

function FeedCard({
  label,
  author,
  meta,
  imageUrl,
  onUse,
}: {
  label: string;
  author: string;
  meta: string | undefined;
  imageUrl: string;
  onUse: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="home-feed__card"
      aria-label={`做同款：${label}`}
      onClick={onUse}
    >
      <span className="home-feed__media">
        <img src={imageUrl} alt="" loading="lazy" decoding="async" />
        <span className="home-feed__cta" aria-hidden="true">
          做同款
          <ArrowUpRight />
        </span>
      </span>
      <span className="home-feed__body">
        <span className="home-feed__title">{label}</span>
        <span className="home-feed__meta">
          <span className="home-feed__avatar" aria-hidden="true">
            {author.slice(0, 1)}
          </span>
          {meta === undefined ? author : `${author} · ${meta}`}
        </span>
      </span>
    </Button>
  );
}
