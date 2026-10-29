import assert from 'node:assert/strict';
import { pumpFixture, pumpGatePath } from './test-pumpyoursound.mjs';

/** Intercepted SDK pages only; never contacts SoundCloud or a real account. */
export async function testCliSdk({ createBrowserResolver, extensionPath, profile }) {
  const origin = 'https://pumpyoursound.com';
  const item = { id: '910004', account: true, social: false, done: new Set() };
  const address = origin + pumpGatePath(item.id);
  const target = 'https://files.example/pys-910004.wav?signature=authored%2Fvalue';
  const secret = 'authored-sdk-token-confined-to-main-world';
  const modes = [];
  let context,
    posts = 0,
    connects = 0,
    mediaGets = 0,
    nativeClicks = 0;
  const resolver = createBrowserResolver({
    profile,
    extensionPath,
    async setup(browser, headless) {
      context = browser;
      modes.push(headless);
      await browser.route(origin + '/**', async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.pathname === '/js/require.js' || url.pathname === '/js/main.min.js')
          return route.fulfill({ contentType: 'application/javascript', body: '' });
        if (url.pathname === '/authored-pys-callback')
          return route.fulfill({
            contentType: 'text/html',
            headers: { 'Set-Cookie': 'pys_auth=authored; Secure; HttpOnly; SameSite=Lax; Path=/' },
            body: `<script>window.opener.postMessage({authored:'pys-approved-${item.id}'},'${origin}');window.close()</script>`,
          });
        if (url.pathname === '/' && url.searchParams.get('do') === 'mySoundcloudAccessToken') {
          assert.match((await request.allHeaders()).cookie ?? '', /pys_auth=authored/);
          return route.fulfill({ contentType: 'text/plain', body: secret });
        }
        if (url.pathname === '/auth/soundcloud-events/') {
          assert.equal(url.searchParams.get('accessToken'), secret);
          item.done.add('soundcloud');
          return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ doneKind: 'soundcloud' }),
          });
        }
        if (url.pathname === pumpGatePath(item.id)) {
          if (request.method() === 'POST') {
            assert(item.done.has('soundcloud'), 'No final request before approved SDK action');
            posts++;
            nativeClicks += await request.frame().evaluate(() => window.nativeClicks);
            return route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify({ redirect: pumpGatePath(item.id) + '?_fid=authored-result' }),
            });
          }
          return route.fulfill({
            contentType: 'text/html',
            body: pumpFixture(item, url.searchParams.has('_fid')).replace(
              "popup.location.href='/authored-pys-consent?gate=",
              "popup.location.href='https://secure.soundcloud.com/authorize?gate=",
            ),
          });
        }
        return route.abort();
      });
      await browser.route('https://secure.soundcloud.com/**', (route) => {
        connects++;
        return route.fulfill({
          contentType: 'text/html',
          body: `<h1>Authored SDK consent</h1><button onclick="location.href='${origin}/authored-pys-callback'">Approve authored SDK</button>`,
        });
      });
      await browser.route('https://files.example/**', (route) => {
        if (route.request().method() !== 'HEAD') mediaGets++;
        return route.fulfill({
          status: 200,
          headers: { 'content-type': 'audio/wav', 'content-length': '2048' },
          body: '',
        });
      });
    },
  });
  try {
    let failure;
    const pending = resolver.resolve(address, {
      signal: AbortSignal.timeout(60000),
      inspect: false,
      progress() {},
    });
    void pending.catch((error) => {
      failure = error;
    });
    let auth;
    for (let index = 0; index < 400; index++) {
      if (failure) throw failure;
      if (modes.at(-1) === false)
        auth = context
          .pages()
          .find((page) => page.url().startsWith('https://secure.soundcloud.com/'));
      if (auth) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(auth, 'Only the authored SDK account window should need interaction');
    const gate = context.pages().find((page) => page.url() === address);
    const bounds = async (page) => {
      const session = await context.newCDPSession(page);
      try {
        return await session.send('Browser.getWindowForTarget');
      } finally {
        await session.detach();
      }
    };
    assert.equal((await bounds(gate)).bounds.windowState, 'minimized');
    assert.equal((await bounds(auth)).bounds.windowState, 'normal');
    assert.notEqual((await bounds(gate)).windowId, (await bounds(auth)).windowId);
    assert.equal(posts, 0);
    await auth.getByRole('button', { name: 'Approve authored SDK', exact: true }).click();
    const result = await pending;
    assert.equal(result.result.url, target);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.deepEqual(modes, [true, false]);
    assert.equal(posts, 1);
    assert.equal(connects, 2, 'One headless attempt, then one visible consent window');
    assert.equal(nativeClicks, 0);
    assert.equal(mediaGets, 0);
    console.log(
      'CLI SDK: automatic native SoundCloud handoff, minimized gate, MAIN-world token confinement and server-approved result passed',
    );
  } finally {
    await resolver.close();
  }
}
