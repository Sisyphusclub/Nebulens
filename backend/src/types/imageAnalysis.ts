/** One quoted text segment and what the vision model read in its place. */
export interface TextCheckSegment {
  text: string;
  /** The text as rendered, or null when it is missing from the image. */
  found: string | null;
  /** The rendered text matches the expected text. */
  ok: boolean;
  /** Glyphs are upright, complete and evenly spaced; absent in checks made before this field. */
  clear?: boolean;
}

export interface TextCheckResult {
  status: 'passed' | 'issues';
  segments: TextCheckSegment[];
}

export const ANALYSIS_STATUSES = ['pending', 'done', 'failed'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
