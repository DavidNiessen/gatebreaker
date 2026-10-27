import assert from 'node:assert/strict';
import path from 'node:path';

// Isolated authored responses. No Spotify account, credentials, mail or media.
export async function testHypedditAuthReturn({ context, browserName, screenshots }) {
  let ready = false,
    mode = 'storage';
  const posts = [];
  const authUrl =
    'https://accounts.spotify.com/authorize?client_id=authored-return&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored-return';
  const fixture = `<!doctype html><meta name="csrf-token" content="authored-return-csrf-000000000000"><title>Authored late return</title>
    <body style="max-width:520px;margin:32px auto;font:16px system-ui;background:#fafaf8"><h1>Late return fixture</h1><a id="downloadProcess" href="#">Original download</a>
    <input type="hidden" id="current_download_file_listner" value="authoredReturn"><input type="hidden" id="fan_gate_id" value="54321"><input type="hidden" id="nwSteps" value="sp"><input type="hidden" id="wrndk" value="authored-return-session"><input type="hidden" id="is_unlimited" value="1">
    <section class="fangate-slider-content"><a id="login_to_sp" onclick="PopupCenterDual('${authUrl}','sp_popup',500,500)">Original sign-in</a></section>
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
      // Model an immediate success/close with no native flag, then session propagation.
      if (mode === 'silent')
        setTimeout(() => {
          ready = true;
        }, 300);
      else ready = true;
      await route.fulfill({
        contentType: 'text/html',
        body:
          mode === 'silent'
            ? '<h1>Authentication successful</h1><script>window.close()</script>'
            : '<script>localStorage.setItem("hypeChildWindow","login_to_sp");window.close()</script>',
      });
    } else if (url.pathname === '/gate/download/ul') {
      assert.equal(request.method(), 'POST');
      posts.push(new URLSearchParams(request.postData() ?? ''));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          download_status: ready,
          URL: ready ? 'https://hypeddit.com/download/authoredReturn' : '',
        }),
      });
    } else await route.abort();
  };
  const authRoute = async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      headers: { 'Cross-Origin-Opener-Policy': 'same-origin' },
      body: '<h1>Authored isolated sign-in</h1><button onclick="location.href=\'https://hypeddit.com/spotify_callback\'">Finish fixture sign-in</button>',
    });
  };
  await context.route('https://hypeddit.com/**', gateRoute);
  await context.route('https://accounts.spotify.com/**', authRoute);
  try {
    for (mode of ['storage', 'silent']) {
      ready = false;
      posts.length = 0;
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
        assert.equal(posts.length, 1);
        const earlyCheck =
          browserName === 'chrome'
            ? page.waitForResponse((r) => new URL(r.url()).pathname === '/gate/download/ul')
            : null;
        const opened = context.waitForEvent('page');
        await signIn.click();
        auth = await opened;
        await auth.getByRole('button', { name: 'Finish fixture sign-in' }).waitFor();
        assert.equal(
          await auth.evaluate(() => window.opener === null),
          true,
          'Real COOP opener isolation',
        );
        await earlyCheck;
        const waiting = panel.getByRole('button', { name: 'Waiting for Spotify…', exact: true });
        await waiting.waitFor();
        assert.equal(await waiting.isDisabled(), true);
        await page.waitForTimeout(1200);
        assert.equal(auth.isClosed(), false);
        assert.equal(await download.isDisabled(), true);
        assert.equal(await panel.getByRole('alert').count(), 0);
        assert(posts.length < 5, 'Backoff keeps checks bounded while consent remains open');
        if (mode === 'silent') {
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
        assert(posts.length <= 7, 'No unbounded verification loop');
        assert.equal(await page.evaluate(() => window.nativeClicks), 0);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /webAudioContext.createBuffer is not a function/);
        assert.equal(
          await panel
            .getByRole('button', { name: 'Connected to Spotify', exact: true })
            .isDisabled(),
          true,
        );
      } finally {
        if (auth && !auth.isClosed()) await auth.close();
        await page.close();
      }
    }
    console.log(
      `${browserName} sign-in return integration passed: COOP isolation, native flag and silent success/close, delayed session propagation, bounded HTTP recovery, waiting controls, native audio exception isolation.`,
    );
  } finally {
    await context.unroute('https://hypeddit.com/**', gateRoute);
    await context.unroute('https://accounts.spotify.com/**', authRoute);
  }
}
