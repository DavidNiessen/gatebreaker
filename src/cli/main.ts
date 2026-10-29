#!/usr/bin/env node
import { run } from './run';

declare const GATEBREAKER_VERSION: string;
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});
process.exitCode = await run(process.argv.slice(2), {
  stdout: (value) => {
    process.stdout.write(value);
  },
  stderr: (value) => {
    process.stderr.write(value);
  },
  fetch: globalThis.fetch,
  signal: controller.signal,
  version: GATEBREAKER_VERSION,
});
