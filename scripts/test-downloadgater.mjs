import assert from 'node:assert/strict';
import path from 'node:path';

const origin = 'https://downloadgater.com';
const receipt = 'authored-downloadgater-unlock-receipt-123456789';
function html(item, returned = false) {
  const data = {
    kind: 'gate',
    link: {
      id: item.id,
      title: 'Authored DownloadGater original',
      songTitle: 'Authored DownloadGater original',
      gates: item.auth
        ? item.driver === 'spotify'
          ? { spotifyFollow: 'required' }
          : { soundcloudFollow: 'required', soundcloudRepost: 'required' }
        : { instagramFollow: 'required' },
      emailCapture: item.email ? 'required' : 'not-required',
      hasProtectedDownload: true,
      audioPreviewUrl: 'https://example.invalid/downloadgater-preview.mp3',
    },
  };
  return `<!doctype html><html><head><title>Authored DownloadGater gate</title></head><body><div id="root"><h1>Authored DownloadGater original</h1><button id="native-download">Original Download</button><button id="native-social">Original social control</button></div><script id="__GATE_DATA__" type="application/json">${JSON.stringify(data)}</script><script>window.nativeClicks=0;document.querySelectorAll('#root button').forEach(button=>button.onclick=()=>window.nativeClicks++);${item.hydrated ? 'document.querySelector("#__GATE_DATA__").remove();' : ''}${returned ? `sessionStorage.setItem('downloadgater.${item.driver ?? 'soundcloud'}Unlock.${item.id}',JSON.stringify({createdAt:Date.now(),token:${JSON.stringify(receipt)}}));` : ''}</script><script type="module" src="/assets/index-authored-downloadgater.js"></script></body></html>`;
}
/** Wholly authored network fixtures. The installed-extension harness intercepts
 * delivery before any original/preview body can be fetched. No account is used. */
export async function testDownloadgater({ context, browserName, screenshots, popup }) {
  const cases = [
    { id: 'authored-dg-email', email: true },
    { id: 'authored-dg-hydrated', hydrated: true },
    { id: 'authored-dg-refused', refused: true },
    { id: 'authored-dg-signin', auth: true },
    { id: 'authored-dg-spotify', auth: true, driver: 'spotify' },
  ];
  const items = new Map(cases.map((item) => [item.id, item]));
  const counters = new Map(
    cases.map((item) => [
      item.id,
      { pages: 0, emails: 0, preflights: 0, starts: 0, approved: false },
    ]),
  );
  const page = await context.newPage();
  const children = new Set();
  const errors = [];
  let mediaGets = 0;
  const track = (child) => {
    if (child !== page) children.add(child);
  };
  context.on('page', track);
  page.on('pageerror', (error) => errors.push(error.message));
  const handler = async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === '/assets/index-authored-downloadgater.js')
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    const startDriver = /^\/api\/(soundcloud|spotify)\/start$/.exec(url.pathname)?.[1];
    if (startDriver) {
      assert.equal(request.method(), 'POST');
      const body = JSON.parse(request.postData());
      const item = items.get(body.linkId);
      assert(item?.auth);
      const count = counters.get(item.id);
      count.starts++;
      assert.deepEqual(body, { linkId: item.id });
      const query = new URLSearchParams({
        client_id: 'authored-dg-client',
        response_type: 'code',
        state: item.id,
        redirect_uri: `${origin}/api/${startDriver}/callback`,
      });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          authorizationUrl: `https://${startDriver === 'spotify' ? 'accounts.spotify.com' : 'secure.soundcloud.com'}/authorize?${query}`,
        }),
      });
    }
    if (/^\/api\/(soundcloud|spotify)\/callback$/.test(url.pathname)) {
      const item = items.get(url.searchParams.get('gate'));
      assert(item?.auth);
      counters.get(item.id).approved = true;
      // Firefox's Playwright routing does not consistently intercept the next
      // document in a fulfilled HTTP redirect chain. Use an authored callback
      // navigation so both sides remain intercepted; broker behavior depends
      // on the final owned-tab gate URL and native receipt, not redirect status.
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><script>location.replace(${JSON.stringify(`${origin}/g/${item.id}?authored_return=1`)})</script>`,
      });
    }
    const email = /^\/api\/links\/([^/]+)\/email$/.exec(url.pathname);
    if (email) {
      const item = items.get(email[1]);
      assert(item?.email);
      const count = counters.get(item.id);
      count.emails++;
      assert.equal(request.method(), 'POST');
      assert.deepEqual(JSON.parse(request.postData()), { email: 'gatebreakeros@proton.me' });
      return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    }
    const download = /^\/api\/download\/([^/]+)$/.exec(url.pathname);
    if (download) {
      const item = items.get(download[1]);
      assert(item);
      const count = counters.get(item.id);
      if (url.searchParams.get('preflight') !== '1') {
        mediaGets++;
        return route.abort();
      }
      count.preflights++;
      assert.equal(request.method(), 'GET');
      assert.match(request.headers().accept, /application\/json/);
      if (item.email) assert.equal(count.emails, 1, 'Email is confirmed before native preflight');
      if (item.refused)
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: '{"code":"verification_unavailable"}',
        });
      if (item.auth) {
        if (!count.approved)
          return route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              code:
                item.driver === 'spotify'
                  ? 'spotify_unlock_required'
                  : 'soundcloud_unlock_required',
            }),
          });
        if (item.driver === 'spotify') assert.equal(url.searchParams.get('spotifyToken'), receipt);
        else {
          assert.equal(url.searchParams.get('soundcloudToken'), receipt);
          assert.equal(url.searchParams.get('token'), receipt);
        }
      }
      return route.fulfill({ status: 204, body: '' });
    }
    const match = /^\/g\/([^/]+)$/.exec(url.pathname);
    const item = items.get(match?.[1]);
    if (item) {
      counters.get(item.id).pages++;
      return route.fulfill({
        contentType: 'text/html',
        body: html(item, url.searchParams.has('authored_return')),
      });
    }
    throw new Error(`Unexpected authored DownloadGater route ${request.method()} ${url.pathname}`);
  };
  const authHandler = (route) => {
    const query = new URL(route.request().url()).searchParams;
    const item = items.get(query.get('state'));
    assert(item?.auth);
    const driver = item.driver ?? 'soundcloud';
    return route.fulfill({
      contentType: 'text/html',
      headers: { 'Cross-Origin-Opener-Policy': 'same-origin' },
      body: `<!doctype html><h1>Authored provider consent</h1><p>No real account or social action.</p><button onclick="location.href='${origin}/api/${driver}/callback?gate=${item.id}'">Finish authored DownloadGater consent</button>`,
    });
  };
  const mediaHandler = (route) => {
    mediaGets++;
    return route.abort();
  };
  await context.route(`${origin}/**`, handler);
  await context.route('https://secure.soundcloud.com/authorize?**', authHandler);
  await context.route('https://accounts.spotify.com/authorize?**', authHandler);
  await context.route('https://example.invalid/downloadgater-preview.mp3', mediaHandler);
  try {
    for (const item of cases) {
      await page.goto(`${origin}/g/${item.id}`);
      const panel = page.locator('#gatebreaker-panel');
      await panel.waitFor();
      assert.equal(
        counters.get(item.id).preflights,
        0,
        'Opening a gate never starts automatic processing',
      );
      const start = panel.getByRole('button', { name: 'Download', exact: true });
      if (item.email && popup) {
        let control = popup;
        if (typeof popup === 'function') control = await popup(page);
        else {
          await control.evaluate(async (url) => {
            const api = globalThis.browser ?? chrome;
            const tab = (await api.tabs.query({})).find((tab) => tab.url === url);
            if (!tab?.id) throw new Error('Gate fixture tab missing');
            await api.tabs.update(tab.id, { active: true });
          }, `${origin}/g/${item.id}`);
          await control.reload();
        }
        await control.locator('#resolve').click();
      } else await start.click();
      if (item.auth) {
        const signIn = panel.getByRole('button', {
          name: `Sign in with ${item.driver === 'spotify' ? 'Spotify' : 'SoundCloud'}`,
          exact: true,
        });
        await signIn.waitFor();
        assert.equal(counters.get(item.id).approved, false);
        assert.equal(await start.isDisabled(), true);
        const opened = context.waitForEvent('page');
        await signIn.click();
        const consent = await opened;
        await consent.waitForURL(
          `https://${item.driver === 'spotify' ? 'accounts.spotify.com' : 'secure.soundcloud.com'}/authorize?**`,
        );
        assert.equal(
          await consent.evaluate(() => window.opener),
          null,
          'COOP severs the page Window proxy; the owned-tab broker still recovers the receipt',
        );
        await consent
          .getByRole('button', { name: 'Finish authored DownloadGater consent', exact: true })
          .click();
      }
      if (item.refused) {
        await panel
          .getByRole('status')
          .filter({ hasText: 'requires its native verification' })
          .first()
          .waitFor();
        assert.equal(await panel.getByRole('link').count(), 0);
      } else {
        const ready = panel.getByRole('link', { name: 'Open destination', exact: true });
        await ready.waitFor();
        const address = new URL(await ready.getAttribute('href'));
        assert.equal(address.origin + address.pathname, `${origin}/api/download/${item.id}`);
        assert.equal(address.searchParams.has('preflight'), false);
        if (item.auth)
          assert.equal(
            address.searchParams.get(item.driver === 'spotify' ? 'spotifyToken' : 'token'),
            receipt,
          );
      }
      assert.equal(
        await page.evaluate(() => window.nativeClicks),
        0,
        'Original native controls are never clicked',
      );
      if (item.hydrated)
        assert.equal(
          counters.get(item.id).pages,
          2,
          'Consumed model refetches only the exact gate HTML',
        );
      if (item.auth) {
        assert.equal(counters.get(item.id).starts, 1);
        assert.equal(
          counters.get(item.id).preflights,
          2,
          'A fresh native approval check follows consent',
        );
      }
    }
    assert.equal(mediaGets, 0, 'No authored original or preview media is fetched');
    assert.deepEqual(errors, []);
    if (screenshots)
      await page.screenshot({
        path: path.join(screenshots, 'downloadgater-native-receipt.png'),
        animations: 'disabled',
      });
    console.log(
      `${browserName} DownloadGater fixtures passed: native email/preflight, consumed-model recovery, refusal, owned consent receipt and fresh final approval; no native clicks or media GETs.`,
    );
  } finally {
    context.off('page', track);
    for (const child of children) if (!child.isClosed()) await child.close();
    await page.close();
    await context.unroute(`${origin}/**`, handler);
    await context.unroute('https://secure.soundcloud.com/authorize?**', authHandler);
    await context.unroute('https://accounts.spotify.com/authorize?**', authHandler);
    await context.unroute('https://example.invalid/downloadgater-preview.mp3', mediaHandler);
  }
}
