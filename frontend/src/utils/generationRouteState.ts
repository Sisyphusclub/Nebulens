import { MAX_REFERENCE_IMAGES } from '@/types/image';

/** True when the previous page asked the generate view to start immediately. */
export function requestsAutoGeneration(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'autoGenerate' in state &&
    state.autoGenerate === true
  );
}

/** Reference images handed over in route state, capped at the reference limit. */
export function readInitialReferenceFiles(state: unknown): File[] {
  if (typeof File === 'undefined' || typeof state !== 'object' || state === null) return [];
  const candidateAttachments: unknown = (state as Record<string, unknown>)['attachments'];
  if (!Array.isArray(candidateAttachments)) return [];

  const files: File[] = [];
  for (const attachment of candidateAttachments as unknown[]) {
    if (typeof attachment !== 'object' || attachment === null) continue;
    const file: unknown = (attachment as Record<string, unknown>)['file'];
    if (file instanceof File) files.push(file);
  }
  return files.slice(0, MAX_REFERENCE_IMAGES);
}
