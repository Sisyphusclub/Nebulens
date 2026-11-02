/**
 * Analyzes images that have no analysis yet, or were left pending by a restart.
 * Each image costs one vision model call.
 *
 * Usage: npm run analysis:backfill -- [--limit 200] [--include-failed] [--dry-run]
 */
import { parseArgs } from 'node:util';

import {
  createAnalysisQueueFromEnv,
  listRecordsNeedingAnalysis,
} from '../services/imageAnalysis.service.js';

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string', default: '200' },
    'include-failed': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const ids = listRecordsNeedingAnalysis({
  includeFailed: args['include-failed'],
  limit: Number(args.limit),
});
process.stdout.write(`${ids.length} images need analysis.\n`);

if (!args['dry-run'] && ids.length > 0) {
  const queue = createAnalysisQueueFromEnv();
  if (queue === undefined) {
    process.stderr.write('Set VISION_API_KEY and VISION_MODEL to run analysis.\n');
    process.exit(1);
  }
  queue.enqueue(ids);
  await queue.idle();
  process.stdout.write(`Analyzed ${ids.length} images; failures are marked "failed".\n`);
}
