import { ArrowUpRight, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { HomeSectionTitle } from '@/components/landing/HomeSectionTitle';
import { Button } from '@/components/ui/button';
import { ANNOUNCEMENT_KIND_LABELS, ANNOUNCEMENTS, type Announcement } from '@/data/announcements';
import type { DailyCheckInResponse } from '@/types/image';

/** How many announcements the row shows, and how many points of each. */
const NEWS_SIZE = 6;
const POINTS_SIZE = 4;
/** An arrow moves the row by this share of what is in view. */
const STEP = 0.8;

interface PromoProps {
  /** Until the session is known the first card stays blank, rather than swap its offer. */
  isAuthPending: boolean;
  isAuthenticated: boolean;
  checkedInToday: boolean;
  dailyCheckInReward: number;
  onLogin: () => void;
  onCheckIn: () => Promise<DailyCheckInResponse>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

/** "2026-11-08" as "11月8日": the calendar day it was written for, whatever the time zone. */
function shortDate(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return month === undefined || day === undefined || Number.isNaN(month) || Number.isNaN(day)
    ? date
    : `${month}月${day}日`;
}

/**
 * What is new, under the hero: one card that invites a visitor to sign in, or offers the
 * day's check-in to someone who has, then the product's announcements, newest first. The
 * row scrolls sideways when it is wider than the page, with arrows for a mouse.
 */
export function LandingNews({
  announcements = ANNOUNCEMENTS,
  ...promo
}: PromoProps & { announcements?: readonly Announcement[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ back: false, forward: false });
  const shown = announcements.slice(0, NEWS_SIZE);

  useEffect(() => {
    const row = rowRef.current;
    if (row === null) return undefined;
    const measure = (): void => {
      const back = row.scrollLeft > 1;
      const forward = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setEnds((current) =>
        current.back === back && current.forward === forward ? current : { back, forward },
      );
    };
    measure();
    row.addEventListener('scroll', measure, { passive: true });
    const sizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    sizeWatch?.observe(row);
    return () => {
      row.removeEventListener('scroll', measure);
      sizeWatch?.disconnect();
    };
  }, [shown.length]);

  const move = (direction: 1 | -1): void => {
    const row = rowRef.current;
    row?.scrollBy({ left: direction * row.clientWidth * STEP });
  };

  return (
    <section className="home-news" aria-labelledby="home-news-title">
      <HomeSectionTitle id="home-news-title">最近上新</HomeSectionTitle>
      <div className="home-news__frame">
        <div ref={rowRef} className="home-news__row">
          <PromoCard {...promo} />
          {shown.map((item) => (
            <article key={item.id} className="home-news__card">
              <div className="home-news__meta">
                <span className="home-news__kind" data-kind={item.kind}>
                  {ANNOUNCEMENT_KIND_LABELS[item.kind]}
                </span>
                <time dateTime={item.date}>{shortDate(item.date)}</time>
              </div>
              <h3>{item.title}</h3>
              <ul>
                {item.items.slice(0, POINTS_SIZE).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        {ends.back ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="home-news__arrow home-news__arrow--back"
            aria-label="看前面的"
            onClick={() => move(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
        ) : null}
        {ends.forward ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="home-news__arrow home-news__arrow--forward"
            aria-label="看后面的"
            onClick={() => move(1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function PromoCard({
  isAuthPending,
  isAuthenticated,
  checkedInToday,
  dailyCheckInReward,
  onLogin,
  onCheckIn,
  onNotify,
}: PromoProps) {
  const [checkingIn, setCheckingIn] = useState(false);
  const checkIn = async (): Promise<void> => {
    if (checkedInToday || checkingIn) return;
    setCheckingIn(true);
    try {
      await onCheckIn();
    } catch {
      onNotify('签到失败，请稍后重试。', 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="home-news__promo">
      <img className="home-news__promo-mark" src="/brand/logo.png" alt="" />
      {isAuthPending ? null : isAuthenticated ? (
        <>
          <span className="home-news__badge">每日签到</span>
          <h3>{checkedInToday ? '今日已签到' : `签到领 ${dailyCheckInReward} 积分`}</h3>
          <p>
            {checkedInToday
              ? `明天再来，还能领 ${dailyCheckInReward} 积分。`
              : '每天签到一次，积分 7 天有效。'}
          </p>
          <Button
            type="button"
            className="home-news__promo-action"
            disabled={checkedInToday || checkingIn}
            onClick={() => void checkIn()}
          >
            {checkedInToday ? <Check aria-hidden="true" /> : null}
            {checkedInToday ? '已签到' : checkingIn ? '签到中' : '立即签到'}
          </Button>
        </>
      ) : (
        <>
          <span className="home-news__badge">开始使用</span>
          <h3>登录，开始创作</h3>
          <p>登录后可以生成图片、保存创作记录，每天签到还能领积分。</p>
          <Button type="button" className="home-news__promo-action" onClick={onLogin}>
            立即登录
            <ArrowUpRight aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  );
}
