import { ArrowRight, Search } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { HomeSectionTitle } from '@/components/landing/HomeSectionTitle';
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
import { promptTitle } from '@/utils/promptTitle';
import { templateThumbnailUrl, thumbnailUrl } from '@/utils/thumbnail';

/** How many pieces one category or a search shows. */
const FEED_SIZE = 24;
/** Templates from each category on the featured wall. */
const FEATURED_PER_CATEGORY = 4;
/** Shared work leads the featured wall. */
const FEATURED_TEAM_SIZE = 8;
/** A wall at least this long fades out behind its "more" link. */
const FADED_FROM = 12;
/** A column's width is this many grid rows, so a square picture is this many rows tall. */
const ROWS_PER_COLUMN = 40;
/** A picture taller or wider than this is cropped to it, so no card runs away with a column. */
const TALLEST = 2;
const WIDEST = 0.5;
const FEATURED = '精选';
const TABS = [FEATURED, ...TEMPLATE_SHORTCUT_CATEGORIES];
const ORDERED_TEMPLATES = orderTemplatesWithAnimeLast(CREATION_TEMPLATES);
/** One template from each category in turn, so neighbours on the featured wall differ. */
const FEATURED_TEMPLATES: readonly CreationTemplate[] = Array.from(
  { length: FEATURED_PER_CATEGORY },
  (_, turn) =>
    TEMPLATE_SHORTCUT_CATEGORIES.flatMap((category) => {
      const template = ORDERED_TEMPLATES.filter((entry) => entry.category === category)[turn];
      return template === undefined ? [] : [template];
    }),
).flat();

type FeedPiece =
  | { kind: 'record'; record: TeamImageRecord }
  | { kind: 'template'; template: CreationTemplate };

interface FeedWall {
  pieces: readonly FeedPiece[];
  more?: { label: string; to: string };
}

type GridVariables = CSSProperties & { '--feed-rows': number };
type CardVariables = CSSProperties & { '--feed-span': number };

function categoryHref(category: string): string {
  return `/templates?${new URLSearchParams({ category }).toString()}`;
}

/** The grid rows a picture of this size takes up, with one more for the gap under it. */
function rowSpan(width: number, height: number): number {
  const shape = width > 0 && height > 0 ? height / width : 1;
  return Math.round(Math.min(Math.max(shape, WIDEST), TALLEST) * ROWS_PER_COLUMN) + 1;
}

/**
 * Inspiration under the composer: category tabs and a search over a wall of pictures, each
 * at its own proportions. The featured tab leads with the team's newest shared work and
 * mixes in templates from every category, so it is never empty, even for visitors who are
 * not signed in. Picking a picture fills the composer.
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
  const wall = useMemo<FeedWall>(() => {
    const ofRecords = (entries: readonly TeamImageRecord[]): FeedPiece[] =>
      entries.map((record) => ({ kind: 'record', record }));
    const ofTemplates = (entries: readonly CreationTemplate[]): FeedPiece[] =>
      entries.map((template) => ({ kind: 'template', template }));
    if (tab === FEATURED && !searching) {
      return {
        pieces: [
          ...ofRecords(records.slice(0, FEATURED_TEAM_SIZE)),
          ...ofTemplates(FEATURED_TEMPLATES),
        ],
        more: { label: '更多模板', to: '/templates' },
      };
    }
    // A category or a search looks through every template; shared work has categories
    // of its own, so it only joins a search on the featured tab.
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    const matchingRecords =
      tab === FEATURED
        ? records
            .filter((record) => record.prompt.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
            .slice(0, FEED_SIZE)
        : [];
    const matchingTemplates = ORDERED_TEMPLATES.filter(
      (template) =>
        (tab === FEATURED || template.category === tab) && templateMatchesQuery(template, query),
    ).slice(0, FEED_SIZE - matchingRecords.length);
    return {
      pieces: [...ofRecords(matchingRecords), ...ofTemplates(matchingTemplates)],
      // A search has already looked through everything there is.
      ...(searching ? {} : { more: { label: `更多${tab}`, to: categoryHref(tab) } }),
    };
  }, [query, records, searching, tab]);
  const gridStyle: GridVariables = { '--feed-rows': ROWS_PER_COLUMN };

  return (
    <section className="home-feed" aria-labelledby="home-feed-title">
      <HomeSectionTitle id="home-feed-title">灵感</HomeSectionTitle>
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
      {wall.pieces.length === 0 ? (
        <p className="home-feed__empty">没有找到相关作品，换个关键词试试</p>
      ) : (
        <div
          className="home-feed__wall"
          data-fade={
            wall.more !== undefined && wall.pieces.length >= FADED_FROM ? 'true' : undefined
          }
        >
          <div className="home-feed__grid" style={gridStyle}>
            {wall.pieces.map((piece) =>
              piece.kind === 'record' ? (
                <FeedCard
                  key={piece.record.id}
                  label={piece.record.prompt}
                  title={promptTitle(piece.record.prompt)}
                  author={piece.record.ownerName}
                  kind={
                    piece.record.category ? IMAGE_CATEGORY_LABELS[piece.record.category] : undefined
                  }
                  imageUrl={thumbnailUrl(buildApiUrl(`/api/outputs/${piece.record.id}`), 640)}
                  width={piece.record.width}
                  height={piece.record.height}
                  onUse={() => onUse(piece.record)}
                />
              ) : (
                <FeedCard
                  key={piece.template.id}
                  label={piece.template.title}
                  title={piece.template.title}
                  author="创作模板"
                  kind={piece.template.category}
                  imageUrl={templateThumbnailUrl(piece.template.imageUrl)}
                  width={piece.template.width}
                  height={piece.template.height}
                  onUse={() => onUseTemplate(piece.template)}
                />
              ),
            )}
          </div>
          {wall.more === undefined ? null : (
            <div className="home-feed__more">
              <Link to={wall.more.to}>
                {wall.more.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FeedCard({
  label,
  title,
  author,
  kind,
  imageUrl,
  width,
  height,
  onUse,
}: {
  /** The whole prompt or title, for the accessible name. */
  label: string;
  title: string;
  author: string;
  /** What sort of piece it is: a shared work's category, or a template's. */
  kind: string | undefined;
  imageUrl: string;
  width: number;
  height: number;
  onUse: () => void;
}) {
  const style: CardVariables = { '--feed-span': rowSpan(width, height) };
  return (
    <Button
      type="button"
      variant="ghost"
      className="home-feed__card"
      aria-label={`做同款：${label}`}
      style={style}
      onClick={onUse}
    >
      <img src={imageUrl} alt="" loading="lazy" decoding="async" />
      <span className="home-feed__overlay">
        <span className="home-feed__title" title={label}>
          {title}
        </span>
        <span className="home-feed__meta">
          <span className="home-feed__author">
            <span className="home-feed__avatar" aria-hidden="true">
              {author.slice(0, 1)}
            </span>
            {author}
          </span>
          {kind === undefined ? null : <span className="home-feed__kind">{kind}</span>}
        </span>
        <span className="home-feed__cta" aria-hidden="true">
          做同款
        </span>
      </span>
    </Button>
  );
}
