import assert from 'node:assert/strict';
import path from 'node:path';

// Every response below is an authored local fixture. No account, mail delivery,
// social action or real media is used. Website controls must never be invoked.
export async function testNativeActions({ context, browserName, screenshots, popup }) {
  const posts = [];
  const emails = [];
  const errors = [];
  const accepted = new Map();
  const authorized = new Set();
  const csrf = 'authored-hypeddit-csrf-000000000000';
  let rejectEmail = false;
  const cases = new Map([
    ['/fixture/native-actions', { id: 'native01', fan: '12345', auth: true }],
    ['/fixture/email-rejected', { id: 'native02', fan: '12346', auth: false }],
    ['/fixture/email-optional', { id: 'native03', fan: '12347', auth: false, optional: true }],
  ]);
  function fixture(item) {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=authored-native-client&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored-scope&state=${item.id}`;
    return `<!doctype html><html><head><meta name="csrf-token" content="${csrf}"><title>Authored HTTP gate</title><style>body{max-width:520px;margin:32px auto;font:16px system-ui;background:#fafaf8}.hide{display:none!important}</style></head><body>
      <h1>Native sign-in fixture</h1><a id="downloadProcess" href="#">Original download</a>
      <input type="hidden" id="current_download_file_listner" value="${item.id}"><input type="hidden" id="fan_gate_id" value="${item.fan}"><input type="hidden" id="nwSteps" value="email,sc,sp"><input type="hidden" id="wrndk" value="authored-website-session"><input type="hidden" id="is_unlimited" value="1"><input type="hidden" id="is_skippable" value="0"><input type="hidden" id="lifetime_fan_sp" value="1"><input type="hidden" name="additional_sp_user_id[]" value="authored-artist">
      <div class="hype-download-gate-steps-wrapper hide" id="myCarousel">
      <div class="fangate-slider-content" id="email-step"><input id="email_address"><input id="email_name"><button id="email_to_downloads_next">Original email submit</button><div id="gatePreviewCaptcha" class="hide"></div>${item.optional ? '<button id="skipper_email" data-step="email">Skip email</button>' : ''}</div>
      <div class="fangate-slider-content" id="spotify-step"><a id="login_to_sp" onclick="PopupCenterDual('${authUrl.replaceAll('&', '&amp;')}','sp_popup','500','500');">Original Spotify login</a>${item.auth ? '' : '<button id="skipper_sp" data-step="sp">Skip Spotify</button>'}</div>
      <div class="fangate-slider-content"><button id="skipper_sc" data-step="sc">Optional SoundCloud</button></div><button id="gateDownloadButton">Original final download</button></div>
      <script>window.originalClicks=0;window.emailSubmissions=0;window.nativeAuthClicks=0;window.finalClicks=0;window.nativeInputEvents=0;
      window.PopupCenterDual=()=>window.nativeAuthClicks++;
      document.querySelector('#downloadProcess').onclick=event=>{event.preventDefault();window.originalClicks++;};
      document.querySelector('#email_to_downloads_next').onclick=()=>window.emailSubmissions++;
      document.querySelector('#gateDownloadButton').onclick=()=>window.finalClicks++;
      document.querySelector('#email_address').addEventListener('input',()=>window.nativeInputEvents++);
      document.querySelector('#email_address').addEventListener('change',()=>window.nativeInputEvents++);</script></body></html>`;
  }
  await context.route('https://hypeddit.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/verifyEmailAddress') {
      assert.equal(request.method(), 'POST');
      const headers = await request.allHeaders();
      assert.equal(headers['x-csrf-token'], csrf);
      assert.equal(headers['x-requested-with'], 'XMLHttpRequest');
      const body = new URLSearchParams(request.postData() ?? '');
      emails.push(body);
      assert.deepEqual(
        [...body.keys()].sort(),
        ['adcode', 'email_name', 'fan_gate_id', 'hypesource', 'validateEmailAddress'].sort(),
      );
      assert.equal(body.get('validateEmailAddress'), 'gatebreakeros@proton.me');
      assert.equal(body.get('email_name'), 'Listener');
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!rejectEmail) accepted.set(body.get('fan_gate_id'), body.get('validateEmailAddress'));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: rejectEmail ? 'F' : 'T' }),
      });
      return;
    }
    if (url.pathname === '/spotify_callback') {
      assert.equal(request.method(), 'GET');
      assert([...cases.values()].some((item) => item.id === url.searchParams.get('state')));
      authorized.add(url.searchParams.get('state'));
      // Real trusted storage event, followed by an immediate close; no native slide movement.
      await route.fulfill({
        contentType: 'text/html',
        body: '<script>localStorage.setItem("hypeChildWindow","login_to_sp");window.close();</script>',
      });
      return;
    }
    if (url.pathname === '/gate/download/ul') {
      assert.equal(request.method(), 'POST');
      const body = new URLSearchParams(request.postData() ?? '');
      posts.push(body);
      const item = [...cases.values()].find((value) => value.id === body.get('file'));
      assert(item);
      const ready =
        !rejectEmail &&
        accepted.get(item.fan) === body.get('email') &&
        (!item.auth || authorized.has(item.id));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          download_status: ready,
          URL: ready ? 'https://hypeddit.com/download/fixtureNative123' : '',
        }),
      });
      return;
    }
    const item = cases.get(url.pathname);
    if (item) await route.fulfill({ contentType: 'text/html', body: fixture(item) });
    else await route.abort();
  });
  await context.route('https://accounts.spotify.com/**', async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.pathname, '/authorize');
    assert.equal(route.request().method(), 'GET');
    assert.equal(url.searchParams.get('client_id'), 'authored-native-client');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://hypeddit.com/spotify_callback');
    const callback = `https://hypeddit.com/spotify_callback?state=${encodeURIComponent(url.searchParams.get('state'))}`;
    await route.fulfill({
      contentType: 'text/html',
      body: `<h1>Local authorization fixture</h1><button onclick="location.href=${JSON.stringify(callback).replaceAll('"', '&quot;')}">Authorize fixture</button>`,
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const panel = page.locator('#gatebreaker-panel');
  async function untouched() {
    assert.deepEqual(
      await page.evaluate(() => ({
        original: window.originalClicks,
        email: window.emailSubmissions,
        auth: window.nativeAuthClicks,
        final: window.finalClicks,
        input: window.nativeInputEvents,
      })),
      { original: 0, email: 0, auth: 0, final: 0, input: 0 },
    );
    assert.equal(await page.locator('#email_address').inputValue(), '');
    assert.equal(await page.locator('#email_name').inputValue(), '');
    assert.equal(await page.locator('.move-left').count(), 0);
    assert.equal(await page.locator('#myCarousel').isVisible(), false);
  }
  await page.goto('https://hypeddit.com/fixture/native-actions');
  await panel.waitFor();
  assert.equal(posts.length, 0);
  assert.equal(emails.length, 0);
  assert.equal(
    await panel.getByRole('button', { name: /Sign in with/ }).count(),
    0,
    'Auth remains hidden before server refusal',
  );
  assert.equal(
    await panel.getByRole('button', { name: 'Download', exact: true }).isEnabled(),
    true,
  );
  await panel.getByRole('button', { name: 'Download', exact: true }).click();
  await panel.getByRole('button', { name: 'Sign in with Spotify', exact: true }).waitFor();
  assert.equal(
    await panel.getByRole('button', { name: 'Download', exact: true }).isDisabled(),
    true,
  );
  assert.equal(emails.length, 1);
  await untouched();
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshots, 'panel-required-mobile.png'),
  });
  await page.setViewportSize(viewport);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshots, 'panel-required-desktop.png'),
  });
  let surface = panel;
  if (popup) {
    await popup.evaluate(async () => {
      const [gate] = await chrome.tabs.query({
        url: 'https://hypeddit.com/fixture/native-actions',
      });
      await chrome.tabs.update(gate.id, { active: true });
    });
    await popup.reload();
    await popup.getByRole('button', { name: 'Sign in with Spotify' }).waitFor();
    await popup.locator('body').screenshot({
      animations: 'disabled',
      path: path.join(screenshots, 'popup-required-signins.png'),
    });
    surface = popup;
  }
  const opened = context.waitForEvent('page');
  await surface.getByRole('button', { name: 'Sign in with Spotify', exact: true }).click();
  const auth = await opened;
  await auth.getByRole('button', { name: 'Authorize fixture' }).waitFor();
  assert.equal(await auth.evaluate(() => !!window.opener), true);
  await auth.getByRole('button', { name: 'Authorize fixture' }).click();
  await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
  assert.equal(emails.length, 1, 'Callback verification must not repeat email submission');
  assert.equal(
    await panel.getByRole('link', { name: 'Open download' }).first().getAttribute('href'),
    'https://hypeddit.com/download/fixtureNative123',
  );
  const final = posts.at(-1);
  assert.equal(final.get('email'), emails[0].get('validateEmailAddress'));
  assert.deepEqual(final.getAll('skip_gate_steps[]'), ['sc']);
  assert.deepEqual(final.getAll('additional_sp_user_id[]'), ['authored-artist']);
  assert.equal(final.get('lifetime_fan_spotify'), '0');
  assert.equal(final.get('lifetime_fan_deezer'), '');
  assert.equal(final.get('lifetime_fan_apple'), '');
  await untouched();
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(screenshots, 'panel-success.png'),
  });
  if (popup)
    assert.deepEqual(Object.keys(await popup.evaluate(() => chrome.storage.local.get())).sort(), [
      'enabled',
    ]);

  rejectEmail = true;
  await page.goto('https://hypeddit.com/fixture/email-rejected');
  await panel.waitFor();
  const beforeRejected = emails.length;
  await panel.getByRole('button', { name: 'Download', exact: true }).click();
  await panel
    .getByText(
      'Hypeddit rejected gatebreakeros@proton.me. Gatebreaker cannot complete this required email step.',
    )
    .first()
    .waitFor();
  assert.equal(emails.length, beforeRejected + 1);
  const rejected = emails.at(-1).get('validateEmailAddress');
  await panel.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/verifyEmailAddress',
  );
  await panel
    .getByText(
      'Hypeddit rejected gatebreakeros@proton.me. Gatebreaker cannot complete this required email step.',
    )
    .first()
    .waitFor();
  assert.equal(emails.length, beforeRejected + 2);
  assert.equal(rejected, 'gatebreakeros@proton.me');
  assert.equal(
    emails.at(-1).get('validateEmailAddress'),
    rejected,
    'Explicit retries retain the fixed address',
  );
  await untouched();
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshots, 'panel-native-error.png'),
  });

  rejectEmail = false;
  await page.goto('https://hypeddit.com/fixture/email-optional');
  await panel.waitFor();
  const beforeOptional = emails.length;
  await panel.getByRole('button', { name: 'Download', exact: true }).click();
  await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
  assert.equal(emails.length, beforeOptional + 1);
  await untouched();
  assert.deepEqual(errors, []);
  console.log(
    `${browserName} HTTP native integration passed: exact email schema, server-first auth, fast-closing native callback, final HTTP proof, untouched website controls.`,
  );
  await page.close();
}
