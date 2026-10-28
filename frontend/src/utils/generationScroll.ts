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

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
