import { mkdtempSync } from 'node:fs';
import type { AddressInfo, Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Test } from 'supertest';

// supertest binds `app.listen(0)` on the wildcard `::` address but sends the
// request to 127.0.0.1:<port>. On macOS a socket already bound to
// 127.0.0.1:<port> by another process takes that traffic, so requests randomly
// reach a foreign server (seen as unexpected 401s). Bind test servers to
// loopback instead and send the request once the port is known.
type LoopbackTest = Test & { _server?: Server; loopbackPath?: string };
const originalServerAddress = Test.prototype.serverAddress;
const originalEnd = Test.prototype.end;
Test.prototype.serverAddress = function (this: LoopbackTest, app, requestPath) {
  if (typeof app === 'string' || typeof app === 'function' || app.address() !== null) {
    return originalServerAddress.call(this, app, requestPath);
  }
  this._server = app.listen(0, '127.0.0.1');
  this.loopbackPath = requestPath;
  // Placeholder; the real port is filled in by `end` after `listening`.
  return `http://127.0.0.1${requestPath}`;
};
Test.prototype.end = function (this: LoopbackTest, callback) {
  const server = this._server;
  const loopbackPath = this.loopbackPath;
  if (server === undefined || loopbackPath === undefined || server.listening) {
    return originalEnd.call(this, callback);
  }
  server.once('listening', () => {
    const { port } = server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}${loopbackPath}`;
    originalEnd.call(this, callback);
  });
  return this;
};

const root = mkdtempSync(path.join(tmpdir(), 'nebulens-test-'));

process.env.IMAGE_API_BASE_URL ??= 'https://test.example.com';
process.env.IMAGE_API_KEY ??= 'test-key';
process.env.GEMINI_IMAGE_API_KEY ??= 'test-gemini-key';
process.env.USER_API_KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.OPENAI_COMPAT_API_KEY ??= 'test-openai-compat-key';
process.env.LOG_LEVEL ??= 'silent';
process.env.UPLOAD_DIR ??= path.join(root, 'uploads');
process.env.OUTPUT_DIR ??= path.join(root, 'outputs');
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-32-chars-min-padding-padding';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';
process.env.SQLITE_PATH ??= path.join(root, 'app.sqlite');
process.env.DAILY_USER_QUOTA ??= '20';
process.env.DAILY_CHECK_IN_REWARD ??= '5';
process.env.SEED_DEFAULT_ADMIN ??= 'false';

// Run drizzle migrations once for the test process. Subsequent test files share
// the same SQLite file via the better-sqlite3 module-level singleton.
const { runMigrations } = await import('../src/db/drizzle.js');
runMigrations();
