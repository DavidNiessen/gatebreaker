// Opt-in installed-extension matrix. Submits the configured email only with --allow-email.
// No account login/consent automation or full media transfer; delivery is intercepted.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)),
  require = createRequire(path.join(root, 'package.json'));
const arguments_ = process.argv.slice(2),
  inputFile = arguments_.find((value) => !value.startsWith('--'));
if (
  !inputFile ||
  !arguments_.includes('--allow-email') ||
  arguments_.some(
    (value) => value.startsWith('--') && !['--allow-email', '--verify-files'].includes(value),
  )
)
  throw Error(
    'Usage: npm run check:hypeddit -- public-urls.json --allow-email [--verify-files]. This opt-in check submits the configured email; it never signs in or downloads complete files.',
  );
const verifyFiles = arguments_.includes('--verify-files');
const { chromium } = require('playwright');
const { deliveryFixtureScript } = await import(
  pathToFileURL(root + '/scripts/fixture-delivery.mjs')
);
const name = new Date().toISOString().replace(/[:.]/g, '-');
const input = JSON.parse(await readFile(inputFile, 'utf8'));
if (!Array.isArray(input)) throw Error('Input must be a JSON array of public Hypeddit URLs.');
const urls = input.map((value) => (typeof value === 'string' ? value : value.url));
if (!urls.length || urls.length > 90) throw Error('Invalid bounded matrix');
for (const value of urls) {
  const u = new URL(value);
  if (u.origin !== 'https://hypeddit.com' || u.search || u.hash)
    throw Error('Public Hypeddit URLs only');
}
const dir = path.join(root, 'work', 'hypeddit-live', name);
await mkdir(dir, { recursive: true });
const extensionPath = path.join(dir, 'extension');
await cp(path.join(root, 'dist', 'chrome'), extensionPath, { recursive: true });
const bundleSha256 = createHash('sha256')
  .update(await readFile(path.join(extensionPath, 'content.js')))
  .digest('hex');
const profile = await mkdtemp(path.join(tmpdir(), 'gatebreaker-hypeddit-live-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  ...(process.env.GATEBREAKER_BROWSER ? { executablePath: process.env.GATEBREAKER_BROWSER } : {}),
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions', '--disable-popup-blocking'],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  await context.route('**/*', (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (r.resourceType() === 'media') return route.abort();
    if (!['http:', 'https:'].includes(u.protocol)) return route.continue();
    if (['GET', 'HEAD', 'OPTIONS'].includes(r.method())) return route.continue();
    if (
      u.origin === 'https://hypeddit.com' &&
      ['/gate/ge', '/verifyEmailAddress', '/gate/download/ul'].includes(u.pathname)
    )
      return route.continue();
    return route.abort();
  });
  let worker =
    context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ??
    (await context.waitForEvent('serviceworker'));
  await worker.evaluate(() => chrome.storage.local.set({ enabled: true }));
  // Delivery boundary is intercepted deliberately; resolution and file access are separate facts.
  await worker.evaluate(deliveryFixtureScript);
  const page = context.pages()[0] ?? (await context.newPage()),
    records = [],
    seen = new Set();
  let current = null,
    mode = 'extension';
  context.on('response', (response) => {
    void (async () => {
      const u = new URL(response.url());
      if (!current || u.origin !== 'https://hypeddit.com') return;
      const row = current;
      if (u.pathname === '/spotify_callback') {
        row.spotifyCallbacks ??= [];
        row.spotifyCallbacks.push({ at: new Date().toISOString(), status: response.status() });
      }
      if (u.pathname === '/gate/ge') row.handshake = response.status();
      if (u.pathname === '/verifyEmailAddress') {
        try {
          const value = await response.json();
          row.email = { status: response.status(), accepted: value.status === 'T' };
        } catch {
          row.email = { status: response.status(), json: false };
        }
      }
      if (u.pathname === '/gate/download/ul') {
        try {
          const value = await response.json();
          row.posts.push({
            mode,
            at: new Date().toISOString(),
            status: response.status(),
            downloadStatus: value.download_status === true,
            destinationPresent: typeof value.URL === 'string' && !!value.URL,
          });
        } catch {
          row.posts.push({ mode, status: response.status(), json: false });
        }
      }
    })().catch(() => {});
  });
  async function save() {
    await writeFile(
      path.join(dir, 'results.json'),
      JSON.stringify(
        {
          version: JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'))
            .version,
          bundleSha256,
          deliveryIntercepted: true,
          records,
        },
        null,
        2,
      ),
    );
  }
  async function verify(address) {
    try {
      const u = new URL(address);
      if (u.protocol !== 'https:' || u.username || u.password || u.port) throw Error('Unsafe URL');
      const response = await fetch(address, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const result = {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentRange: response.headers.get('content-range'),
      };
      if (response.status === 206 && /^bytes 0-0\/\d+$/.test(result.contentRange ?? '')) {
        const bytes = await response.arrayBuffer();
        result.retainedBytes = bytes.byteLength;
        result.verified = bytes.byteLength === 1;
      } else await response.body?.cancel();
      return result;
    } catch (error) {
      return { errorType: error.name };
    }
  }
  try {
    for (const url of urls) {
      current = { url, checkedAt: new Date().toISOString(), posts: [] };
      records.push(current);
      mode = 'extension';
      try {
        await worker.evaluate(() => {
          globalThis.gatebreakerFixtureDeliveries.length = 0;
        });
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        current.pageStatus = response?.status() ?? null;
        current.metadata = await page.evaluate(() => {
          const field = (id) => document.getElementById(id)?.value ?? '';
          return {
            gateId: field('current_download_file_listner'),
            title: document.title.slice(0, 180),
            steps: field('nwSteps'),
            choices: field('steps_select'),
            unlimited: field('is_unlimited'),
            isSkippable: field('is_skippable'),
            style: field('fangate_style'),
            design: field('gate_design_template'),
            configuredComments: {
              sc: field('comment_sc') === '1',
              yt: field('comment_yt') === '1',
            },
            linkGate: !!document.querySelector('#gateDownloadButton[data-type="linkGate"]'),
            skips: [...document.querySelectorAll('[data-step]')]
              .filter((e) => e.id === 'skipper' || e.id.startsWith('skipper_'))
              .map((e) => ({
                step: e.dataset.step,
                hidden: e.hidden || e.classList.contains('hide'),
              })),
          };
        });
        if (current.metadata.gateId && seen.has(current.metadata.gateId)) {
          current.classification = 'duplicate-gate';
          await save();
          continue;
        }
        if (current.metadata.gateId) seen.add(current.metadata.gateId);
        const panel = page.locator('#gatebreaker-panel');
        try {
          await panel.waitFor({ timeout: 7000 });
        } catch {
          current.classification = current.metadata.linkGate
            ? 'unsupported-link-gate'
            : current.pageStatus === 200
              ? 'unrecognized-layout'
              : 'page-unavailable';
          await save();
          console.log(JSON.stringify({ url, classification: current.classification }));
          continue;
        }
        await panel.getByRole('button', { name: 'Download', exact: true }).click({ timeout: 7000 });
        let deliveries = [];
        for (let n = 0; n < 60; n++) {
          deliveries = await worker.evaluate(() =>
            globalThis.gatebreakerFixtureDeliveries.map((x) => ({ kind: x.kind, url: x.url })),
          );
          const buttons = await panel.getByRole('button').allTextContents();
          current.controls = buttons
            .filter((t) => /Sign in with|Waiting for|Connected to|CAPTCHA|again|Download/.test(t))
            .map((t) => t.trim());
          const busy = await panel.locator('section').getAttribute('aria-busy');
          if (
            deliveries.length ||
            (busy !== 'true' && buttons.some((t) => /Sign in with|Solve CAPTCHA/.test(t))) ||
            (await panel.getByRole('alert').count())
          )
            break;
          const primary = buttons[0] ?? '';
          if (
            n > 5 &&
            !/Checking|Cancelling/.test(primary) &&
            !(await panel.getByRole('button').first().isDisabled()) &&
            (await panel.getByRole('status').count())
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (deliveries.length) {
          current.classification = 'extension-resolved';
          current.deliveryKinds = deliveries.map((d) => d.kind);
          current.fileCheck = verifyFiles
            ? await verify(deliveries[0].url)
            : { verification: 'not-requested' };
        } else if (current.controls?.some((t) => /CAPTCHA/.test(t)))
          current.classification = 'manual-captcha-required';
        else if (current.controls?.some((t) => /Sign in with/.test(t)))
          current.classification = 'login-required';
        else
          current.classification =
            current.email?.accepted === false
              ? 'email-rejected'
              : current.posts.some((p) => p.downloadStatus === false)
                ? 'server-refused'
                : 'not-resolved';
      } catch (error) {
        current.errorType = error.name;
        current.classification ??= 'check-error';
      }
      await save();
      console.log(
        JSON.stringify({
          url: current.url,
          steps: current.metadata?.steps,
          classification: current.classification,
          controlResolved: current.compatibilityControl?.downloadStatus,
          fileVerified:
            current.fileCheck?.verified ??
            current.compatibilityControl?.fileCheck?.verified ??
            false,
        }),
      );
    }
    console.log(
      JSON.stringify({
        event: 'complete',
        records: records.length,
        report: path.join(dir, 'results.json'),
      }),
    );
  } finally {
    await save();
  }
} finally {
  await context.close();
  const relative = path.relative(tmpdir(), profile);
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !path.basename(profile).startsWith('gatebreaker-hypeddit-live-')
  )
    throw Error('Unsafe temporary-profile cleanup');
  await rm(profile, { recursive: true, force: true });
}
