// Optional public-source contract replay. Uses a disposable anonymous browser.
// All POSTs are blocked; no email, account consent, CAPTCHA or media is submitted.
// Only equality/count/empty-state metadata is written, never native field values.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url))
  .replaceAll('\\', '/')
  .replace(/\/$/, '');
const require = createRequire(root + '/package.json');
const { chromium } = require('playwright');
const { build } = require('esbuild');
const dir = new URL('../work/native-request-parity/', import.meta.url);
await mkdir(dir, { recursive: true });
await build({
  stdin: {
    contents: `export {captureWebsiteRequest,buildWebsiteRequest} from ${JSON.stringify(root + '/src/providers/hypeddit/request.ts')}; export {hypedditState} from ${JSON.stringify(root + '/src/providers/hypeddit/session.ts')};`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  globalName: 'GatebreakerTest',
  platform: 'browser',
  outfile: fileURLToPath(new URL('request-browser.js', dir)),
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.GATEBREAKER_BROWSER
    ? { executablePath: process.env.GATEBREAKER_BROWSER }
    : { channel: 'chromium' }),
});
try {
  const context = await browser.newContext();
  let nativeBody;
  const blockedPosts = [];
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      blockedPosts.push(url.pathname);
      if (url.origin === 'https://hypeddit.com' && url.pathname === '/gate/download/ul') {
        nativeBody = req.postData();
        await route.fulfill({
          contentType: 'application/json',
          body: '{"download_status":false,"URL":""}',
        });
      } else await route.abort();
    } else if (
      ['media', 'font'].includes(req.resourceType()) ||
      ![
        'https://hypeddit.com',
        'https://ajax.googleapis.com',
        'https://www.google.com',
        'https://www.gstatic.com',
      ].includes(url.origin)
    )
      await route.abort();
    else await route.continue();
  });
  const page = await context.newPage();
  let nativeDigest;
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === 'https://hypeddit.com' && url.pathname.endsWith('/gate-ul-preview.js'))
      nativeDigest = response
        .body()
        .then((body) => createHash('sha256').update(body).digest('hex'));
  });
  await page.goto('https://hypeddit.com/sylver/turnthetidevenomiqueschranzedit', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () =>
      window.jQuery &&
      window.jQuery._data(document.getElementById('gateDownloadButton'), 'events')?.click?.length,
  );
  await page.addScriptTag({ path: fileURLToPath(new URL('request-browser.js', dir)) });
  const pendingResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/gate/download/ul',
  );
  const info = await page.evaluate(() => {
    const doc = document;
    const savedRandom = Math.random;
    Math.random = () => 0.5;
    doc.querySelector('#section-ten')?.classList.remove('upcomming-slide');
    doc.querySelector('#email_address').value = 'gatebreakeros@proton.me';
    doc.querySelector('#lifetime_fan_sp').value = '0';
    const skip = doc.createElement('input');
    skip.type = 'hidden';
    skip.name = 'skip_gate_steps[]';
    skip.value = 'sc';
    doc.body.append(skip);
    GatebreakerTest.hypedditState(doc).acceptedEmail = 'gatebreakeros@proton.me';
    const extension = GatebreakerTest.buildWebsiteRequest({
      id: doc.querySelector('#current_download_file_listner').value,
      metadata: { websiteRequest: GatebreakerTest.captureWebsiteRequest(doc) },
    }).toString();
    doc.querySelector('#gateDownloadButton').click();
    Math.random = savedRandom;
    return { jquery: window.jQuery.fn.jquery, extension };
  });
  await pendingResponse;
  if (!nativeBody) throw Error('Native request not intercepted');
  const native = new URLSearchParams(nativeBody),
    extension = new URLSearchParams(info.extension);
  const keys = [...new Set([...native.keys(), ...extension.keys()])];
  const report = {
    checkedAt: new Date().toISOString(),
    jquery: info.jquery,
    nativeSha256: nativeDigest ? await nativeDigest : null,
    deterministicRandomForReplay: 0.5,
    allPostsBlocked: true,
    blockedPosts,
    comparison: keys.map((key) => ({
      key,
      nativeCount: native.getAll(key).length,
      extensionCount: extension.getAll(key).length,
      equal: JSON.stringify(native.getAll(key)) === JSON.stringify(extension.getAll(key)),
      nativeEmpty: native.getAll(key).every((v) => v === ''),
      extensionEmpty: extension.getAll(key).every((v) => v === ''),
    })),
  };
  if (report.comparison.some((row) => !row.equal))
    throw Error(
      'Native request mismatch: ' +
        report.comparison
          .filter((row) => !row.equal)
          .map((row) => row.key)
          .join(','),
    );
  await writeFile(new URL('browser-comparison.json', dir), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
