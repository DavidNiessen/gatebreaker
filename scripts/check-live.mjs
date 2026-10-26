// Opt-in developer check. One user-initiated resolution request per supplied URL.
// No downloads, emails, accounts, cookies, tokens or signed links are saved.
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const urls = process.argv.slice(2);
if (!urls.length || urls.length > 30) throw new Error('Pass 1–30 public Hypeddit gate URLs.');
for (const input of urls) {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    !['hypeddit.com', 'www.hypeddit.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error('Only public HTTPS Hypeddit URLs are supported.');
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
        return chrome.tabs.sendMessage(tab.id, { type: 'gatebreaker:resolve' });
      }, page.url());
      result.gate = state.gate;
      result.ok = state.result?.ok === true;
      if (state.result?.ok) {
        const url = new URL(state.result.url);
        result.method = state.result.method;
        result.destinationOrigin = url.origin;
        // S3 signatures can be bound to GET: HEAD would fail even for valid
        // downloads. Request one byte, then immediately cancel the body.
        const response = await fetch(url, {
          headers: { Range: 'bytes=0-0' },
          redirect: 'follow',
          signal: AbortSignal.timeout(12000),
        });
        result.destinationStatus = response.status;
        result.contentType = response.headers.get('content-type');
        result.contentRange = response.headers.get('content-range');
        await response.body?.cancel();
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
