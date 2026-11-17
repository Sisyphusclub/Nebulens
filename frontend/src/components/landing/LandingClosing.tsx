import { ArrowUp } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { getAppNavigation } from '@/config/navigation';

/** Every page but the home page, which the footer is on. */
const FOOTER_LINKS = getAppNavigation().filter((item) => item.to !== '/');

/**
 * The end of the home page's content: one line about the product and a button that takes
 * the visitor back to the composer.
 */
export function LandingClosing({ onStart }: { onStart: () => void }) {
  return (
    <section className="home-closing" aria-labelledby="home-closing-title">
      <img src="/brand/logo.png" alt="" />
      {/* Like the headline, each clause stays whole, so a narrow screen breaks between them. */}
      <h2 id="home-closing-title" aria-label="下一套物料，交给贝尔灵画">
        <span>下一套物料，</span>
        <span>交给贝尔灵画</span>
      </h2>
      <p>说一句需求，Agent 规划、生成、校对，交付一整套。</p>
      <Button type="button" onClick={onStart}>
        开始创作
      </Button>
    </section>
  );
}

/** The home page's footer: the product's name, its other pages, and the way back up. */
export function LandingFooter() {
  return (
    <footer className="home-footer">
      <div className="home-footer__brand">
        <img src="/brand/logo.png" alt="" />
        <strong>贝尔灵画</strong>
        <span>设计 Agent</span>
      </div>
      <nav className="home-footer__nav" aria-label="页脚导航">
        {FOOTER_LINKS.map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Button
        type="button"
        variant="secondary"
        size="compact"
        className="home-footer__top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp aria-hidden="true" />
        回到顶部
      </Button>
    </footer>
  );
}
