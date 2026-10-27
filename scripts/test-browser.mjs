import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availablePort, installFirefoxAddon } from './firefox-debugger.mjs';
import { testNativeActions } from './test-native-actions.mjs';
import { testExtraProviders } from './test-extra-providers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const browserName = process.argv[2] ?? 'chrome';
if (!['chrome', 'firefox'].includes(browserName)) throw new Error('Use chrome or firefox');
const extensionPath = path.join(root, 'dist', browserName);
const profile = await mkdtemp(path.join(tmpdir(), 'gatebreaker-test-'));
const screenshots = path.join(root, 'work/browser', browserName);
await mkdir(screenshots, { recursive: true });
const port = browserName === 'firefox' ? await availablePort() : null;
const firefoxUuid = '9e4c95de-7179-4727-8f0c-79b61b6f04ef';
const context =
  browserName === 'chrome'
    ? await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        ...(process.env.GATEBREAKER_BROWSER
          ? { executablePath: process.env.GATEBREAKER_BROWSER }
          : {}),
        ignoreDefaultArgs: ['--disable-extensions', '--disable-popup-blocking'],
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      })
    : await firefox.launchPersistentContext(profile, {
        headless: true,
        args: ['--start-debugger-server', String(port)],
        firefoxUserPrefs: {
          'devtools.debugger.remote-enabled': true,
          'devtools.debugger.prompt-connection': false,
          'devtools.chrome.enabled': true,
          'xpinstall.signatures.required': false,
          'extensions.webextensions.uuids': JSON.stringify({
            'gatebreaker@davidniessen.github.io': firefoxUuid,
          }),
        },
      });

context.setDefaultTimeout(15000);
let mode = 'blocked';
let probes = 0;
const posts = [];
const errors = [];
const fixture = `<!doctype html><html><head><meta name="csrf-token" content="fixture-csrf"><title>Fixture gate</title></head><body style="max-width:520px;margin:48px auto;font:16px system-ui;background:#fafaf8"><h1>Fixture track</h1><a id="downloadProcess" href="#">Original download</a><input type="hidden" id="current_download_file_listner" value="fixture01"><input type="hidden" id="nwSteps" value="email,sc,sp,yt,ig,tk"><input type="hidden" id="wrndk" value="fixture-token"><input type="hidden" id="is_unlimited" value="1"></body></html>`;

try {
  if (browserName === 'firefox') {
    const result = await installFirefoxAddon(port, extensionPath);
    assert.equal(result.addon.id, 'gatebreaker@davidniessen.github.io');
  }
  await context.route('https://hypeddit.com/**', async (route) => {
    if (route.request().url().endsWith('/gate/download/ul')) {
      posts.push(new URLSearchParams(route.request().postData() ?? ''));
      if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 600));
      const response =
        mode === 'success' || mode === 'slow'
          ? {
              download_status: true,
              URL: 'https://hypeddit-gates-prod.s3.amazonaws.com/fixture01_main?test=1',
            }
          : mode === 'unsafe'
            ? { download_status: true, URL: 'https://hypeddit.com.evil.invalid/download/music' }
            : { download_status: true, URL: '' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    } else await route.fulfill({ status: 200, contentType: 'text/html', body: fixture });
  });
  await context.route('https://hypeddit-gates-prod.s3.amazonaws.com/**', async (route) => {
    probes++;
    await route.fulfill({
      status: mode === 'public' ? 200 : 403,
      contentType: 'audio/mpeg',
      body: '',
    });
  });
  if (browserName === 'firefox') {
    // Playwright does not expose Firefox extension document targets reliably.
    // Exercise the real installed add-on through its in-page controls instead.
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('https://hypeddit.com/fixture/track');
    const panel = page.locator('#gatebreaker-panel');
    await panel.waitFor();
    assert.equal(probes, 0);
    assert.equal(posts.length, 0);
    await panel.getByRole('button').click();
    await panel.getByRole('status').filter({ hasText: 'did not release' }).waitFor();
    assert.equal(await panel.getByRole('link').count(), 0);
    // Firefox does not expose extension-background network requests to
    // Playwright routing. Its fixed nonexistent public object falls back to
    // the intercepted same-origin POST; public success is covered in Chrome.
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].getAll('skip_gate_steps[]'), ['email', 'sc', 'sp', 'yt', 'ig', 'tk']);
    await page.screenshot({ path: path.join(screenshots, 'panel-blocked.png') });
    mode = 'success';
    await panel.getByRole('button').click();
    await panel.getByRole('link', { name: 'Open download' }).waitFor();
    assert.equal(
      await panel.getByRole('link').getAttribute('href'),
      'https://hypeddit-gates-prod.s3.amazonaws.com/fixture01_main?test=1',
    );
    await page.screenshot({ path: path.join(screenshots, 'panel-success.png') });
    mode = 'unsafe';
    await panel.getByRole('button').click();
    await panel.getByRole('status').filter({ hasText: 'unrecognized' }).waitFor();
    assert.equal(await panel.getByRole('link').count(), 0);
    assert.deepEqual(errors, []);
    mode = 'blocked';
    await testNativeActions({ context, browserName, screenshots });
    await testExtraProviders({ context, browserName, screenshots });
    console.log(
      'Firefox installed extension integration passed: detection, no automatic API requests, public-file fallback, skip request, blocked/success/unsafe flows. Popup and public-file success runtime were verified in Chrome; Firefox extension documents are outside this Playwright check.',
    );
  } else {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const popup = await context.newPage();
    popup.on('pageerror', (error) => errors.push(error.message));
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('https://hypeddit.com/fixture/track');
    await page.waitForSelector('#gatebreaker-panel');
    assert.equal(probes, 0, 'Inspection must not make requests');
    assert.equal(posts.length, 0);
    await page.bringToFront();
    try {
      await popup.goto(
        `${browserName === 'chrome' ? 'chrome-extension' : 'moz-extension'}://${id}/popup.html`,
        { waitUntil: 'domcontentloaded', timeout: 5000 },
      );
    } catch (error) {
      await popup.screenshot({
        path: path.join(screenshots, 'popup-navigation-debug.png'),
        timeout: 5000,
      });
      console.log('Popup navigation state:', popup.url(), await popup.title());
      throw error;
    }
    // The real popup targets the active website tab. A test tab is set active
    // explicitly because popup.html is opened as a normal extension page here.
    await popup.evaluate(async () => {
      const api = globalThis.browser ?? chrome;
      const [gateTab] = await api.tabs.query({ url: 'https://hypeddit.com/*' });
      await api.tabs.update(gateTab.id, { active: true });
    });
    await popup.reload();
    await popup.waitForFunction(
      () => document.querySelector('#state').textContent === 'Hypeddit detected',
    );
    assert.equal(await popup.locator('#gate-title').textContent(), 'Fixture track');
    await popup.waitForTimeout(200);
    await popup.locator('body').screenshot({ path: path.join(screenshots, 'popup-ready.png') });

    await popup.locator('#resolve').click();
    await popup.waitForFunction(
      () => document.querySelector('#state').textContent === 'Unable to skip',
    );
    assert.match(await popup.locator('#description').textContent(), /did not release/);
    assert.equal(await popup.locator('#download').isVisible(), false);
    assert.equal(probes, 1);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].getAll('skip_gate_steps[]'), ['email', 'sc', 'sp', 'yt', 'ig', 'tk']);
    assert.equal(posts[0].has('email'), false);
    await popup.waitForTimeout(200);
    await popup.locator('body').screenshot({ path: path.join(screenshots, 'popup-blocked.png') });
    await page.screenshot({ path: path.join(screenshots, 'panel-blocked.png') });

    mode = 'success';
    await popup.locator('#resolve').click();
    await popup.waitForFunction(
      () => document.querySelector('#state').textContent === 'Link ready',
    );
    assert.equal(
      await popup.locator('#download').getAttribute('href'),
      'https://hypeddit-gates-prod.s3.amazonaws.com/fixture01_main?test=1',
    );
    await popup.waitForTimeout(200);
    await popup.locator('body').screenshot({ path: path.join(screenshots, 'popup-success.png') });
    mode = 'unsafe';
    await popup.locator('#resolve').click();
    await popup.waitForFunction(
      () => document.querySelector('#state').textContent === 'Unable to skip',
    );
    assert.match(await popup.locator('#description').textContent(), /unrecognized/);
    assert.equal(await popup.locator('#download').isVisible(), false);
    mode = 'public';
    const previousPosts = posts.length;
    await popup.locator('#resolve').click();
    await popup.waitForFunction(
      () => document.querySelector('#state').textContent === 'Link ready',
    );
    assert.equal(posts.length, previousPosts, 'Public files should skip the POST endpoint');
    await popup.locator('#enabled').uncheck();
    await page.waitForSelector('#gatebreaker-panel', { state: 'detached' });
    await popup.waitForFunction(() => document.querySelector('#resolve').disabled);
    await popup.locator('#enabled').check();
    await page.waitForSelector('#gatebreaker-panel');
    await popup.waitForFunction(() => !document.querySelector('#resolve').disabled);

    // No page-facing bridge should accept a forged provider action.
    const priorProbes = probes;
    await page.evaluate(() =>
      window.postMessage({ type: 'gatebreaker:public-file', gateId: 'fixture01' }, '*'),
    );
    await page.waitForTimeout(250);
    assert.equal(probes, priorProbes);
    assert.deepEqual(errors, []);
    mode = 'blocked';
    await testNativeActions({ context, browserName, screenshots, popup });
    await testExtraProviders({ context, browserName, screenshots, popup });
    console.log(
      `${browserName} extension integration passed: detection, no automatic requests, blocked/success/unsafe/public flows, settings, and no page message bridge.`,
    );
  }
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await context.close();
  const relative = path.relative(tmpdir(), profile);
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !path.basename(profile).startsWith('gatebreaker-test-')
  )
    throw new Error('Unsafe test profile cleanup');
  await rm(profile, { recursive: true, force: true });
}
