import assert from 'node:assert/strict';
import path from 'node:path';

// Isolated authored responses. No Spotify account, credentials, mail or media.
export async function testHypedditAuthReturn({ context, browserName, screenshots }) {
  let ready = false,
    mode = 'storage',
    invalidated = false;
  const posts = [];
  const sessions = [];
  const cookieName = 'gatebreaker_auth_fixture';
  const authUrl =
    'https://accounts.spotify.com/authorize?client_id=authored-return&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored-return';
  const fixture = `<!doctype html><meta name="csrf-token" content="authored-return-csrf-000000000000"><title>Authored late return</title>
    <body style="max-width:520px;margin:32px auto;font:16px system-ui;background:#fafaf8"><h1>Late return fixture</h1><a id="downloadProcess" href="#">Original download</a>
    <input type="hidden" id="current_download_file_listner" value="authoredReturn"><input type="hidden" id="fan_gate_id" value="54321"><input type="hidden" id="nwSteps" value="sp"><input type="hidden" id="wrndk" value="authored-return-session"><input type="hidden" id="is_unlimited" value="1">
    <section class="fangate-slider-content"><a id="login_to_sp" onclick="PopupCenterDual('${authUrl}','sp_popup',500,500)">Original sign-in</a></section>
    <script>var jsonGateData = {"uid":"authoredReturn","externID":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"};</script>
    <script>window.nativeClicks=0;window.PopupCenterDual=()=>window.nativeClicks++;document.querySelector('#downloadProcess').onclick=e=>{e.preventDefault();window.nativeClicks++};
    localStorage.removeItem('hypeChildWindow');
    addEventListener('storage',e=>{if(e.key==='hypeChildWindow')localStorage.removeItem('hypeChildWindow')});
    let initialized=0;document.body.addEventListener('click',()=>{if(initialized++===0){const webAudioContext=0;webAudioContext.createBuffer(1,1,22050)}},true);
    </script></body>`;
  const gateRoute = async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === '/fixture/late-auth-return')
      await route.fulfill({ contentType: 'text/html', body: fixture });
    else if (url.pathname === '/spotify_callback') {
      // Native success either advances the opener DOM or falls back to storage.
      ready = true;
      await route.fulfill({
        contentType: 'text/html',
        headers: { 'Set-Cookie': cookieName + '=accepted; Secure; HttpOnly; SameSite=Lax; Path=/' },
        body:
          mode === 'opener'
            ? '<h1>Authentication successful</h1><script>opener.document.getElementById("login_to_sp").closest(".fangate-slider-content").classList.add("move-left");window.close()</script>'
            : '<script>localStorage.setItem("hypeChildWindow","login_to_sp");window.close()</script>',
      });
    } else if (url.pathname === '/gate/download/ul') {
      assert.equal(request.method(), 'POST');
      const payload = new URLSearchParams(request.postData() ?? '');
      if (posts.length > 0) {
        assert.equal(payload.get('external_id'), 'a'.repeat(64));
        assert.equal(payload.get('hypesource'), '');
        assert.equal(payload.get('adcode'), '');
      }
      posts.push(payload);
      const headers = await request.allHeaders();
      const fixtureCookie =
        headers.cookie
          ?.split(';')
          .map((value) => value.trim())
          .find((value) => value.startsWith(cookieName + '=')) ?? null;
      const session = { cookie: fixtureCookie, origin: headers.origin ?? null };
      sessions.push(session);
      if (!ready) invalidated = true;
      const confirmed =
        ready &&
        !invalidated &&
        fixtureCookie === cookieName + '=accepted' &&
        session.origin === 'https://hypeddit.com';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          download_status: confirmed,
          URL: confirmed ? 'https://hypeddit.com/download/authoredReturn' : '',
        }),
      });
    } else await route.abort();
  };
  const authRoute = async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      headers: mode === 'storage' ? { 'Cross-Origin-Opener-Policy': 'same-origin' } : {},
      body: '<h1>Authored isolated sign-in</h1><button onclick="location.href=\'https://hypeddit.com/spotify_callback\'">Finish fixture sign-in</button>',
    });
  };
  await context.route('https://hypeddit.com/**', gateRoute);
  await context.route('https://accounts.spotify.com/**', authRoute);
  try {
    for (mode of ['storage', 'opener']) {
      await context.clearCookies({ name: cookieName, domain: 'hypeddit.com', path: '/' });
      ready = false;
      invalidated = false;
      posts.length = 0;
      sessions.length = 0;
      const page = await context.newPage();
      let auth;
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await page.goto('https://hypeddit.com/fixture/late-auth-return');
        const panel = page.locator('#gatebreaker-panel'),
          download = panel.getByRole('button', { name: 'Download', exact: true });
        await download.click();
        const signIn = panel.getByRole('button', { name: 'Sign in with Spotify', exact: true });
        await signIn.waitFor();
        assert.equal(posts.length, 0, 'No final POST before starting sign-in');
        const opened = context.waitForEvent('page');
        await signIn.click();
        auth = await opened;
        await auth.getByRole('button', { name: 'Finish fixture sign-in' }).waitFor();
        assert.equal(
          await auth.evaluate(() => window.opener === null),
          mode === 'storage',
          'Actual COOP isolation versus a native opener',
        );
        const waiting = panel.getByRole('button', { name: 'Waiting for Spotify…', exact: true });
        await waiting.waitFor();
        assert.equal(await waiting.isDisabled(), true);
        await page.waitForTimeout(5500);
        assert.equal(auth.isClosed(), false);
        assert.equal(await download.isDisabled(), true);
        assert.equal(await panel.getByRole('alert').count(), 0);
        assert.equal(posts.length, 0, 'Slow sign-in must not consume the final-request nonce');
        if (mode === 'opener') {
          await page.screenshot({
            path: path.join(screenshots, 'panel-signin-waiting.png'),
            animations: 'disabled',
          });
          const size = page.viewportSize();
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({
            path: path.join(screenshots, 'panel-signin-waiting-mobile.png'),
            animations: 'disabled',
          });
          await page.setViewportSize(size);
        }
        await auth.getByRole('button', { name: 'Finish fixture sign-in' }).click();
        await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
        assert.equal(invalidated, false, 'Gate is never probed before callback approval');
        assert.equal(posts.length, 1, 'One final POST after the native callback');
        assert(
          sessions.every((session) => session.origin === 'https://hypeddit.com'),
          'All POSTs retain the website Origin',
        );
        assert(
          sessions.some((session) => session.cookie === cookieName + '=accepted'),
          'Final checks send the HttpOnly callback session cookie',
        );
        assert.equal(
          await page.evaluate(
            (name) =>
              document.cookie.split(';').some((value) => value.trim().startsWith(name + '=')),
            cookieName,
          ),
          false,
          'Website script cannot read the HttpOnly session cookie',
        );
        console.log(browserName + ' ' + mode + ' authored session:', sessions);
        assert.equal(await page.evaluate(() => window.nativeClicks), 0);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /webAudioContext.createBuffer is not a function/);
        assert.equal(
          await panel
            .getByRole('button', { name: 'Connected to Spotify', exact: true })
            .isDisabled(),
          true,
        );
      } catch (error) {
        console.error(browserName + ' ' + mode + ' authored session checks:', sessions);
        await page
          .screenshot({
            path: path.join(screenshots, 'auth-cookie-' + mode + '-failure.png'),
            animations: 'disabled',
          })
          .catch(() => {});
        throw error;
      } finally {
        if (auth && !auth.isClosed()) await auth.close();
        await page.close();
      }
    }
    console.log(
      `${browserName} sign-in return integration passed: COOP storage and native opener callbacks, zero premature final requests during delayed sign-in, HttpOnly callback cookie and website Origin, final server proof, waiting controls, native audio exception isolation.`,
    );
  } finally {
    await context.clearCookies({ name: cookieName, domain: 'hypeddit.com', path: '/' });
    await context.unroute('https://hypeddit.com/**', gateRoute);
    await context.unroute('https://accounts.spotify.com/**', authRoute);
  }
}
