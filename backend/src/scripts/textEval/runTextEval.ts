/**
 * Measures how accurately a model renders the quoted text of each evaluation case.
 *
 * Each case is generated once per variant (the prompt as written, and with the exact-text
 * checklist from TEXT_PROMPT_STRUCTURING), read back with macOS Vision OCR and scored
 * per character. Generation calls the real image API with the server key and costs credits;
 * pass --dry-run to list the work without calling it.
 *
 * Usage: npm run eval:text -- [--model gpt-image-2] [--resolution standard|2k]
 *   [--category short] [--limit 5] [--concurrency 2] [--dry-run]
 */
import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

import { env } from '../../config/env.js';
import { createProviderFromEnv } from '../../services/providers/createProviderFromEnv.js';
import { removeOutput } from '../../storage/localStorage.js';
import {
  ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  type AspectRatio,
  type ImageResolution,
} from '../../types/image.js';
import { scoreVisibleText, structureVisibleTextPrompt } from '../../utils/visibleText.js';

import evalCases from './cases.json' with { type: 'json' };
import { formatTextEvalReport, type TextEvalCase, type TextEvalResult } from './textEvalReport.js';

const run = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

interface Variant {
  name: string;
  buildPrompt: (testCase: TextEvalCase) => string;
}

const VARIANTS: Variant[] = [
  { name: 'raw', buildPrompt: (testCase) => testCase.prompt },
  { name: 'structured', buildPrompt: (testCase) => structureVisibleTextPrompt(testCase.prompt) },
];

const { values: args } = parseArgs({
  options: {
    model: { type: 'string', default: env.IMAGE_MODEL },
    resolution: { type: 'string', default: 'standard' },
    category: { type: 'string' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '2' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const resolution = args.resolution as ImageResolution;
if (!IMAGE_RESOLUTIONS.includes(resolution)) {
  throw new Error(`--resolution must be one of: ${IMAGE_RESOLUTIONS.join(', ')}`);
}
const cases = (evalCases.cases as TextEvalCase[])
  .filter((testCase) => args.category === undefined || testCase.category === args.category)
  .slice(0, args.limit === undefined ? undefined : Number(args.limit));
const jobs = cases.flatMap((testCase) => VARIANTS.map((variant) => ({ testCase, variant })));
const startedAt = new Date().toISOString();

if (args['dry-run']) {
  for (const { testCase, variant } of jobs) {
    process.stdout.write(`[${variant.name}] ${testCase.id}: ${variant.buildPrompt(testCase)}\n`);
  }
  process.stdout.write(`${jobs.length} generations with ${args.model} (${resolution}).\n`);
  process.exit(0);
}

const outDir = path.resolve('tmp/text-eval', startedAt.replace(/[:.]/g, '-'));
await mkdir(path.join(outDir, 'images'), { recursive: true });
const ocrBinary = path.join(outDir, 'ocr-vision');
await run('swiftc', ['-O', path.join(scriptDir, 'ocr-vision.swift'), '-o', ocrBinary]);

const provider = createProviderFromEnv();

async function evaluate({
  testCase,
  variant,
}: {
  testCase: TextEvalCase;
  variant: Variant;
}): Promise<TextEvalResult> {
  const base = { caseId: testCase.id, category: testCase.category, variant: variant.name };
  try {
    const aspectRatio = testCase.aspectRatio as AspectRatio;
    if (!ASPECT_RATIOS.includes(aspectRatio)) throw new Error(`bad aspect ratio ${aspectRatio}`);
    const output = await provider.generate({
      prompt: variant.buildPrompt(testCase),
      model: args.model,
      count: 1,
      aspectRatio,
      resolution,
    });
    const generated = output.images[0];
    if (generated === undefined) throw new Error('no image returned');
    const image = `${variant.name}-${testCase.id}${path.extname(generated.outputPath)}`;
    const imagePath = path.join(outDir, 'images', image);
    await copyFile(generated.outputPath, imagePath);
    await Promise.all(output.images.map((item) => removeOutput(item.outputPath)));
    const { stdout: recognized } = await run(ocrBinary, [imagePath]);
    return { ...base, image, recognized, score: scoreVisibleText(testCase.texts, recognized) };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

const results: TextEvalResult[] = [];
let next = 0;
async function worker(): Promise<void> {
  while (next < jobs.length) {
    const job = jobs[next];
    next += 1;
    if (job === undefined) return;
    const result = await evaluate(job);
    results.push(result);
    const outcome =
      'score' in result ? `${(result.score.accuracy * 100).toFixed(1)}%` : `失败 ${result.error}`;
    process.stdout.write(
      `[${results.length}/${jobs.length}] ${job.variant.name} ${job.testCase.id} ${outcome}\n`,
    );
  }
}
await Promise.all(Array.from({ length: Math.max(1, Number(args.concurrency)) }, () => worker()));

const order = new Map(jobs.map((job, index) => [`${job.variant.name}/${job.testCase.id}`, index]));
results.sort(
  (a, b) =>
    (order.get(`${a.variant}/${a.caseId}`) ?? 0) - (order.get(`${b.variant}/${b.caseId}`) ?? 0),
);
const meta = { model: args.model, resolution, startedAt };
await writeFile(
  path.join(outDir, 'results.json'),
  `${JSON.stringify({ meta, results }, null, 2)}\n`,
);
await writeFile(path.join(outDir, 'report.md'), formatTextEvalReport(meta, results));
process.stdout.write(`Report: ${path.join(outDir, 'report.md')}\n`);
