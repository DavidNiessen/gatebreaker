import assert from 'node:assert/strict';
import path from 'node:path';

const cdn = 'https://d29xpkeqnsbaz3.cloudfront.net/authored-deployment/js/products.js';
const fileOrigin = 'https://routenote-push.s3.eu-west-2.amazonaws.com';
const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function signedFile(id, name) {
  const query = new URLSearchParams({
    'response-content-disposition': `attachment; filename="${name}"`,
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': 'AUTHORED/20261027/eu-west-2/s3/aws4_request',
    'X-Amz-Date': '20261027T140000Z',
    'X-Amz-SignedHeaders': 'host',
    'X-Amz-Expires': '300',
    'X-Amz-Signature': 'a'.repeat(64),
  });
  return {
    name,
    type: 'audio/wav',
    size: 1048576,
    content_id: id,
    url: `${fileOrigin}/777001/authored-${id}.wav?${query}`,
  };
}

function pageHtml(item) {
  return `<!doctype html><html><head><title>Authored PUSH.fm browser fixture</title><meta property="og:title" content="${escapeHtml(item.title)}">
    <style>body{max-width:560px;margin:32px auto;padding:0 16px;font:16px system-ui;background:#fafaf8}button{padding:10px;margin:5px}</style></head><body>
    <main ${item.alias ? 'id="app"' : ''}><header><div><span class="leading-normal inline-block w-full text-xl font-bold text-black break-word">${escapeHtml(item.title)}</span></div><button type="button" data-untouched>Original preview</button></header>
    <div class="relative block w-full bg-indigo-5 h-2 px-4">Original progress</div><div class="block w-full text-left px-4 pb-6"><h2>Complete the steps</h2><button type="button" data-native>Original SoundCloud connect</button><button type="button" data-native>Original YouTube subscribe</button><form><input type="email" name="email"><button type="button" data-native>Original email submit</button></form><div class="block w-full text-center mt-4"><button type="button" data-native>Original download</button></div></div></main>
    <div class="cta-banner-lift"><button type="button">Original reward link promotion</button></div><footer><button type="button" data-untouched>Original help</button></footer><script>window.nativeActions=0;document.querySelectorAll('[data-native]').forEach(button=>button.onclick=()=>window.nativeActions++);</script><script src="${cdn}"></script></body></html>`;
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Authored installed-browser fixtures only; no live IDs, account data or music files. */
export async function testPush({ context, browserName, screenshots, popup }) {
  const first = signedFile(101, 'Authored main mix.wav');
  const second = signedFile(102, 'Authored extended mix.wav');
  const cases = [
    {
      slug: 'authored-push-multiple',
      title: 'Authored PUSH.fm two-file reward',
      files: [first, second],
    },
    {
      slug: 'authored-push-single',
      title: 'Authored PUSH.fm single file',
      files: [first],
      alias: true,
    },
    {
      slug: 'authored-push-url',
      title: 'Authored PUSH.fm URL reward',
      destination: 'https://mega.nz/file/authored-push#authored-push-key',
    },
    {
      slug: 'authored-push-empty',
      title: 'Authored empty file response',
      files: [],
      contentCount: 1,
      error: /unexpected reward file list/,
    },
    {
      slug: 'authored-push-denied',
      title: 'Authored metadata refusal',
      files: [first],
      metadataStatus: 403,
      error: /did not release this reward/,
    },
    {
      slug: 'authored-push-server',
      title: 'Authored completion service error',
      files: [first],
      completionStatus: 500,
      error: /could not process this reward/,
    },
    {
      slug: 'authored-push-malformed',
      title: 'Authored malformed completion JSON',
      files: [first],
      malformed: true,
      error: /unreadable or oversized data/,
    },
    {
      slug: 'authored-push-mismatch',
      title: 'Authored mismatched metadata slug',
      files: [first],
      modelSlug: 'different-authored-push',
      error: /unexpected or unavailable reward details/,
    },
    {
      slug: 'authored-push-title',
      title: 'Authored unreadable metadata title',
      files: [first],
      modelTitle: 42,
      error: /unexpected or unavailable reward details/,
    },
    {
      slug: 'authored-push-unsafe',
      title: 'Authored unsafe reward',
      destination: 'javascript:alert("authored-push")',
      error: /unsafe or recursive destination/,
    },
    {
      slug: 'authored-push-duplicate',
      title: 'Authored duplicate file reward',
      files: [first, first],
      error: /unsafe or duplicate file address/,
    },
    {
      slug: 'authored-push-retry',
      title: 'Authored completion rate-limit retry',
      files: [first],
      retry: true,
    },
    {
      slug: 'authored-push-cancel',
      title: 'Authored cancelled reward lookup',
      files: [first],
      slow: true,
      cancel: true,
    },
    {
      slug: 'authored-push-navigation',
      title: 'Authored navigation during lookup',
      files: [first],
      slow: true,
      navigate: true,
    },
  ].map((item) => ({
    ...item,
    url: `https://push.fm/${item.alias ? 'unlock' : 'cu'}/${item.slug}`,
  }));
  const byUrl = new Map(cases.map((item) => [item.url, item]));
  const bySlug = new Map(cases.map((item) => [item.slug, item]));
  const counts = new Map(cases.map((item) => [item.slug, { metadata: 0, completion: 0 }]));
  const delays = new Map(cases.filter((item) => item.slow).map((item) => [item.slug, deferred()]));
  const errors = [];
  const badRequests = [];
  let destinationRequests = 0;
  let scripts = 0;
  const providerRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.isNavigationRequest()) {
      assert.equal(request.method(), 'GET', 'Native email/account form submissions are forbidden');
      const item = byUrl.get(request.url());
      await route.fulfill({
        contentType: 'text/html',
        body: item
          ? pageHtml(item)
          : '<!doctype html><html><body><h1>Authored PUSH creator profile</h1></body></html>',
      });
      return;
    }
    if (url.pathname === '/favicon.ico' && request.method() === 'GET') {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    const metadata = /^\/api\/guest\/unlock\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    const completion = /^\/unlock\/([A-Za-z0-9_-]+)\/complete$/.exec(url.pathname);
    const item = bySlug.get(metadata?.[1] ?? completion?.[1]);
    if (!item || request.method() !== 'GET') {
      badRequests.push(`${request.method()} ${url.pathname}`);
      await route.abort();
      return;
    }
    assert.equal(request.headers()['accept'], 'application/json');
    assert.equal(request.headers()['x-requested-with'], 'XMLHttpRequest');
    assert.equal(request.headers()['authorization'], undefined);
    assert.equal(request.headers()['cookie'], undefined);
    assert.equal(
      request.postData(),
      null,
      'Account, email, action and telemetry bodies must not be sent',
    );
    const count = counts.get(item.slug);
    let status;
    let body;
    if (metadata) {
      assert.equal(url.search, '');
      count.metadata++;
      if (item.slow) await delays.get(item.slug).promise;
      status = item.metadataStatus ?? 200;
      body = JSON.stringify({
        slug: item.modelSlug ?? item.slug,
        title: item.modelTitle ?? item.title,
        type: item.files ? 'file' : 'url',
        content_count: item.contentCount ?? item.files?.length ?? 1,
        isSoftDeleted: false,
        actions: [{ id: 777, driver: 'youtube-subscribe', required: true }],
        minimum_actions: 1,
        creator: { email: 'authored-creator@example.invalid' },
      });
    } else {
      count.completion++;
      assert.deepEqual([...url.searchParams.keys()], ['token']);
      assert.deepEqual(
        JSON.parse(Buffer.from(url.searchParams.get('token'), 'base64').toString('utf8')),
        { actions: {} },
        'Only the native empty action object may be supplied',
      );
      status = item.retry && count.completion === 1 ? 429 : (item.completionStatus ?? 200);
      body = item.malformed
        ? '{authored malformed json'
        : JSON.stringify(item.files ?? { body: item.destination });
    }
    try {
      await route.fulfill({ status, contentType: 'application/json', body });
    } catch (error) {
      if (!item.slow) throw error;
    }
  };
  const scriptRoute = async (route) => {
    scripts++;
    await route.fulfill({
      contentType: 'application/javascript',
      body: '// Authored PUSH native marker; no API calls or actions.',
    });
  };
  const blockDestination = async (route) => {
    destinationRequests++;
    await route.abort();
  };
  const unavailableRoute = async (route) => {
    assert.equal(route.request().method(), 'GET');
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Authored unavailable tab</title></head><body><h1>Authored page without an extension receiver</h1></body></html>',
    });
  };
  await context.route('https://push.fm/**', providerRoute);
  await context.route(cdn, scriptRoute);
  await context.route(`${fileOrigin}/**`, blockDestination);
  await context.route('https://mega.nz/**', blockDestination);
  await context.route('https://unavailable.example.invalid/**', unavailableRoute);
  const page = await context.newPage();
  const slowPage = await context.newPage();
  for (const target of [page, slowPage])
    target.on('pageerror', (error) => errors.push(error.message));
  const expectedPages = context.pages().length;
  async function bindPopup(item, state = 'PUSH.fm detected') {
    if (!popup) return;
    await popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((entry) => entry.url === url);
      if (!tab?.id) throw new Error('Authored PUSH tab not found');
      await chrome.tabs.update(tab.id, { active: true });
    }, item.url);
    await popup.reload();
    await popup.waitForFunction(
      (text) => document.querySelector('#state')?.textContent === text,
      state,
    );
    assert.equal(await popup.locator('#native-actions').isVisible(), false);
  }
  async function assertNoActivity(target) {
    assert.equal(await target.evaluate(() => window.nativeActions), 0);
    assert.equal(await target.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(destinationRequests, 0);
  }
  try {
    for (const item of cases.filter((item) => !item.slow)) {
      await page.goto(item.url, { waitUntil: 'load' });
      const panel = page.locator('#gatebreaker-panel');
      await panel.waitFor();
      assert.deepEqual(
        counts.get(item.slug),
        { metadata: 0, completion: 0 },
        'Loading alone must not resolve a reward',
      );
      assert.equal(await page.locator('div.block.w-full.text-left.px-4.pb-6').isVisible(), true);
      assert.equal(
        await page.locator('div.relative.block.w-full.bg-indigo-5.h-2.px-4').isVisible(),
        true,
      );
      assert.equal(
        await page.locator('div.cta-banner-lift').isVisible(),
        true,
        'Native website content stays available',
      );
      assert.equal(
        await page.getByRole('button', { name: 'Original preview', exact: true }).isVisible(),
        true,
      );
      assert.equal(
        await page.getByRole('button', { name: 'Original help', exact: true }).isVisible(),
        true,
      );
      await assertNoActivity(page);
      if (item.slug === 'authored-push-multiple') await bindPopup(item);
      const trigger =
        popup && item.slug === 'authored-push-multiple'
          ? popup.locator('#resolve')
          : panel.getByRole('button', { name: 'Download', exact: true });
      await trigger.click();
      if (item.retry) {
        await panel.getByRole('button', { name: 'Try again', exact: true }).waitFor();
        assert.match(await panel.getByRole('status').first().innerText(), /limiting requests/);
        assert.deepEqual(counts.get(item.slug), { metadata: 1, completion: 1 });
        await panel.getByRole('button', { name: 'Try again', exact: true }).click();
      }
      const picker = panel.getByRole('combobox', { name: 'Choose a file', exact: true });
      if (item.error) {
        await panel.getByRole('button', { name: 'Try again', exact: true }).waitFor();
        assert.match(await panel.getByRole('status').first().innerText(), item.error);
        assert.equal(await panel.getByRole('link').count(), 0);
        assert.equal(await picker.count(), 0);
        if (item.slug === 'authored-push-unsafe') {
          await page.waitForTimeout(200);
          await page.screenshot({
            animations: 'disabled',
            path: path.join(screenshots, 'panel-push-error.png'),
          });
        }
      } else if (item.files?.length > 1) {
        const link = panel.getByRole('link', { name: 'Open selected file', exact: true });
        await link.waitFor();
        await picker.waitFor();
        assert.deepEqual(
          await picker.locator('option').allTextContents(),
          item.files.map((file) => file.name),
        );
        assert.equal(await link.getAttribute('href'), item.files[0].url);
        assert.equal(
          await panel.getByRole('link').count(),
          1,
          'Multiple files share one primary opening action',
        );
        await picker.selectOption({ index: 1 });
        assert.equal(await link.getAttribute('href'), item.files[1].url);
        if (popup) {
          const popupPicker = popup.getByRole('combobox', { name: 'Choose a file', exact: true });
          await popupPicker.waitFor();
          await popupPicker.selectOption({ index: 1 });
          assert.equal(await popup.locator('#download').getAttribute('href'), item.files[1].url);
        }
        await page.evaluate(() => {
          document
            .querySelector('meta[property="og:title"]')
            .setAttribute('content', 'Authored PUSH status update');
          document.body.append(document.createElement('div'));
        });
        await page.waitForTimeout(350);
        assert.equal(await picker.evaluate((select) => select.selectedIndex), 1);
        assert.equal(
          await link.getAttribute('href'),
          item.files[1].url,
          'Unchanged result refresh preserves the selected file',
        );
        if (popup) {
          await popup.waitForFunction(
            () =>
              document.querySelector('#gate-title')?.textContent === 'Authored PUSH status update',
          );
          assert.equal(
            await popup
              .getByRole('combobox', { name: 'Choose a file', exact: true })
              .evaluate((select) => select.selectedIndex),
            1,
          );
          assert.equal(await popup.locator('#download').getAttribute('href'), item.files[1].url);
          const storage = await popup.evaluate(() => chrome.storage.local.get(null));
          assert(!JSON.stringify(storage).includes('AUTHORED'));
          assert(!JSON.stringify(storage).includes('X-Amz-Signature'));
          await popup.waitForTimeout(200);
          await popup.locator('body').screenshot({
            animations: 'disabled',
            path: path.join(screenshots, 'popup-push-multiple.png'),
          });
          const popupPicker = popup.getByRole('combobox', { name: 'Choose a file', exact: true });
          await popupPicker.focus();
          await popup.keyboard.press('Tab');
          await popup.keyboard.press('Shift+Tab');
          await popup.waitForTimeout(200);
          await popup.locator('body').screenshot({
            animations: 'disabled',
            path: path.join(screenshots, 'popup-push-multiple-focus.png'),
          });
          await popup.emulateMedia({ colorScheme: 'dark' });
          await popup.waitForTimeout(200);
          await popup.locator('body').screenshot({
            animations: 'disabled',
            path: path.join(screenshots, 'popup-push-multiple-dark.png'),
          });
          await popup.evaluate(() => document.activeElement?.blur());
          await popup.emulateMedia({ colorScheme: 'light' });
        }
        await page.waitForTimeout(200);
        await page.screenshot({
          animations: 'disabled',
          path: path.join(screenshots, 'panel-push-multiple.png'),
        });
        const originalViewport = page.viewportSize();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(200);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
          'The authored mobile file chooser must not create horizontal overflow',
        );
        await page.screenshot({
          animations: 'disabled',
          path: path.join(screenshots, 'panel-push-multiple-mobile.png'),
          fullPage: true,
        });
        await page.setViewportSize(originalViewport ?? { width: 1280, height: 720 });
      } else {
        const link = panel.getByRole('link', { name: 'Open destination', exact: true });
        await link.waitFor();
        assert.equal(await picker.count(), 0, 'Single rewards do not show a file chooser');
        assert.equal(await link.getAttribute('href'), item.files?.[0]?.url ?? item.destination);
        if (item.slug === 'authored-push-single') {
          await page.waitForTimeout(200);
          await page.screenshot({
            animations: 'disabled',
            path: path.join(screenshots, 'panel-push-single.png'),
          });
        }
      }
      const expectedMetadata = item.retry ? 2 : 1;
      const expectedCompletion =
        item.metadataStatus || item.modelSlug || item.modelTitle !== undefined
          ? 0
          : item.retry
            ? 2
            : 1;
      assert.deepEqual(counts.get(item.slug), {
        metadata: expectedMetadata,
        completion: expectedCompletion,
      });
      assert.equal(page.url(), item.url);
      await assertNoActivity(page);
      if (popup && item.slug === 'authored-push-multiple') {
        await page.goto('https://unavailable.example.invalid/authored-page', {
          waitUntil: 'load',
        });
        // Exercise the real sendMessage rejection. Observe synchronous pending UI
        // before the natural asynchronous missing-receiver failure; no API is mocked.
        const pending = await popup.evaluate(() => {
          document.querySelector('#resolve').click();
          const picker = document.querySelector('.destination-picker');
          const select = picker.querySelector('select');
          const download = document.querySelector('#download');
          return {
            state: document.querySelector('#state').textContent,
            pickerHidden: picker.hidden,
            pickerDisabled: select.disabled,
            options: select.options.length,
            downloadHidden: download.hidden,
            href: download.getAttribute('href'),
          };
        });
        assert.deepEqual(pending, {
          state: 'Checking',
          pickerHidden: true,
          pickerDisabled: true,
          options: 0,
          downloadHidden: true,
          href: null,
        });
        await popup.waitForFunction(
          () => document.querySelector('#state')?.textContent === 'Page unavailable',
        );
        assert.equal(await popup.locator('.destination-picker').isVisible(), false);
        assert.equal(await popup.locator('.destination-picker select').isDisabled(), true);
        assert.equal(await popup.locator('.destination-picker option').count(), 0);
        assert.equal(await popup.locator('#download').isVisible(), false);
        assert.equal(await popup.locator('#download').getAttribute('href'), null);
        assert.equal(destinationRequests, 0);
        await popup.waitForTimeout(200);
        await popup.locator('body').screenshot({
          animations: 'disabled',
          path: path.join(screenshots, 'popup-push-unavailable.png'),
        });
      }
    }
    for (const item of cases.filter((item) => item.slow)) {
      await slowPage.goto(item.url, { waitUntil: 'load' });
      const panel = slowPage.locator('#gatebreaker-panel');
      await panel.waitFor();
      await panel.getByRole('button', { name: 'Download', exact: true }).click();
      await panel.getByRole('button', { name: 'Cancel check', exact: true }).waitFor();
      await slowPage.waitForTimeout(100);
      assert.deepEqual(counts.get(item.slug), { metadata: 1, completion: 0 });
      if (item.cancel) {
        await bindPopup(item, 'Checking');
        await slowPage.waitForTimeout(200);
        await slowPage.screenshot({
          animations: 'disabled',
          path: path.join(screenshots, 'panel-push-checking.png'),
        });
        if (popup) {
          await popup.waitForTimeout(200);
          await popup.locator('body').screenshot({
            animations: 'disabled',
            path: path.join(screenshots, 'popup-push-checking.png'),
          });
          await popup.locator('#cancel').click();
        } else await panel.getByRole('button', { name: 'Cancel check', exact: true }).click();
        await panel.getByRole('status').filter({ hasText: 'Check cancelled' }).first().waitFor();
        delays.get(item.slug).release();
        await slowPage.waitForTimeout(250);
        assert.equal(await panel.getByRole('link').count(), 0);
        await assertNoActivity(slowPage);
      } else {
        await slowPage.goto('https://push.fm/creators/authored-fixture', { waitUntil: 'load' });
        delays.get(item.slug).release();
        await slowPage.waitForTimeout(250);
        assert.equal(await slowPage.locator('#gatebreaker-panel').count(), 0);
      }
      assert.deepEqual(
        counts.get(item.slug),
        { metadata: 1, completion: 0 },
        'Cancelled/stale lookups must not request completion',
      );
    }
    assert.equal(context.pages().length, expectedPages);
    assert.equal(destinationRequests, 0);
    assert.equal(scripts, cases.length);
    assert.deepEqual(badRequests, []);
    assert.deepEqual(errors, []);
    console.log(
      `${browserName} PUSH.fm integration passed: 14 authored cases; URL/single/multiple files, one explicit primary opening action, preserved chooser selection after status refresh, safe error/retry/cancel/navigation paths, native empty-action completion GET, no social/email/write or destination requests.`,
    );
  } finally {
    for (const delay of delays.values()) delay.release();
    await slowPage.close();
    await page.close();
    await context.unroute('https://push.fm/**', providerRoute);
    await context.unroute(cdn, scriptRoute);
    await context.unroute(`${fileOrigin}/**`, blockDestination);
    await context.unroute('https://mega.nz/**', blockDestination);
    await context.unroute('https://unavailable.example.invalid/**', unavailableRoute);
  }
}
