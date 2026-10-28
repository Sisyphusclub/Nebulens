import process from 'node:process';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { runMigrations } from './db/drizzle.js';
import { logger } from './logger.js';
import { seedDefaultAdminIfEnabled } from './services/defaultAdminSeed.service.js';
import { createProviderFromEnv } from './services/providers/createProviderFromEnv.js';
import { withStructuredVisibleText } from './services/providers/withStructuredVisibleText.js';

runMigrations();
await seedDefaultAdminIfEnabled();

const baseProvider = createProviderFromEnv();
const provider = env.TEXT_PROMPT_STRUCTURING
  ? withStructuredVisibleText(baseProvider)
  : baseProvider;

const app = createApp({ provider });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server: listening');
});

function shutdown(sig: string): void {
  logger.info({ sig }, 'shutdown: closing server');
  server.close((err) => {
    if (err) {
      logger.error({ sig, err }, 'shutdown: error while closing server');
      process.exit(1);
      return;
    }
    logger.info({ sig }, 'shutdown: server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn({ sig }, 'shutdown: force-exit after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
