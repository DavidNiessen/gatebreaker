// Opt-in developer check. Recover destinations without opening them by default.
// No emails, accounts, cookies, tokens or full destination URLs are saved.
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerHosts } from './provider-hosts.mjs';

const verifyDestinations = process.argv.includes('--verify-destinations');
const urls = process.argv.slice(2).filter((value) => value !== '--verify-destinations');
if (!urls.length || urls.length > 30) throw new Error('Pass 1–30 supported public gate URLs.');
for (const input of urls) {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    !providerHosts.includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error('Only configured public HTTPS gate origins are supported.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const extensionPath = path.join(root, 'dist/chrome');
const profile = await mkdtemp(path.join(tmpdir(), 'gatebreaker-live-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue();
    if (
      url.origin === 'https://d29xpkeqnsbaz3.cloudfront.net' &&
      route.request().method() === 'GET' &&
      /^\/[A-Za-z0-9-]{1,100}\/(?:js|css)\/[^/]+\.(?:js|css)$/.test(url.pathname)
    )
      return route.continue();
    if (
      url.origin === 'https://firestore.googleapis.com' &&
      ['GET', 'POST', 'OPTIONS'].includes(route.request().method()) &&
      ((url.pathname === '/google.firestore.v1.Firestore/Listen/channel' &&
        new URL(route.request().frame().url()).hostname === 'www.valorizd.app' &&
        (!url.searchParams.has('database') ||
          url.searchParams.get('database') === 'projects/valorizd-d6172/databases/(default)')) ||
        url.pathname === '/v1/projects/valorizd-d6172/databases/(default)/documents:runQuery' ||
        (url.pathname === '/v1/projects/valorizd-d6172/databases/(default)/documents:batchGet' &&
          new URL(route.request().frame().url()).hostname === 'www.valorizd.app'))
    )
      return route.continue();
    if (
      url.protocol === 'https:' &&
      url.hostname === 'api.rekonise.com' &&
      ['GET', 'OPTIONS'].includes(route.request().method()) &&
      /^\/social-unlocks\/[A-Za-z0-9_.%-]+(?:\/[A-Za-z0-9_.%-]+)?$/.test(url.pathname)
    )
      return route.continue();
    if (
      url.protocol === 'https:' &&
      (providerHosts.includes(url.hostname) ||
        (url.hostname === 'hypeddit-gates-prod.s3.amazonaws.com' &&
          route.request().method() === 'HEAD'))
    )
      return route.continue();
    return route.abort();
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  const page = await context.newPage();
  for (const input of urls) {
    const result = { url: input, checkedAt: new Date().toISOString() };
    try {
      await page.goto(input, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#gatebreaker-panel', { timeout: 10000 });
      const state = await popup.evaluate(async (targetUrl) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((item) => item.url === targetUrl);
        if (!tab) throw new Error('Live gate tab not found');
        return chrome.tabs.sendMessage(tab.id, {
          type: 'gatebreaker:resolve',
          anonymousOnly: true,
        });
      }, page.url());
      result.gate = state.gate;
      result.ok = state.result?.ok === true;
      if (state.result?.ok) {
        const url = new URL(state.result.url);
        result.method = state.result.method;
        result.destinationOrigin = url.origin;
        result.hasFragment = !!url.hash;
        result.destinationVerification = verifyDestinations ? 'requested' : 'not-requested';
        if (verifyDestinations) {
          // S3 signatures can be bound to GET: HEAD would fail even for valid
          // downloads. Request one byte, then immediately cancel the body.
          const response = await fetch(url, {
            headers: { Range: 'bytes=0-0' },
            redirect: 'error',
            signal: AbortSignal.timeout(12000),
          });
          result.destinationStatus = response.status;
          result.contentType = response.headers.get('content-type');
          result.contentRange = response.headers.get('content-range');
          await response.body?.cancel();
        }
      } else result.code = state.result?.code ?? 'not-supported';
    } catch (error) {
      result.error = error.name;
    }
    console.log(JSON.stringify(result));
  }
} finally {
  await context.close();
  const relative = path.relative(tmpdir(), profile);
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !path.basename(profile).startsWith('gatebreaker-live-')
  )
    throw new Error('Unsafe profile cleanup');
  await rm(profile, { recursive: true, force: true });
}
