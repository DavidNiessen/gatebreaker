import assert from 'node:assert/strict';
import path from 'node:path';

const style =
  'body{max-width:560px;margin:32px auto;padding:0 16px;font:16px system-ui;background:#fafaf8}button{padding:10px;margin:5px}app-social-unlock{display:block}';
const tokenFor = (slug) => `current-public-fixture-token-${slug}`;
const staleToken = 'stale-public-fixture-token-must-not-be-used';

function model(item, current = false) {
  return {
    slug: item.slug,
    title: item.title,
    type: item.type ?? 1,
    status: 1,
    actions: item.actions.map((type) => ({ type })),
    unlock_token: current ? tokenFor(item.slug) : staleToken,
    email_lists: item.email ? [{ id: 1 }] : [],
    ...(item.customSlug
      ? { custom_slug: item.customSlug, user: { username: 'gatebreaker-fixture' } }
      : {}),
  };
}

function pageHtml(item) {
  const state = {
    fixtureTransferEntry: { u: 'https://127.0.0.1/ignored-transfer-state-url', b: model(item) },
  };
  return `<!doctype html><html><head><title>Authored Rekonise fixture</title><style>${style}</style></head><body>
    <app-social-unlock-detail-page><app-social-unlock><div class="title-row"><h1>${item.title}</h1></div><div class="steps-col"><div class="mb-3">Original progress</div><div id="unlock-progress-badge">Locked</div>
    <div class="actions-stack">${item.actions.map((type) => `<button type="button" data-native>Original action ${type}</button>`).join('')}${item.email ? '<label>Original email<input type="email" name="email"></label><button type="button" data-native>Original email submit</button>' : ''}</div>
    <div class="unlock-footer"><button type="button" class="cta-button" data-native>Original unlock</button></div></div></app-social-unlock></app-social-unlock-detail-page>
    <script id="ng-state" type="application/json">${JSON.stringify(state).replaceAll('<', '\\u003c')}</script>
    <script>window.nativeActions=0;document.querySelectorAll('[data-native]').forEach(button=>button.onclick=()=>window.nativeActions++);</script>
  </body></html>`;
}

/** Only authored HTTP responses and URLs are used. One real 20-second wait per browser. */
export async function testRekonise({ context, browserName, screenshots, popup }) {
  const cases = [
    {
      slug: 'fixture-timer-a1b',
      title: 'Authored Rekonise timed link',
      actions: [1],
      destination: 'https://mega.nz/file/gatebreaker-rekonise-fixture#authored-mega-fragment',
    },
    {
      slug: 'fixture-cancel-c2d',
      title: 'Authored cancelled wait',
      actions: [1],
      destination: 'https://files.example.invalid/cancelled.zip',
      cancel: true,
    },
    {
      slug: 'fixture-custom-e3f',
      customSlug: 'custom-link-fixture',
      title: 'Authored custom creator link',
      actions: [],
      destination: 'https://files.example.invalid/custom.zip',
    },
    {
      slug: 'fixture-denied-g4h',
      title: 'Authored server rejection',
      actions: [],
      destination: 'https://files.example.invalid/denied.zip',
      unlockStatus: 403,
      error: /did not release this link/,
    },
    {
      slug: 'fixture-unsafe-i5j',
      title: 'Authored unsafe destination',
      actions: [],
      destination: 'javascript:alert("fixture")',
      error: /unsafe or recursive destination/,
    },
    {
      slug: 'fixture-missing-k6l',
      title: 'Authored removed gate',
      actions: [],
      destination: '',
      metadataStatus: 404,
      error: /unavailable or was removed/,
    },
    {
      slug: 'fixture-file-m7n',
      title: 'Authored uploaded file',
      actions: [],
      type: 2,
      destination:
        'https://api.rekonise.com/storage/serve/b64_Zml4dHVyZS56aXA=?exp=1893456000&sig=authored-fixture-signature',
    },
    {
      slug: 'fixture-email-o8p',
      title: 'Authored email-list gate',
      actions: [],
      email: true,
      destination: 'https://files.example.invalid/email-list.zip',
    },
    {
      slug: 'fixture-explicit-cancel-q9r',
      title: 'Authored explicit cancel',
      actions: [1],
      explicitCancel: true,
      destination: 'https://files.example.invalid/explicit-cancel.zip',
    },
  ].map((item) => ({
    ...item,
    url: item.customSlug
      ? `https://www.rekonise.com/gatebreaker-fixture/${item.customSlug}`
      : `https://rekonise.com/${item.slug}`,
  }));
  const byGateUrl = new Map(cases.map((item) => [item.url, item]));
  const byCanonical = new Map(cases.map((item) => [item.slug, item]));
  const byMetadataPath = new Map(
    cases.map((item) => [
      `/social-unlocks/${item.customSlug ? `gatebreaker-fixture/${item.customSlug}` : item.slug}`,
      item,
    ]),
  );
  const counts = new Map(
    cases.map((item) => [item.slug, { metadata: 0, unlock: 0, metadataAt: 0, unlockAt: 0 }]),
  );
  const errors = [];
  const unexpectedApiRequests = [];
  let destinationRequests = 0;
  let internalTrapRequests = 0;
  let preflights = 0;
  const websiteRoute = async (route) => {
    assert.equal(
      route.request().method(),
      'GET',
      'Gate pages must not receive account or email submissions',
    );
    const item = byGateUrl.get(route.request().url());
    await route.fulfill({
      contentType: 'text/html',
      body: item
        ? pageHtml(item)
        : '<!doctype html><html><body><h1>Authored creator profile</h1><p>No gate here.</p></body></html>',
    });
  };
  await context.route('https://rekonise.com/**', websiteRoute);
  await context.route('https://www.rekonise.com/**', websiteRoute);
  await context.route('https://api.rekonise.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/storage/')) {
      destinationRequests++;
      await route.abort();
      return;
    }
    const headers = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'Accept, X-Initial-Referrer',
      'cache-control': 'no-store',
    };
    if (request.method() === 'OPTIONS') {
      preflights++;
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }
    assert.equal(
      request.method(),
      'GET',
      'Native resolver only reads public gate metadata and unlock data',
    );
    assert.equal(request.headers()['accept'], 'application/json');
    assert.equal(request.headers()['x-initial-referrer'], 'direct');
    assert.equal(request.headers()['authorization'], undefined);
    assert.equal(request.headers()['cookie'], undefined);
    const metadataItem = byMetadataPath.get(url.pathname);
    const unlock = /^\/social-unlocks\/([^/]+)\/unlock$/.exec(url.pathname);
    const unlockItem = unlock ? byCanonical.get(unlock[1]) : undefined;
    if (metadataItem) {
      assert.equal(url.search, '');
      const count = counts.get(metadataItem.slug);
      count.metadata++;
      count.metadataAt = Date.now();
      await route.fulfill({
        status: metadataItem.metadataStatus ?? 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(
          metadataItem.metadataStatus
            ? { message: 'Authored unavailable gate' }
            : model(metadataItem, true),
        ),
      });
      return;
    }
    if (unlockItem) {
      const count = counts.get(unlockItem.slug);
      count.unlock++;
      count.unlockAt = Date.now();
      assert.equal(
        url.searchParams.get('token'),
        tokenFor(unlockItem.slug),
        'Unlock must use fresh metadata token rather than SSR state',
      );
      assert.deepEqual(
        [...url.searchParams.keys()],
        ['token'],
        'No invented pass or account fields are sent',
      );
      if (unlockItem.actions.length || unlockItem.email)
        assert.ok(
          count.unlockAt - count.metadataAt >= 19500,
          'One ordinary action must respect the actual native 20-second interval',
        );
      await route.fulfill({
        status: unlockItem.unlockStatus ?? 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(
          unlockItem.unlockStatus
            ? { message: 'Authored server rejection' }
            : { [unlockItem.type === 2 ? 'file' : 'url']: unlockItem.destination },
        ),
      });
      return;
    }
    unexpectedApiRequests.push({ path: url.pathname, method: request.method() });
    await route.fulfill({ status: 404, headers, contentType: 'application/json', body: '{}' });
  });
  for (const pattern of ['https://files.example.invalid/**', 'https://mega.nz/**'])
    await context.route(pattern, async (route) => {
      destinationRequests++;
      await route.abort();
    });
  await context.route('https://127.0.0.1/**', async (route) => {
    internalTrapRequests++;
    await route.abort();
  });

  const page = await context.newPage();
  const cancelledPage = await context.newPage();
  const emailPage = await context.newPage();
  const explicitCancelPage = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  cancelledPage.on('pageerror', (error) => errors.push(error.message));
  emailPage.on('pageerror', (error) => errors.push(error.message));
  explicitCancelPage.on('pageerror', (error) => errors.push(error.message));
  const expectedPages = context.pages().length;
  const main = cases[0];
  const cancelled = cases[1];
  const email = cases.find((item) => item.email);
  const explicit = cases.find((item) => item.explicitCancel);
  const panel = page.locator('#gatebreaker-panel');
  async function bindPopup(item, states = ['Rekonise detected']) {
    if (!popup) return;
    await popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((entry) => entry.url === url);
      if (!tab?.id) throw new Error('Authored Rekonise fixture tab missing');
      await chrome.tabs.update(tab.id, { active: true });
    }, item.url);
    await popup.reload();
    await popup.waitForFunction(
      (allowed) => allowed.includes(document.querySelector('#state')?.textContent),
      states,
    );
    assert.equal(await popup.locator('#gate-title').textContent(), item.title);
  }
  async function assertPublicStateHasNoToken(url) {
    if (!popup) return;
    const values = await popup.evaluate(async (target) => {
      const tab = (await chrome.tabs.query({})).find((entry) => entry.url === target);
      return {
        status: await chrome.tabs.sendMessage(tab.id, { type: 'gatebreaker:status' }),
        storage: await chrome.storage.local.get(),
      };
    }, url);
    const text = JSON.stringify(values);
    for (const item of cases)
      assert.equal(
        text.includes(tokenFor(item.slug)),
        false,
        'Provider tokens must not appear in page status or extension storage',
      );
    assert.equal(text.includes(staleToken), false);
    assert.equal(text.includes('ignored-transfer-state-url'), false);
    assert.deepEqual(
      Object.keys(values.storage).filter((key) => key !== 'enabled'),
      [],
    );
  }
  try {
    await page.goto(main.url, { waitUntil: 'load' });
    await panel.waitFor();
    await panel.evaluate((host) => host.shadowRoot.querySelector('button').click());
    await page.waitForTimeout(100);
    assert.equal(
      [...counts.values()].reduce((sum, value) => sum + value.metadata + value.unlock, 0),
      0,
      'Inspecting a gate makes no provider API requests',
    );
    await bindPopup(main);
    await page.bringToFront();
    await (
      popup
        ? popup.locator('#resolve')
        : panel.getByRole('button', { name: 'Download', exact: true })
    ).click();
    const waiting = panel.getByRole('button', { name: /^Waiting \d+s/ });
    await waiting.waitFor();
    const firstSeconds = Number((await waiting.textContent()).match(/Waiting (\d+)s/)[1]);
    assert.ok(firstSeconds > 0 && firstSeconds <= 20);
    assert.equal(await waiting.isDisabled(), true);
    assert.equal(await panel.locator('section').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('app-social-unlock .actions-stack').isVisible(), true);
    assert.equal(await page.locator('app-social-unlock .unlock-footer').isVisible(), true);
    assert.equal(counts.get(main.slug).metadata, 1);
    assert.equal(counts.get(main.slug).unlock, 0);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(screenshots, 'panel-rekonise-waiting.png'),
    });
    if (popup) {
      await popup.waitForFunction(
        () => document.querySelector('#state')?.textContent === 'Waiting for provider',
      );
      assert.match(await popup.locator('#description').textContent(), /native unlock timer/);
      assert.equal(await popup.locator('#resolve').isDisabled(), true);
      await popup.locator('body').screenshot({
        animations: 'disabled',
        path: path.join(screenshots, 'popup-rekonise-waiting.png'),
      });
      await assertPublicStateHasNoToken(main.url);
    }
    // Firefox may throttle a background fixture's timers. Observe the actual
    // rendered countdown instead of assuming a tick lands within a 1.1s sleep.
    await page.waitForFunction(
      (initial) => {
        const root = document.querySelector('#gatebreaker-panel')?.shadowRoot;
        const label = [...(root?.querySelectorAll('button') ?? [])]
          .map((button) => button.textContent)
          .find((text) => /^Waiting \d+s/.test(text ?? ''));
        const seconds = /^Waiting (\d+)s/.exec(label ?? '')?.[1];
        return seconds !== undefined && Number(seconds) > 0 && Number(seconds) < initial;
      },
      firstSeconds,
      { timeout: 5000 },
    );
    const laterSeconds = Number((await waiting.textContent()).match(/Waiting (\d+)s/)[1]);
    assert.ok(laterSeconds < firstSeconds, 'Native timer countdown must visibly advance');
    assert.equal(counts.get(main.slug).unlock, 0, 'No premature unlock request during the timer');

    // Start an independent wait and navigate away while the main real timer runs.
    // Its deadline passes before the test finishes, without adding a second 20s wait.
    await cancelledPage.goto(cancelled.url, { waitUntil: 'load' });
    const cancelPanel = cancelledPage.locator('#gatebreaker-panel');
    await cancelPanel.waitFor();
    await cancelPanel.getByRole('button', { name: 'Download', exact: true }).click();
    await cancelPanel.getByRole('button', { name: /^Waiting \d+s/ }).waitFor();
    assert.equal(counts.get(cancelled.slug).metadata, 1);
    assert.equal(counts.get(cancelled.slug).unlock, 0);
    await cancelledPage.goto('https://rekonise.com/user/gatebreaker-fixture', {
      waitUntil: 'load',
    });
    await cancelledPage.waitForTimeout(200);
    assert.equal(await cancelledPage.locator('#gatebreaker-panel').count(), 0);
    // The email-list fixture uses the native virtual-step budget but sends no email.
    await emailPage.goto(email.url, { waitUntil: 'load' });
    const emailPanel = emailPage.locator('#gatebreaker-panel');
    await emailPanel.waitFor();
    await emailPanel.getByRole('button', { name: 'Download', exact: true }).click();
    await emailPanel.getByRole('button', { name: /^Waiting \d+s/ }).waitFor();
    assert.equal(counts.get(email.slug).metadata, 1);
    assert.equal(counts.get(email.slug).unlock, 0);
    assert.equal(await emailPage.locator('input[name="email"]').inputValue(), '');
    assert.equal(await emailPage.locator('app-social-unlock .actions-stack').isVisible(), true);

    await explicitCancelPage.goto(explicit.url, { waitUntil: 'load' });
    const explicitPanel = explicitCancelPage.locator('#gatebreaker-panel');
    await explicitPanel.waitFor();
    await explicitPanel.getByRole('button', { name: 'Download', exact: true }).click();
    await explicitPanel.getByRole('button', { name: /^Waiting \d+s/ }).waitFor();
    await explicitPanel.getByRole('button', { name: 'Cancel check', exact: true }).click();
    await explicitPanel
      .getByRole('status')
      .filter({ hasText: /Check cancelled/ })
      .first()
      .waitFor();
    assert.equal(await explicitPanel.getByRole('link').count(), 0);
    assert.equal(
      await explicitPanel.getByRole('button', { name: 'Download', exact: true }).isEnabled(),
      true,
    );
    await explicitCancelPage.screenshot({
      animations: 'disabled',
      path: path.join(screenshots, 'panel-rekonise-cancelled.png'),
    });
    if (popup) {
      // Restart the same authored case and cancel it through the actual popup RPC too.
      await bindPopup(explicit, ['Cancelled']);
      await popup.locator('#resolve').click();
      await popup.waitForFunction(
        () => document.querySelector('#state')?.textContent === 'Waiting for provider',
      );
      await popup.getByRole('button', { name: 'Cancel check', exact: true }).click();
      await popup.waitForFunction(
        () => document.querySelector('#state')?.textContent === 'Cancelled',
      );
      await explicitPanel
        .getByRole('status')
        .filter({ hasText: /Check cancelled/ })
        .first()
        .waitFor();
      assert.equal(await popup.locator('#download').isVisible(), false);
      await assertPublicStateHasNoToken(explicit.url);
      await bindPopup(main, ['Waiting for provider', 'Destination opened', 'Download started']);
    }
    assert.equal(counts.get(explicit.slug).metadata, popup ? 2 : 1);
    assert.equal(counts.get(explicit.slug).unlock, 0);

    const destination = panel.getByRole('link', { name: 'Open destination', exact: true });
    await destination.waitFor({ timeout: 25000 });
    assert.equal(
      await destination.getAttribute('href'),
      main.destination,
      'MEGA file-key fragment must be preserved',
    );
    assert.equal(await panel.locator('section').getAttribute('aria-busy'), 'false');
    assert.equal(await page.evaluate(() => window.nativeActions), 0);
    assert.equal(page.url(), main.url);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(screenshots, 'panel-rekonise-success.png'),
    });
    if (popup) {
      await popup.getByRole('link', { name: 'Open destination', exact: true }).waitFor();
      assert.equal(await popup.locator('#download').getAttribute('href'), main.destination);
      await popup.locator('body').screenshot({
        animations: 'disabled',
        path: path.join(screenshots, 'popup-rekonise-success.png'),
      });
      await assertPublicStateHasNoToken(main.url);
    }
    const emailDestination = emailPanel.getByRole('link', {
      name: 'Open destination',
      exact: true,
    });
    await emailDestination.waitFor({ timeout: 25000 });
    assert.equal(await emailDestination.getAttribute('href'), email.destination);
    assert.equal(counts.get(email.slug).unlock, 1);
    assert.equal(await emailPage.evaluate(() => window.nativeActions), 0);
    await assertPublicStateHasNoToken(email.url);
    const remaining =
      Math.max(counts.get(cancelled.slug).metadataAt, counts.get(explicit.slug).metadataAt) +
      20300 -
      Date.now();
    if (remaining > 0) await page.waitForTimeout(remaining);
    assert.equal(
      counts.get(cancelled.slug).unlock,
      0,
      'Cancelled navigation must never produce a stale unlock request after its former deadline',
    );
    assert.equal(
      counts.get(explicit.slug).unlock,
      0,
      'Both explicit cancel paths must prevent requests past their former deadlines',
    );
    assert.equal(await explicitPanel.getByRole('link').count(), 0);
    assert.equal(await explicitCancelPage.evaluate(() => window.nativeActions), 0);

    for (const item of cases.slice(2).filter((item) => !item.email && !item.explicitCancel)) {
      await page.goto(item.url, { waitUntil: 'load' });
      await panel.waitFor();
      assert.equal(counts.get(item.slug).metadata, 0);
      await panel.getByRole('button', { name: 'Download', exact: true }).click();
      if (item.error) {
        await panel.getByRole('status').filter({ hasText: item.error }).first().waitFor();
        assert.equal(await panel.getByRole('link').count(), 0);
        if (item.slug === 'fixture-unsafe-i5j')
          await page.screenshot({
            animations: 'disabled',
            path: path.join(screenshots, 'panel-rekonise-error.png'),
          });
      } else {
        try {
          await destination.waitFor();
        } catch (error) {
          console.error(
            'Authored Rekonise fixture diagnostic',
            JSON.stringify({
              browserName,
              slug: item.slug,
              counts: counts.get(item.slug),
              panel: await panel.locator('section').innerText(),
              errors,
              unexpectedApiRequests,
            }),
          );
          await page.screenshot({
            animations: 'disabled',
            path: path.join(screenshots, `fixture-rekonise-debug-${item.slug}.png`),
          });
          throw error;
        }
        assert.equal(await destination.getAttribute('href'), item.destination);
      }
      assert.equal(counts.get(item.slug).metadata, 1);
      assert.equal(counts.get(item.slug).unlock, item.metadataStatus ? 0 : 1);
      assert.equal(await page.evaluate(() => window.nativeActions), 0);
      assert.equal(page.url(), item.url);
      await assertPublicStateHasNoToken(item.url);
    }
    assert.equal(destinationRequests, 0);
    assert.equal(
      internalTrapRequests,
      0,
      'Transferred state URLs must never be used as fetch targets',
    );
    assert.deepEqual(unexpectedApiRequests, []);
    assert.deepEqual(errors, []);
    assert.equal(context.pages().length, expectedPages);
    console.log(
      `${browserName} Rekonise integration passed: nine authored cases, real concurrent native/email timers, fresh public tokens, navigation and explicit cancellation past deadlines, custom creator/file routes, server/unavailable/unsafe errors, no account/email/native actions or destination requests. CORS preflights handled: ${preflights}.`,
    );
  } finally {
    await explicitCancelPage.close();
    await emailPage.close();
    await cancelledPage.close();
    await page.close();
  }
}
