import { ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
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

/** About four rows of the full-width masonry. */
const FEED_SIZE = 24;
const FEATURED = '精选';
const TABS = [FEATURED, ...TEMPLATE_SHORTCUT_CATEGORIES];

/**
 * Inspiration under the skills, like Kling's feed: the team's newest shared work first,
 * topped up with creation templates so the wall is never empty, even for visitors who
 * are not signed in. Every image keeps its own shape; picking one fills the composer.
 */
export function LandingShowcase({
  records,
  templates,
  onUse,
  onUseTemplate,
}: {
  records: readonly TeamImageRecord[];
  templates: readonly CreationTemplate[];
  onUse: (record: TeamImageRecord) => void;
  onUseTemplate: (template: CreationTemplate) => void;
}) {
  const [tab, setTab] = useState(FEATURED);
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const { shownRecords, shownTemplates } = useMemo(() => {
    // Featured without a search keeps the curated mix: shared work first, topped up with
    // varied templates. A category or a search looks through every template instead.
    if (tab === FEATURED && !searching) {
      return {
        shownRecords: records,
        shownTemplates: templates.slice(0, Math.max(0, FEED_SIZE - records.length)),
      };
    }
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    const matchingRecords =
      tab === FEATURED
        ? records.filter((record) =>
            record.prompt.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
          )
        : [];
    const matchingTemplates = orderTemplatesWithAnimeLast(
      CREATION_TEMPLATES.filter(
        (template) =>
          (tab === FEATURED || template.category === tab) && templateMatchesQuery(template, query),
      ),
    );
    return {
      shownRecords: matchingRecords.slice(0, FEED_SIZE),
      shownTemplates: matchingTemplates.slice(0, Math.max(0, FEED_SIZE - matchingRecords.length)),
    };
  }, [query, records, searching, tab, templates]);
  if (records.length === 0 && templates.length === 0) return null;
  const empty = shownRecords.length === 0 && shownTemplates.length === 0;
  return (
    <section className="landing-showcase" aria-label="灵感">
      <header className="landing-section-header">
        <div>
          <h2>灵感</h2>
          <p>
            {records.length > 0
              ? '团队最近共享的作品和精选模板，看中哪张就一键做同款。'
              : '精选创作模板，看中哪张就一键做同款。'}
          </p>
        </div>
        <div className="landing-showcase__links">
          {records.length > 0 ? (
            <Link className="landing-showcase__more" to="/team">
              成果库
              <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
          <Link className="landing-showcase__more" to="/templates">
            更多模板
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </header>
      <div className="landing-showcase__filters">
        <div className="landing-showcase__tabs" role="group" aria-label="灵感分类">
          {TABS.map((label) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              className="landing-showcase__tab"
              aria-pressed={tab === label}
              onClick={() => setTab(label)}
            >
              {label}
            </Button>
          ))}
        </div>
        <label className="search-field landing-showcase__search">
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
      {empty ? <p className="landing-showcase__empty">没有找到相关作品，换个关键词试试</p> : null}
      <div className="landing-showcase__masonry">
        {shownRecords.map((record) => (
          <InspirationCard
            key={record.id}
            label={record.prompt}
            meta={[
              record.ownerName,
              ...(record.category ? [IMAGE_CATEGORY_LABELS[record.category]] : []),
            ].join(' · ')}
            imageUrl={thumbnailUrl(buildApiUrl(`/api/outputs/${record.id}`), 640)}
            width={record.width}
            height={record.height}
            onUse={() => onUse(record)}
          />
        ))}
        {shownTemplates.map((template) => (
          <InspirationCard
            key={template.id}
            label={template.title}
            meta={`创作模板 · ${template.category}`}
            imageUrl={templateThumbnailUrl(template.imageUrl)}
            width={template.width}
            height={template.height}
            onUse={() => onUseTemplate(template)}
          />
        ))}
      </div>
    </section>
  );
}

function InspirationCard({
  label,
  meta,
  imageUrl,
  width,
  height,
  onUse,
}: {
  label: string;
  meta: ReactNode;
  imageUrl: string;
  width: number;
  height: number;
  onUse: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="landing-showcase__card"
      style={{ aspectRatio: `${width} / ${height}` }}
      aria-label={`做同款：${label}`}
      onClick={onUse}
    >
      <img src={imageUrl} alt="" loading="lazy" decoding="async" />
      <span className="landing-showcase__caption">
        <span className="landing-showcase__prompt">{label}</span>
        <span className="landing-showcase__meta">{meta}</span>
      </span>
      <span className="landing-showcase__cta" aria-hidden="true">
        做同款
        <ArrowUpRight />
      </span>
    </Button>
  );
}
