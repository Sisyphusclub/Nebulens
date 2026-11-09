/** Centres a generation batch in the viewport; false when it is not rendered yet. */
export function scrollToGenerationBatch(
  batchId: string,
  behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth',
): boolean {
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-generation-batch]')).find(
    (element) => element.dataset.generationBatch === batchId,
  );
  if (!target || typeof target.scrollIntoView !== 'function') return false;
  target.scrollIntoView({
    behavior,
    block: 'center',
  });
  return true;
}

/** Breathing room between a batch and the create bar it is scrolled above. */
const ABOVE_COMPOSER_GAP_PX = 24;

/**
 * Scrolls so a generation batch ends just above the fixed create bar, where centring it
 * would leave its lower part, the image and its actions, underneath the bar; false when
 * the batch or the bar is not rendered yet.
 */
export function scrollGenerationBatchAboveComposer(
  batchId: string,
  composer: HTMLElement | null,
  behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth',
): boolean {
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-generation-batch]')).find(
    (element) => element.dataset.generationBatch === batchId,
  );
  if (!target || !composer) return false;
  const composerTop = composer.getBoundingClientRect().top;
  const top = Math.max(
    0,
    window.scrollY + target.getBoundingClientRect().bottom - (composerTop - ABOVE_COMPOSER_GAP_PX),
  );
  window.scrollTo({ top, behavior });
  return true;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
