import assert from 'node:assert/strict';
import path from 'node:path';

const api =
  'https://firestore.googleapis.com/v1/projects/valorizd-d6172/databases/(default)/documents:runQuery';
const fields = [
  'slug',
  'title',
  'gateType',
  'reward.url',
  'reward.fileUrl',
  'reward.fileName',
  'steps',
  'emailCapture',
];
const gateChunk = '/_next/static/chunks/app/gates/%5BgateId%5D/page-aabbccddeeff0011.js';
const fileUrl =
  'https://firebasestorage.googleapis.com/v0/b/valorizd-d6172.firebasestorage.app/o/gates%2Fauthored-valorizd.wav?alt=media&token=authored-fixture-file-capability';
const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function pageHtml(item) {
  return `<!doctype html><html><head><title>Authored Valorizd browser fixture</title>
    <link rel="canonical" href="${item.url}"><meta property="og:url" content="${item.url}">
    <style>body{max-width:560px;margin:32px auto;padding:0 16px;font:16px system-ui;background:#fafaf8}button{padding:10px;margin:5px}</style>
    </head><body><header><button type="button" data-untouched>Original language</button></header><main><div class="relative overflow-hidden rounded-2xl"><div class="relative px-5 pb-5 pt-5 sm:px-6"><div class="relative">
    <div class="flex items-start gap-4"><div><button type="button" data-untouched>Original preview</button></div><div class="min-w-0 flex-1 pt-1"><h2 class="line-clamp-3 break-words text-2xl font-black leading-tight tracking-tight text-white">${escapeHtml(item.title)}</h2><p>Authored fixture creator</p></div></div></div>
    <div class="mt-6"><h3>Unlock the download</h3><button type="button" data-native>Original SoundCloud connect</button>
    ${item.email ? '<form class="space-y-3"><div class="flex gap-2"><input type="email" name="email" placeholder="your@email.com"><button type="button" data-native>Original email submit</button></div><label><input type="checkbox">Authored consent label</label></form>' : ''}</div>
    <div class="mt-5"><div><button type="button" data-native>Complete all actions to unlock</button></div></div></div></div></main>
    <script>window.nativeActions=0;document.querySelectorAll('[data-native]').forEach(button=>button.onclick=()=>window.nativeActions++);</script>
    <script ${item.lateMarker ? 'data-late-marker' : ''} src="${item.foreignMarker ? 'https://unrelated.example.invalid' : ''}${gateChunk}"></script></body></html>`;
}

function documentFor(item, id = 'AuthoredDocument001') {
  return {
    document: {
      name: `projects/valorizd-d6172/databases/(default)/documents/gates/${id}`,
      fields: {
        slug: { stringValue: item.modelSlug ?? item.slug },
        title: { stringValue: item.title },
        gateType: { stringValue: item.file ? 'file' : 'url' },
        reward: {
          mapValue: {
            fields: {
              [item.file ? 'fileUrl' : 'url']: {
                stringValue: item.destination,
              },
              fileName: { stringValue: 'Authored Valorizd sample.wav' },
            },
          },
        },
        steps: {
          arrayValue: {
            values: [
              {
                mapValue: {
                  fields: {
                    platform: { stringValue: 'soundcloud' },
                    action: { stringValue: 'follow' },
                  },
                },
              },
            ],
          },
        },
        emailCapture: { booleanValue: item.email === true },
      },
    },
    readTime: '2026-01-01T00:00:00Z',
  };
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Synthetic installed-extension fixtures; no live gate IDs, files or account data. */
export async function testValorizd({ context, browserName, screenshots, popup }) {
  const cases = [
    {
      slug: 'authored-valorizd-url',
      title: 'Authored Valorizd URL reward',
      destination: 'https://mega.nz/file/authored-valorizd#authored-key',
    },
    {
      slug: 'authored-valorizd-file',
      title: 'Authored Valorizd uploaded file',
      file: true,
      destination: fileUrl,
    },
    {
      slug: 'authored-valorizd-email',
      title: 'Authored Valorizd email setting',
      email: true,
      destination: 'https://files.example.invalid/valorizd-email.zip',
    },
    {
      slug: 'authored-valorizd-late-marker',
      title: 'Authored hydrated Valorizd marker',
      lateMarker: true,
      destination: 'https://files.example.invalid/valorizd-late-marker.zip',
    },
    {
      slug: 'authored-valorizd-malformed',
      title: 'Authored malformed Firestore JSON',
      destination: '',
      malformed: true,
      error: /unreadable or oversized/,
    },
    {
      slug: 'authored-valorizd-mismatch',
      title: 'Authored mismatched Firestore slug',
      destination: 'https://files.example.invalid/mismatch.zip',
      modelSlug: 'different-authored-slug',
      error: /inconsistent gate details/,
    },
    {
      slug: 'authored-valorizd-ambiguous',
      title: 'Authored ambiguous Firestore result',
      destination: 'https://files.example.invalid/ambiguous.zip',
      ambiguous: true,
      error: /more than one gate/,
    },
    {
      slug: 'authored-valorizd-removed',
      title: 'Authored missing Firestore document',
      destination: '',
      removed: true,
      error: /unavailable or was removed/,
    },
    {
      slug: 'authored-valorizd-denied',
      title: 'Authored Firestore permission denial',
      destination: '',
      denied: true,
      error: /did not allow access/,
    },
    {
      slug: 'authored-valorizd-unsafe',
      title: 'Authored unsafe reward',
      destination: 'javascript:alert("authored-fixture")',
      unsafe: true,
      error: /unsafe destination/,
    },
    {
      slug: 'authored-valorizd-retry',
      title: 'Authored rate-limit retry',
      destination: 'https://files.example.invalid/valorizd-retry.zip',
      retry: true,
    },
    {
      slug: 'authored-valorizd-cancel',
      title: 'Authored cancelled metadata lookup',
      destination: 'https://files.example.invalid/valorizd-cancelled.zip',
      slow: true,
      cancel: true,
    },
    {
      slug: 'authored-valorizd-navigation',
      title: 'Authored navigation during lookup',
      destination: 'https://files.example.invalid/valorizd-navigated.zip',
      slow: true,
      navigate: true,
    },
    {
      slug: 'authored-valorizd-foreign',
      title: 'Authored unrelated Next script',
      destination: '',
      foreignMarker: true,
    },
  ].map((item) => ({
    ...item,
    url: `https://www.valorizd.app/gates/${item.slug}`,
  }));
  const byUrl = new Map(cases.map((item) => [item.url, item]));
  const bySlug = new Map(cases.map((item) => [item.slug, item]));
  const counts = new Map(cases.map((item) => [item.slug, 0]));
  const delays = new Map(cases.filter((item) => item.slow).map((item) => [item.slug, deferred()]));
  const errors = [];
  const badRequests = [];
  let destinationRequests = 0;
  let preflights = 0;
  const websiteRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(
      request.method(),
      'GET',
      'The adapter must never submit native social or email requests',
    );
    if (url.pathname === gateChunk) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: "// Authored native page marker only; performs no account action.\nif(document.currentScript?.hasAttribute('data-late-marker')) document.currentScript.remove();",
      });
      return;
    }
    const item = byUrl.get(request.url());
    await route.fulfill({
      contentType: 'text/html',
      body: item
        ? pageHtml(item)
        : '<!doctype html><html><body><h1>Authored creator profile</h1><p>No download gate here.</p></body></html>',
    });
  };
  const firestoreRoute = async (route) => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Accept',
      'cache-control': 'no-store',
    };
    if (request.url() !== api) {
      badRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      await route.abort();
      return;
    }
    if (request.method() === 'OPTIONS') {
      preflights++;
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }
    assert.equal(request.method(), 'POST', 'Only read-only structuredQuery is permitted');
    assert.equal(request.headers()['authorization'], undefined);
    assert.equal(request.headers()['cookie'], undefined);
    assert.equal(request.headers()['x-goog-api-key'], undefined);
    const query = request.postDataJSON();
    assert.deepEqual(Object.keys(query), ['structuredQuery']);
    const value = query.structuredQuery;
    assert.deepEqual(Object.keys(value).sort(), ['from', 'limit', 'select', 'where']);
    assert.deepEqual(value.from, [{ collectionId: 'gates' }]);
    assert.deepEqual(
      value.select.fields.map((field) => field.fieldPath).sort(),
      [...fields].sort(),
    );
    assert.equal(value.limit, 2);
    assert.deepEqual(Object.keys(value.where), ['fieldFilter']);
    assert.deepEqual(value.where.fieldFilter.field, { fieldPath: 'slug' });
    assert.equal(value.where.fieldFilter.op, 'EQUAL');
    assert.deepEqual(Object.keys(value.where.fieldFilter.value), ['stringValue']);
    const slug = value.where.fieldFilter.value.stringValue;
    const item = bySlug.get(slug);
    assert(item, 'Only the exact current fixture slug may be queried');
    const count = counts.get(slug) + 1;
    counts.set(slug, count);
    if (item.slow) await delays.get(slug).promise;
    const status = item.denied ? 403 : item.retry && count === 1 ? 429 : 200;
    const payload =
      status === 403
        ? {
            error: {
              status: 'PERMISSION_DENIED',
              message: 'Authored permission denial',
            },
          }
        : status === 429
          ? { error: { status: 'RESOURCE_EXHAUSTED' } }
          : item.removed
            ? [{ readTime: '2026-01-01T00:00:00Z' }]
            : item.ambiguous
              ? [
                  documentFor(item, 'AuthoredAmbiguous001'),
                  documentFor(item, 'AuthoredAmbiguous002'),
                ]
              : [documentFor(item)];
    try {
      await route.fulfill({
        status,
        headers,
        contentType: 'application/json',
        body: item.malformed ? '{authored invalid json' : JSON.stringify(payload),
      });
    } catch (error) {
      if (!item.slow) throw error;
      // Aborted generations can close their route before the deliberately late response.
    }
  };
  const blockDestination = async (route) => {
    destinationRequests++;
    await route.abort();
  };
  await context.route('https://www.valorizd.app/**', websiteRoute);
  await context.route('https://firestore.googleapis.com/**', firestoreRoute);
  for (const origin of [
    'https://files.example.invalid/**',
    'https://mega.nz/**',
    'https://firebasestorage.googleapis.com/**',
  ])
    await context.route(origin, blockDestination);
  await context.route('https://unrelated.example.invalid/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: '// Unrelated authored source.',
    }),
  );
  const page = await context.newPage();
  const slowPage = await context.newPage();
  for (const target of [page, slowPage])
    target.on('pageerror', (error) => errors.push(error.message));
  const expectedPages = context.pages().length;
  async function bindPopup(item, state = 'Valorizd detected') {
    if (!popup) return;
    await popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((entry) => entry.url === url);
      if (!tab?.id) throw new Error('Authored Valorizd tab not found');
      await chrome.tabs.update(tab.id, { active: true });
    }, item.url);
    await popup.reload();
    await popup.waitForFunction(
      (text) => document.querySelector('#state')?.textContent === text,
      state,
    );
    assert.equal(await popup.locator('#native-actions').isVisible(), false);
  }
  async function assertNoNativeActivity(target) {
    assert.equal(await target.evaluate(() => window.nativeActions), 0);
    assert.equal(await target.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(destinationRequests, 0);
  }
  try {
    for (const item of cases.filter((item) => !item.slow)) {
      await page.goto(item.url, { waitUntil: 'load' });
      const panel = page.locator('#gatebreaker-panel');
      if (item.foreignMarker) {
        await page.waitForTimeout(350);
        assert.equal(
          await panel.count(),
          0,
          'An unrelated script cannot mark an owned Valorizd gate',
        );
        assert.equal(counts.get(item.slug), 0);
        continue;
      }
      await panel.waitFor();
      if (item.lateMarker) {
        assert.equal(
          await page
            .locator('script[src]')
            .evaluateAll(
              (scripts, expected) =>
                scripts.some((script) => script.getAttribute('src') === expected),
              gateChunk,
            ),
          false,
          'Hydration removes the native marker before the extension inspects the page',
        );
        assert.equal(
          await page.evaluate(
            (expected) =>
              performance
                .getEntriesByType('resource')
                .some(
                  (entry) =>
                    entry.initiatorType === 'script' &&
                    new URL(entry.name).origin === location.origin &&
                    new URL(entry.name).pathname === expected,
                ),
            gateChunk,
          ),
          true,
          'The browser retains an actual owned script resource entry after tag removal',
        );
      }
      assert.equal(counts.get(item.slug), 0, 'Loading a gate must not start an extension lookup');
      assert.equal(
        await page.locator('main .mt-6').isVisible(),
        false,
        'Individual native gate steps stay hidden',
      );
      assert.equal(
        await page.locator('main .mt-5').isVisible(),
        false,
        'Original completion control stays hidden',
      );
      assert.equal(
        await page.getByRole('button', { name: 'Original language', exact: true }).isVisible(),
        true,
      );
      assert.equal(
        await page.getByRole('button', { name: 'Original preview', exact: true }).isVisible(),
        true,
      );
      await assertNoNativeActivity(page);
      if (item.slug === 'authored-valorizd-url') {
        await bindPopup(item);
        await panel.evaluate((host) => host.shadowRoot.querySelector('button').click());
        await page.waitForTimeout(100);
        assert.equal(
          counts.get(item.slug),
          0,
          'A page-script click cannot start Firestore requests',
        );
      }
      const trigger =
        popup && item.slug === 'authored-valorizd-url'
          ? popup.locator('#resolve')
          : panel.getByRole('button', {
              name: 'Download',
              exact: true,
            });
      await trigger.click();
      if (item.retry) {
        await panel.getByRole('button', { name: 'Try again', exact: true }).waitFor();
        assert.equal(counts.get(item.slug), 1);
        assert.equal(await panel.getByRole('link').count(), 0);
        assert.match(await panel.getByRole('status').first().innerText(), /limiting requests/);
        await panel.getByRole('button', { name: 'Try again', exact: true }).click();
      }
      const failed =
        item.malformed ||
        item.modelSlug ||
        item.ambiguous ||
        item.removed ||
        item.denied ||
        item.unsafe;
      if (failed) {
        await panel.getByRole('button', { name: 'Try again', exact: true }).waitFor();
        assert.equal(
          await panel.getByRole('link').count(),
          0,
          'Invalid, absent or unsafe Firestore data must fail closed',
        );
        assert.match(await panel.getByRole('status').first().innerText(), item.error);
        assert.doesNotMatch(
          await panel.getByRole('status').first().innerText(),
          /destination is ready/,
        );
        if (item.unsafe) {
          await page.waitForTimeout(200);
          await page.screenshot({
            path: path.join(screenshots, 'panel-valorizd-error.png'),
          });
        }
      } else {
        const link = panel.getByRole('link', {
          name: 'Open destination',
          exact: true,
        });
        await link.waitFor();
        assert.equal(
          await link.getAttribute('href'),
          item.destination,
          'File query capability and MEGA fragment must be preserved',
        );
        if (item.slug === 'authored-valorizd-url' || item.file) {
          await page.waitForTimeout(200);
          await page.screenshot({
            path: path.join(
              screenshots,
              item.file ? 'panel-valorizd-file.png' : 'panel-valorizd-success.png',
            ),
          });
          if (popup && !item.file) {
            await popup.getByRole('link', { name: 'Open destination', exact: true }).waitFor();
            assert.equal(await popup.locator('#download').getAttribute('href'), item.destination);
            await popup.waitForTimeout(200);
            await popup.locator('body').screenshot({
              path: path.join(screenshots, 'popup-valorizd-success.png'),
            });
            const storage = await popup.evaluate(() => chrome.storage.local.get(null));
            assert(!JSON.stringify(storage).includes('authored-key'));
            assert(!JSON.stringify(storage).includes('authored-fixture-file-capability'));
          }
        }
      }
      assert.equal(counts.get(item.slug), item.retry ? 2 : 1);
      assert.equal(page.url(), item.url);
      await assertNoNativeActivity(page);
    }
    for (const item of cases.filter((item) => item.slow)) {
      await slowPage.goto(item.url, { waitUntil: 'load' });
      const panel = slowPage.locator('#gatebreaker-panel');
      await panel.waitFor();
      assert.equal(counts.get(item.slug), 0);
      await panel.getByRole('button', { name: 'Download', exact: true }).click();
      await panel.getByRole('button', { name: 'Cancel check', exact: true }).waitFor();
      await slowPage.waitForTimeout(100);
      assert.equal(counts.get(item.slug), 1);
      if (item.cancel) {
        await bindPopup(item, 'Checking');
        await slowPage.waitForTimeout(200);
        await slowPage.screenshot({
          path: path.join(screenshots, 'panel-valorizd-checking.png'),
        });
        if (popup) {
          await popup.waitForTimeout(200);
          await popup.locator('body').screenshot({
            path: path.join(screenshots, 'popup-valorizd-checking.png'),
          });
          await popup.locator('#cancel').click();
        } else await panel.getByRole('button', { name: 'Cancel check', exact: true }).click();
        await panel.getByRole('status').filter({ hasText: 'Check cancelled' }).first().waitFor();
        delays.get(item.slug).release();
        await slowPage.waitForTimeout(250);
        assert.equal(await panel.getByRole('link').count(), 0);
        await assertNoNativeActivity(slowPage);
        await slowPage.screenshot({
          path: path.join(screenshots, 'panel-valorizd-cancelled.png'),
        });
      } else {
        await slowPage.goto('https://www.valorizd.app/profile/authored-fixture', {
          waitUntil: 'load',
        });
        delays.get(item.slug).release();
        await slowPage.waitForTimeout(250);
        assert.equal(await slowPage.locator('#gatebreaker-panel').count(), 0);
      }
    }
    assert.equal(
      context.pages().length,
      expectedPages,
      'No final destination tab may be opened automatically',
    );
    assert.equal(destinationRequests, 0);
    assert.deepEqual(badRequests, []);
    assert.deepEqual(errors, []);
    console.log(
      `${browserName} Valorizd integration passed: 14 authored cases; exact read-only projected Firestore query, URL/file/email and consumed native script-marker variants, malformed/mismatched/ambiguous/missing/403/unsafe responses, rate-limit retry, explicit cancellation and navigation, no social/email/write or final destination requests. CORS preflights handled: ${preflights}.`,
    );
  } finally {
    for (const delay of delays.values()) delay.release();
    await slowPage.close();
    await page.close();
    await context.unroute('https://www.valorizd.app/**', websiteRoute);
    await context.unroute('https://firestore.googleapis.com/**', firestoreRoute);
    for (const origin of [
      'https://files.example.invalid/**',
      'https://mega.nz/**',
      'https://firebasestorage.googleapis.com/**',
    ])
      await context.unroute(origin, blockDestination);
    await context.unroute('https://unrelated.example.invalid/**');
  }
}
