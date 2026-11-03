import { buildApiUrl } from '@/services/api/httpClient';
import type { FeedItem } from '@/utils/generationFeed';

/** Uploaded references come from the server; until then, the local previews stand in. */
function referenceImageUrls(item: FeedItem): string[] {
  if (item.settings.referenceIds.length > 0) {
    return item.settings.referenceIds.map((id) =>
      buildApiUrl(`/api/images/references/${encodeURIComponent(id)}`),
    );
  }
  return item.referencePreviewUrls ?? [];
}

/** The reference images sent with a prompt, shown above it like an attachment in a chat. */
export function PromptReferenceImages({ item }: { item: FeedItem }) {
  const urls = referenceImageUrls(item);
  if (urls.length === 0) return null;

  return (
    <ul className="session-batch__references" aria-label="参考图">
      {urls.map((url, index) => (
        <li key={url}>
          <img src={url} alt={`参考图 ${index + 1}`} loading="lazy" decoding="async" />
        </li>
      ))}
    </ul>
  );
}
