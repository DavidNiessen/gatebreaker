import assert from 'node:assert/strict';

const cdn = 'https://d29xpkeqnsbaz3.cloudfront.net/authored-automation/js/products.js';
const csrf = 'authored-current-native-csrf-000000000000';
const destination = 'https://example.invalid/authored-push-ready.zip';
const sessionCookie = 'gatebreaker_push_fixture_session=authored';
const nativeLabels = {
  'spotify-follow': ['Follow on Spotify', 'Followed on Spotify'],
  'spotify-follow-playlist': ['Follow playlist on Spotify', 'Followed playlist on Spotify'],
};
const action = (driver, id, required = false) => ({
  id,
  driver,
  required,
  provider: {
    client_authentication: !driver.startsWith('spotify-'),
    client_execution: !driver.startsWith('spotify-'),
  },
});

function pageHtml(item) {
  const buttons = item.actions
    .filter((value) => nativeLabels[value.driver])
    .map(
      (value) =>
        `<button class="btn-spotify ${item.preknown ? 'action-required' : ''}" data-driver="${value.driver}" ${item.restore ? 'disabled' : ''}>${nativeLabels[value.driver][item.restore ? 1 : 0]}</button>`,
    )
    .join('');
  return `<!doctype html><html><head><title>Authored PUSH automation</title>
    <meta property="og:title" content="Authored PUSH automation">
    <meta name="csrf-token" content="${csrf}">
    <style>body{font:16px system-ui;max-width:560px;margin:30px auto}button{padding:12px}</style>
    </head><body><main id="app"><div><span class="leading-normal inline-block w-full text-xl font-bold text-black break-word">Authored PUSH automation</span></div>
    <div class="block w-full text-left px-4 pb-6">${buttons}<button data-native-ack>Native profile step</button><div class="block w-full text-center mt-4"><button data-native-start>Native download</button></div></div></main>
    <script>
    window.nativeLoginClicks = [];
    window.nativeAckClicks = 0;
    window.nativeStartClicks = 0;
    window.nativeReceipts = [];
    window.addEventListener('message', event => {
      if (event.origin === 'https://push.fm' && ['spotify-follow','spotify-follow-playlist'].includes(event.data?.driver)) window.nativeReceipts.push(event.data.driver);
    });
    document.querySelector('[data-native-ack]').onclick = () => window.nativeAckClicks++;
    document.querySelector('[data-native-start]').onclick = () => window.nativeStartClicks++;
    document.querySelectorAll('[data-driver]').forEach(button => button.onclick = () => window.nativeLoginClicks.push(button.dataset.driver));
    </script><script src="${cdn}"></script></body></html>`;
}
function callbackHtml(driver) {
  return `<!doctype html><html><body><h1>Authored native callback</h1>
    <p>This fixture does not authenticate any real account.</p>
    <button id="finish">Finish authored sign-in</button>
    <script>document.querySelector('#finish').onclick = () => window.opener.postMessage({driver:${JSON.stringify(driver)},token:${JSON.stringify(`authored-gate-${driver}`)}},'https://push.fm');</script>
    </body></html>`;
}
const isSpotify = (driver) => Object.hasOwn(nativeLabels, driver);

/** Installed-extension fixtures only: native callback windows, no real accounts or downloads. */
export async function testPushAutomation({ context, browserName, popup, screenshots }) {
  const cases = [
    {
      slug: 'authored-auto-ack',
      actions: [action('youtube-subscribe', 901, true), action('soundcloud-follow', 902, true)],
      minimum: 2,
    },
    {
      slug: 'authored-auto-preknown',
      actions: [action('spotify-follow', 911, true), action('spotify-follow-playlist', 912, true)],
      minimum: 2,
      preknown: true,
    },
    {
      slug: 'authored-auto-discovered',
      // Three of four native choices: one safe click acknowledgement plus two
      // Spotify choices; the unsupported Facebook alternative is never invoked.
      actions: [
        action('youtube-subscribe', 921),
        action('spotify-follow', 922),
        action('spotify-follow-playlist', 923),
        action('facebook-share', 924),
      ],
      minimum: 3,
      discovered: true,
    },
    {
      slug: 'authored-auto-cancel',
      actions: [
        action('youtube-subscribe', 931),
        action('spotify-follow', 932),
        action('spotify-follow-playlist', 933),
        action('facebook-share', 934),
      ],
      minimum: 3,
      discovered: true,
      cancel: true,
    },
    {
      slug: 'authored-auto-restored',
      actions: [action('spotify-follow', 951, true), action('spotify-follow-playlist', 952, true)],
      minimum: 2,
      preknown: true,
      restore: true,
    },
    {
      slug: 'authored-auto-invalid-model',
      actions: [{ id: 941, driver: 'youtube-subscribe', required: true }],
      minimum: 1,
      malformedModel: true,
    },
  ].map((item) => ({ ...item, url: `https://push.fm/cu/${item.slug}` }));
  const bySlug = new Map(cases.map((item) => [item.slug, item]));
  const counts = new Map(cases.map((item) => [item.slug, { metadata: 0, completion: 0, ack: 0 }]));
  const errors = [];
  const unexpected = [];
  let finalRequests = 0;
  let callbackRequests = 0;
  const page = await context.newPage();
  const opened = new Set();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('popup', (child) => {
    opened.add(child);
    child.on('pageerror', (error) => errors.push(error.message));
  });
  const providerRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pageMatch = /^\/cu\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    const item = bySlug.get(pageMatch?.[1]);
    if (item && request.isNavigationRequest()) {
      await route.fulfill({
        contentType: 'text/html',
        headers: { 'set-cookie': `${sessionCookie}; Path=/; Secure; SameSite=Lax` },
        body: pageHtml(item),
      });
      return;
    }
    if (url.pathname === '/favicon.ico') {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    const metadata = /^\/api\/guest\/unlock\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    const complete = /^\/unlock\/([A-Za-z0-9_-]+)\/complete$/.exec(url.pathname);
    const ack = /^\/unlock\/([A-Za-z0-9_-]+)\/action\/(\d+)$/.exec(url.pathname);
    const current = bySlug.get(metadata?.[1] ?? complete?.[1] ?? ack?.[1]);
    if (!current) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      await route.abort();
      return;
    }
    if (ack && request.method() === 'GET' && request.isNavigationRequest()) {
      const nativeAction = current.actions.find((value) => value.id === Number(ack[2]));
      assert(
        nativeAction && isSpotify(nativeAction.driver),
        'Only exact native metadata action IDs may open consent',
      );
      assert.equal(url.search, '');
      callbackRequests++;
      await route.fulfill({ contentType: 'text/html', body: callbackHtml(nativeAction.driver) });
      return;
    }
    const count = counts.get(current.slug);
    const headers = await request.allHeaders();
    assert.equal(headers['accept'], 'application/json');
    assert.equal(headers['x-requested-with'], 'XMLHttpRequest');
    assert.equal(headers['authorization'], undefined);
    assert.equal(
      request.postData(),
      null,
      'Native acknowledgement requests carry no social/account/email body',
    );
    if (metadata) {
      assert.equal(request.method(), 'GET');
      assert.equal(headers['cookie'], undefined, 'Public metadata stays credential free');
      assert.equal(url.search, '');
      count.metadata++;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          slug: current.slug,
          title: 'Authored PUSH automation',
          type: 'url',
          content_count: 1,
          isSoftDeleted: false,
          actions: current.actions,
          minimum_actions: current.minimum,
        }),
      });
      return;
    }
    if (ack) {
      const nativeAction = current.actions.find((value) => value.id === Number(ack[2]));
      assert(
        nativeAction && ['youtube-subscribe', 'soundcloud-follow'].includes(nativeAction.driver),
        'Only allowlisted native click acknowledgements may be requested',
      );
      assert.equal(request.method(), 'POST');
      assert.equal(headers['x-csrf-token'], csrf);
      assert.match(
        headers['cookie'] ?? '',
        /gatebreaker_push_fixture_session=authored/,
        'The native acknowledgement uses the page session',
      );
      assert.equal(url.search, '');
      count.ack++;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          driver: nativeAction.driver,
          token: `authored-gate-${nativeAction.driver}`,
        }),
      });
      return;
    }
    assert.equal(request.method(), 'GET');
    assert.deepEqual([...url.searchParams.keys()], ['token']);
    const submission = JSON.parse(
      Buffer.from(url.searchParams.get('token'), 'base64').toString('utf8'),
    );
    assert.deepEqual(Object.keys(submission), ['actions']);
    const provided = submission.actions;
    assert(provided && typeof provided === 'object' && !Array.isArray(provided));
    count.completion++;
    for (const [driver, token] of Object.entries(provided)) {
      assert(
        current.actions.some((value) => value.driver === driver && driver !== 'facebook-share'),
      );
      assert.equal(
        token,
        `authored-gate-${driver}`,
        'Only native returned gate receipts may be submitted',
      );
    }
    const required = current.actions.filter((value) => value.required);
    const released =
      Object.keys(provided).length >= current.minimum &&
      required.every((value) => Object.hasOwn(provided, value.driver));
    if (Object.keys(provided).length)
      assert.match(headers['cookie'] ?? '', /gatebreaker_push_fixture_session=authored/);
    else
      assert.equal(
        headers['cookie'],
        undefined,
        'The initial empty-action check stays credential free',
      );
    await route.fulfill({
      status: released ? 200 : 403,
      contentType: 'application/json',
      body: JSON.stringify(
        released ? { body: destination } : { message: 'Authored required steps remain' },
      ),
    });
  };
  const scriptRoute = (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: '// Authored public native marker only.',
    });
  const blockFinal = async (route) => {
    finalRequests++;
    await route.abort();
  };
  await context.route('https://push.fm/**', providerRoute);
  await context.route(cdn, scriptRoute);
  await context.route('https://example.invalid/**', blockFinal);
  await context.route('https://accounts.spotify.com/**', blockFinal);

  const waitCounts = async (slug, expected) => {
    await page.waitForFunction(() => !!document.querySelector('#gatebreaker-panel'));
    const until = Date.now() + 5000;
    while (Date.now() < until && JSON.stringify(counts.get(slug)) !== JSON.stringify(expected))
      await page.waitForTimeout(50);
    assert.deepEqual(counts.get(slug), expected);
  };
  async function bindPopup(item) {
    if (!popup) return;
    await popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((value) => value.url === url);
      if (!tab?.id) throw new Error('Authored PUSH automation tab missing');
      await chrome.tabs.update(tab.id, { active: true });
    }, item.url);
    await popup.reload();
    await popup.locator('#resolve').waitFor();
  }
  async function finishSignIn(panel, driver, { delayNative = false } = {}) {
    const pendingPopup = page.waitForEvent('popup');
    await panel.locator('button[data-action="push-login-' + driver + '"]').click();
    const child = await pendingPopup;
    await child.getByRole('button', { name: 'Finish authored sign-in', exact: true }).waitFor();
    if (delayNative) {
      await page.evaluate(
        (value) =>
          window.postMessage({ driver: value, token: 'authored-gate-' + value }, 'https://push.fm'),
        driver,
      );
      assert.equal(
        await panel.locator('button[data-action="push-login-' + driver + '"]').isDisabled(),
        false,
        'A same-page forged receipt cannot complete auth',
      );
    }
    await child.getByRole('button', { name: 'Finish authored sign-in', exact: true }).click();
    await page.waitForFunction((value) => {
      const root = document.querySelector('#gatebreaker-panel')?.shadowRoot;
      return root?.querySelector('button[data-action="push-login-' + value + '"]')?.disabled;
    }, driver);
    assert.equal(
      await page.locator('[data-driver="' + driver + '"]').isDisabled(),
      false,
      'An owned receipt does not drive the native button state',
    );
    assert.equal(await page.evaluate(() => window.nativeLoginClicks.length), 0);
    await child.close();
    opened.delete(child);
  }
  try {
    for (const item of cases) {
      if (item.restore) {
        const receipts = Object.fromEntries(
          item.actions.map((value) => [
            item.slug + value.driver,
            {
              link: 'cu/' + item.slug,
              serviceId: item.slug + value.driver,
              status: { driver: value.driver, token: 'authored-gate-' + value.driver },
            },
          ]),
        );
        await context.addCookies([
          {
            name: item.slug,
            value: JSON.stringify(receipts),
            url: 'https://push.fm',
            sameSite: 'Lax',
            secure: true,
          },
        ]);
      }
      await page.goto(item.url, { waitUntil: 'load' });
      const panel = page.locator('#gatebreaker-panel');
      await panel.waitFor();
      await page.waitForTimeout(150);
      assert.deepEqual(
        counts.get(item.slug),
        { metadata: 0, completion: 0, ack: 0 },
        'Opening the gate performs no provider requests',
      );
      assert.equal(
        await page.evaluate(
          () => window.nativeLoginClicks.length + window.nativeAckClicks + window.nativeStartClicks,
        ),
        0,
      );
      assert.equal(await panel.getByRole('link').count(), 0);
      await bindPopup(item);
      const download = panel.getByRole('button', { name: 'Download', exact: true });
      assert.equal(
        await download.isDisabled(),
        false,
        'Initial Download may check native sessions before auth',
      );
      assert.equal(
        await panel.locator('[data-action]').count(),
        0,
        'Auth remains hidden before server refusal',
      );
      await download.click();
      if (item.malformedModel) {
        await panel
          .getByRole('status')
          .filter({ hasText: 'unsupported action details' })
          .first()
          .waitFor();
        assert.deepEqual(counts.get(item.slug), { metadata: 1, completion: 1, ack: 0 });
        assert.equal(await panel.getByRole('link').count(), 0);
        continue;
      }
      if (item.discovered || (item.preknown && !item.restore)) {
        const expectedAck = item.discovered ? 1 : 0;
        await panel
          .getByRole('status')
          .filter({ hasText: 'Download will continue automatically' })
          .first()
          .waitFor();
        await waitCounts(item.slug, { metadata: 1, completion: 1, ack: expectedAck });
        assert.equal(await panel.locator('button[data-action]').count(), 2);
        assert.equal(await download.isDisabled(), true);
        if (popup) {
          await popup.waitForFunction(
            () =>
              document.querySelector('#resolve')?.disabled &&
              document.querySelectorAll('button[data-action]').length === 2,
          );
          assert.equal(await popup.locator('#cancel').isVisible(), true);
        }
        if (screenshots && !item.cancel)
          await page.screenshot({
            animations: 'disabled',
            path: `${screenshots}/panel-push-login-paused.png`,
          });
        if (item.cancel) {
          await panel.getByRole('button', { name: 'Cancel check', exact: true }).click();
          await panel.getByRole('status').filter({ hasText: 'Check cancelled' }).first().waitFor();
        }
        await finishSignIn(panel, 'spotify-follow', { delayNative: true });
        await page.waitForTimeout(250);
        assert.deepEqual(
          counts.get(item.slug),
          { metadata: 2, completion: 1, ack: expectedAck },
          'A single required sign-in cannot resume the download',
        );
        assert.equal(await download.isDisabled(), true);
        await finishSignIn(panel, 'spotify-follow-playlist');
        if (item.cancel) {
          await page.waitForTimeout(400);
          assert.deepEqual(
            counts.get(item.slug),
            { metadata: 3, completion: 1, ack: expectedAck },
            'Cancellation prevents late native callbacks from resuming a download',
          );
          assert.equal(await panel.getByRole('link').count(), 0);
          await download.click();
        }
      }
      const ready = panel.getByRole('link', { name: 'Open destination', exact: true });
      await ready.waitFor();
      assert.equal(await ready.getAttribute('href'), destination);
      await waitCounts(
        item.slug,
        item.restore
          ? { metadata: 1, completion: 2, ack: 0 }
          : item.discovered
            ? { metadata: 4, completion: 3, ack: 1 }
            : item.preknown
              ? { metadata: 4, completion: 3, ack: 0 }
              : { metadata: 1, completion: 2, ack: 2 },
      );
      assert.equal(
        await page.evaluate(
          () => window.nativeLoginClicks.length + window.nativeAckClicks + window.nativeStartClicks,
        ),
        0,
        'Automatic acknowledgements do not click native profile/download controls',
      );
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
        'Native gate receipts are not persisted in web storage',
      );
      assert.equal(
        finalRequests,
        0,
        'The final destination and real OAuth endpoints are never requested',
      );
      if (popup) {
        await popup.waitForFunction(
          () =>
            document.querySelector('#download')?.getAttribute('href') ===
            'https://example.invalid/authored-push-ready.zip',
        );
        const storage = await popup.evaluate(() => chrome.storage.local.get(null));
        assert.equal(
          JSON.stringify(storage).includes('authored-gate-'),
          false,
          'Gate receipts are not stored by the extension',
        );
        assert.equal(
          JSON.stringify(storage).includes(csrf),
          false,
          'Native CSRF values are not stored by the extension',
        );
      }
    }
    assert.equal(
      callbackRequests,
      6,
      'Only the six explicit native sign-in buttons open callback windows',
    );
    assert.equal(finalRequests, 0);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log(
      `${browserName} PUSH automation integration passed: Download-only native acknowledgements, CSRF/session boundary, malformed action metadata, required/multiple Spotify sign-ins, exact native GET routes and owned same-origin popup receipts without native DOM changes, automatic resume and cancellation, no account APIs or destination requests.`,
    );
  } finally {
    for (const child of opened) if (!child.isClosed()) await child.close();
    await page.close();
    await context.unroute('https://push.fm/**', providerRoute);
    await context.unroute(cdn, scriptRoute);
    await context.unroute('https://example.invalid/**', blockFinal);
    await context.unroute('https://accounts.spotify.com/**', blockFinal);
    await context.clearCookies({ name: 'gatebreaker_push_fixture_session', domain: 'push.fm' });
    await context.clearCookies({ name: 'authored-auto-restored', domain: 'push.fm' });
  }
}
