import { Gauge } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface LandingQuotaProps {
  label: string;
  ariaLabel: string;
  /** Visitors get a button that opens sign-in in place of a number. */
  isAction: boolean;
  onClick: () => void;
}

/** The credits left for generating, shown beside the composer's send button. */
export function LandingQuota({ label, ariaLabel, isAction, onClick }: LandingQuotaProps) {
  const content = (
    <>
      <Gauge aria-hidden="true" />
      <span>{label}</span>
    </>
  );

  return isAction ? (
    <Button
      type="button"
      variant="ghost"
      className="landing-quota"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {content}
    </Button>
  ) : (
    <span className="landing-quota" role="status" aria-label={ariaLabel}>
      {content}
    </span>
  );
}
