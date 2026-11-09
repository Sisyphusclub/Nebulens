import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { TEMPLATE_SHORTCUT_CATEGORIES } from '@/data/creationTemplates';

function categoryHref(category: string): string {
  return `/templates?${new URLSearchParams({ category }).toString()}`;
}

/**
 * A row of template categories under the Discover composer, for someone who has not
 * written anything yet: each opens the templates page already filtered to it.
 */
export function LandingTemplateShortcuts() {
  return (
    <nav className="landing-template-shortcuts" aria-label="按分类找模板">
      <span className="landing-template-shortcuts__lead">从模板起步</span>
      {TEMPLATE_SHORTCUT_CATEGORIES.map((category) => (
        <Link
          key={category}
          className="landing-template-shortcuts__link"
          to={categoryHref(category)}
        >
          {category}
        </Link>
      ))}
      <Link
        className="landing-template-shortcuts__link landing-template-shortcuts__link--all"
        to="/templates"
      >
        全部模板
        <ArrowRight aria-hidden="true" />
      </Link>
    </nav>
  );
}
