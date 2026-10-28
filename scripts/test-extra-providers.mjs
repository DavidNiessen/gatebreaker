import assert from 'node:assert/strict';
import path from 'node:path';

const destinationAttribute = 'bufpsvdhmjybvgfncqfa';
const baseStyle =
  'body{max-width:560px;margin:32px auto;padding:0 16px;font:16px system-ui;background:#fafaf8}button{padding:10px;margin:5px}';
const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function sub2unlockHtml(item) {
  const data = {
    page: '/[uniquer]',
    props: {
      pageProps: {
        sink: {
          data: {
            uniquer: item.modelId ?? item.id,
            title: item.title,
            unlocked_link: item.destination,
            deleted_at: item.deleted ? '2026-01-01T00:00:00Z' : null,
            blocks: item.steps.map((name) => ({ media: { name } })),
            // Deliberately authored personal-looking data must never leave gate HTML.
            creator: { email: 'fixture-owner@example.invalid' },
          },
        },
      },
    },
  };
  return `<!doctype html><html><head><title>Authored Sub2Unlock fixture</title><style>${baseStyle}</style></head><body>
    <div id="__next"><main class="section-padding-equal"><h3>${escapeHtml(item.title)}</h3>
      <div class="d-grid gap-4">${item.steps.map((name) => `<button type="button" data-native>${escapeHtml(name)} action</button>`).join('')}<button type="button" data-native>Original unlock</button></div>
    </main></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>
    <script>window.nativeActions=0;document.querySelectorAll('[data-native]').forEach(button=>button.onclick=()=>window.nativeActions++);</script>
  </body></html>`;
}

function boostHtml(item) {
  const encoded = item.encoded ?? Buffer.from(item.destination, 'utf8').toString('base64');
  return `<!doctype html><html><head><title>Authored Boost fixture</title><style>${baseStyle}</style></head><body>
    <h1>Authored Boost destination</h1>${item.steps.map((name) => `<div class="step_block"><button type="button" data-native>${escapeHtml(name)} action</button></div>`).join('')}
    <button type="button" class="complete_btn" data-native>Original continue</button>
    <script>window.nativeActions=0;document.querySelectorAll('[data-native]').forEach(button=>button.onclick=()=>window.nativeActions++);</script>
    <script src="/assets/js/unlock.js" ${destinationAttribute}="${encoded}"></script>
  </body></html>`;
}

/** Installed-extension fixtures only: all gates, actions and destinations are authored. */
export async function testExtraProviders({ context, browserName, screenshots, popup }) {
  const cases = [
    {
      provider: 'sub2unlock',
      name: 'Sub2Unlock',
      id: 'SubOne',
      title: 'Authored single-step sample',
      steps: ['YouTube'],
      destination: 'https://files.example.invalid/single.zip',
    },
    {
      provider: 'sub2unlock',
      name: 'Sub2Unlock',
      id: 'SubMix',
      title: 'Authored <em>sample</em> & mix',
      steps: ['YouTube', 'Instagram', 'Custom'],
      destination: 'https://files.example.invalid/mixed.zip',
    },
    {
      provider: 'sub2unlock',
      name: 'Sub2Unlock',
      id: 'SubMany',
      title: 'Authored five-step sample',
      steps: ['YouTube', 'Instagram', 'Custom', 'YouTube', 'Custom'],
      destination: 'https://files.example.invalid/many.zip',
    },
    {
      provider: 'sub2unlock',
      name: 'Sub2Unlock',
      id: 'SubMega',
      title: 'Authored fragment destination',
      steps: ['Custom', 'Custom'],
      destination: 'https://mega.nz/file/gatebreaker-fixture#authored-fragment-key',
    },
    {
      provider: 'sub2unlock',
      name: 'Sub2Unlock',
      id: 'SubMissing',
      title: 'Authored missing destination',
      steps: ['YouTube'],
      destination: '',
      error: /did not include a destination/,
    },
    {
      provider: 'sub2unlock',
      name: 'Sub2Unlock',
      id: 'SubUnsafe',
      title: 'Authored unsafe destination',
      steps: ['Instagram'],
      destination: 'javascript:alert("fixture")',
      error: /unsupported destination/,
    },
    {
      provider: 'sub2unlock',
      name: 'Sub2Unlock',
      id: 'SubMismatch',
      modelId: 'DifferentGate',
      title: 'Mismatched gate fixture',
      steps: ['Custom'],
      destination: 'https://files.example.invalid/mismatch.zip',
      ignored: true,
    },
    {
      provider: 'sub2unlock',
      name: 'Sub2Unlock',
      id: 'SubDeleted',
      title: 'Deleted gate fixture',
      steps: ['Custom'],
      destination: 'https://files.example.invalid/deleted.zip',
      deleted: true,
      ignored: true,
    },
    {
      provider: 'boost',
      name: 'Boost.ink',
      host: 'boost.ink',
      id: 'BoostFixture01',
      steps: ['YouTube', 'Instagram'],
      destination: 'https://files.example.invalid/boost.zip',
    },
    {
      provider: 'boost',
      name: 'Boost.ink',
      host: 'de.boost.ink',
      id: 'BoostGerman',
      steps: ['YouTube', 'Instagram', 'Custom'],
      destination: 'https://files.example.invalid/de.zip',
    },
    {
      provider: 'boost',
      name: 'Boost.ink',
      host: 'nl.boost.ink',
      id: 'BoostDutch',
      steps: ['Custom'],
      destination: 'https://files.example.invalid/nl.zip',
      rateLimited: true,
    },
    {
      provider: 'boost',
      name: 'Boost.ink',
      host: 'boost.ink',
      id: 'BoostMalformed',
      steps: ['Custom'],
      destination: '',
      encoded: '%%%not-base64%%%',
      error: /valid embedded destination/,
    },
    {
      provider: 'boost',
      name: 'Boost.ink',
      host: 'boost.ink',
      id: 'BoostUnsafe',
      steps: ['Custom'],
      destination: 'javascript:alert("fixture")',
      error: /unsafe or looping destination/,
    },
  ].map((item) => ({ ...item, url: `https://${item.host ?? 'sub2unlock.com'}/${item.id}` }));
  const byUrl = new Map(cases.map((item) => [item.url, item]));
  const requests = new Map(cases.map((item) => [item.url, { navigation: 0, gateFetch: 0 }]));
  const errors = [];
  let destinationRequests = 0;
  let scriptRequests = 0;
  const gateRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.pathname === '/assets/js/unlock.js' &&
      ['boost.ink', 'de.boost.ink', 'nl.boost.ink'].includes(url.hostname)
    ) {
      scriptRequests++;
      await route.fulfill({
        contentType: 'application/javascript',
        body: `document.currentScript.removeAttribute('${destinationAttribute}');`,
      });
      return;
    }
    const item = byUrl.get(`${url.origin}${url.pathname}`);
    if (!item) {
      await route.fulfill({
        status: 404,
        contentType: 'text/html',
        body: '<h1>Unknown authored fixture</h1>',
      });
      return;
    }
    assert.equal(
      request.method(),
      'GET',
      'Provider fixtures must never submit a social/account request',
    );
    const count = requests.get(item.url);
    if (request.isNavigationRequest()) count.navigation++;
    else count.gateFetch++;
    if (item.rateLimited && !request.isNavigationRequest() && count.gateFetch === 1) {
      await route.fulfill({
        status: 429,
        contentType: 'text/html',
        body: '<h1>Fixture rate limit</h1>',
      });
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      body: item.provider === 'sub2unlock' ? sub2unlockHtml(item) : boostHtml(item),
    });
  };
  for (const host of ['sub2unlock.com', 'boost.ink', 'de.boost.ink', 'nl.boost.ink'])
    await context.route(`https://${host}/**`, gateRoute);
  const blockDestination = async (route) => {
    destinationRequests++;
    await route.abort();
  };
  await context.route('https://files.example.invalid/**', blockDestination);
  await context.route('https://mega.nz/**', blockDestination);

  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const expectedPages = context.pages().length;
  async function bindPopup(item) {
    if (!popup) return;
    await popup.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((entry) => entry.url === url);
      if (!tab?.id) throw new Error('Authored provider fixture tab not found');
      await chrome.tabs.update(tab.id, { active: true });
    }, item.url);
    await popup.reload();
    await popup.waitForFunction(
      (name) => document.querySelector('#state')?.textContent === `${name} detected`,
      item.name,
    );
    assert.equal(
      await popup.locator('#gate-title').textContent(),
      item.title ?? `Boost.ink link ${item.id}`,
    );
    assert.equal(await popup.locator('#native-actions').isVisible(), false);
  }

  try {
    for (const item of cases) {
      await page.goto(item.url, { waitUntil: 'load' });
      const panel = page.locator('#gatebreaker-panel');
      const count = requests.get(item.url);
      if (item.ignored) {
        // Loading already completes the authored page and its content-script entrypoint.
        await page.waitForTimeout(350);
        assert.equal(await panel.count(), 0, `${item.id} must not be treated as an active gate`);
        assert.equal(count.gateFetch, 0);
        if (popup) {
          await popup.evaluate(async (url) => {
            const tab = (await chrome.tabs.query({})).find((entry) => entry.url === url);
            await chrome.tabs.update(tab.id, { active: true });
          }, item.url);
          await popup.reload();
          await popup.waitForFunction(
            () => document.querySelector('#state')?.textContent === 'Waiting for a gate',
          );
          assert.equal(await popup.locator('#resolve').isDisabled(), true);
        }
        continue;
      }
      await panel.waitFor();
      assert.equal(count.navigation, 1);
      assert.equal(count.gateFetch, 0, `${item.id}: inspection must not re-fetch the gate`);
      assert.equal(await page.evaluate(() => window.nativeActions), 0);
      if (item.provider === 'sub2unlock')
        assert.equal(await page.locator('.section-padding-equal .d-grid.gap-4').isVisible(), true);
      else {
        assert.equal(await page.locator('button.complete_btn').isVisible(), true);
        assert.equal(await page.locator('.step_block').first().isVisible(), true);
        assert.equal(
          await page
            .locator('script[src="/assets/js/unlock.js"]')
            .getAttribute(destinationAttribute),
          null,
          'Native Boost fixture removes the data before document_idle',
        );
      }
      const captureSub = item.id === 'SubOne';
      const captureBoost = item.id === 'BoostFixture01';
      if (captureSub || captureBoost) await bindPopup(item);
      if (captureSub || captureBoost) {
        await panel.evaluate((host) => host.shadowRoot.querySelector('button').click());
        await page.waitForTimeout(100);
        assert.equal(count.gateFetch, 0, 'A page-script click must not start provider checks');
        assert.equal(await panel.getByRole('link').count(), 0);
      }
      const trigger =
        popup && (captureSub || captureBoost)
          ? popup.locator('#resolve')
          : panel.getByRole('button', { name: 'Download', exact: true });
      await trigger.click();
      if (item.rateLimited) {
        await panel
          .getByRole('status')
          .filter({ hasText: /limiting requests/ })
          .first()
          .waitFor();
        assert.equal(count.gateFetch, 1);
        assert.equal(await panel.getByRole('link').count(), 0);
        await panel.getByRole('button', { name: 'Try again', exact: true }).click();
      }
      if (item.error) {
        await panel.getByRole('status').filter({ hasText: item.error }).first().waitFor();
        assert.equal(await panel.getByRole('link').count(), 0);
        if (item.id === 'BoostUnsafe')
          await page.screenshot({
            animations: 'disabled',
            path: path.join(screenshots, 'panel-extra-error.png'),
          });
      } else {
        const link = panel.getByRole('link', { name: 'Open destination', exact: true });
        await link.waitFor();
        assert.equal(await link.getAttribute('href'), item.destination);
        if (captureSub || captureBoost) {
          // Capture the settled secondary action, after the incumbent 150ms transition.
          await page.waitForTimeout(200);
          await page.screenshot({
            animations: 'disabled',
            path: path.join(
              screenshots,
              captureSub ? 'panel-sub2unlock-success.png' : 'panel-boost-success.png',
            ),
          });
          if (popup) {
            await popup.getByRole('link', { name: 'Open destination', exact: true }).waitFor();
            assert.equal(await popup.locator('#download').getAttribute('href'), item.destination);
            await popup.waitForTimeout(200);
            await popup.locator('body').screenshot({
              animations: 'disabled',
              path: path.join(
                screenshots,
                captureSub ? 'popup-sub2unlock-success.png' : 'popup-boost-success.png',
              ),
            });
          }
        }
      }
      assert.equal(count.gateFetch, item.provider === 'sub2unlock' ? 0 : item.rateLimited ? 2 : 1);
      assert.equal(
        await page.evaluate(() => window.nativeActions),
        0,
        `${item.id}: native/social controls must not be activated`,
      );
      assert.equal(
        page.url(),
        item.url,
        'Resolution must not automatically navigate to the recovered link',
      );
      assert.equal(
        destinationRequests,
        0,
        'Recovered destinations must never be requested by the fixture suite',
      );
    }
    assert.equal(scriptRequests, cases.filter((item) => item.provider === 'boost').length);
    assert.equal(
      context.pages().length,
      expectedPages,
      'Resolution must not open destination tabs',
    );
    assert.deepEqual(errors, []);
    console.log(
      `${browserName} additional-provider integration passed: 13 authored cases, Sub2Unlock action variants and MEGA fragment, ignored/deleted models, Boost DOM-consumed attributes and locale hosts, rate-limit retry, unsafe/malformed destinations, no social actions or destination requests.`,
    );
  } finally {
    await page.close();
  }
}
