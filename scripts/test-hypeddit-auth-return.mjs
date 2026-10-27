import assert from 'node:assert/strict';

// Isolated authored responses, including a real COOP browsing-context split.
// No Spotify account, credentials, mail or media are used.
export async function testHypedditAuthReturn({ context, browserName }) {
  let ready = false;
  const posts = [];
  const authUrl =
    'https://accounts.spotify.com/authorize?client_id=authored-return&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored-return';
  const fixture = `<!doctype html><meta name="csrf-token" content="authored-return-csrf-000000000000"><title>Authored late return</title>
    <h1>Late return fixture</h1><a id="downloadProcess" href="#">Original download</a>
    <input id="current_download_file_listner" value="authoredReturn"><input id="fan_gate_id" value="54321"><input id="nwSteps" value="sp"><input id="wrndk" value="authored-return-session"><input id="is_unlimited" value="1">
    <section class="fangate-slider-content"><a id="login_to_sp" onclick="PopupCenterDual('${authUrl}','sp_popup',500,500)">Original sign-in</a></section>
    <script>window.nativeClicks=0;window.PopupCenterDual=()=>window.nativeClicks++;document.querySelector('#downloadProcess').onclick=e=>{e.preventDefault();window.nativeClicks++};
    localStorage.removeItem('hypeChildWindow');
    addEventListener('storage',e=>{if(e.key==='hypeChildWindow')localStorage.removeItem('hypeChildWindow')});</script>`;
  const gateRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/fixture/late-auth-return') {
      await route.fulfill({ contentType: 'text/html', body: fixture });
    } else if (url.pathname === '/spotify_callback') {
      ready = true;
      await route.fulfill({
        contentType: 'text/html',
        body: '<script>localStorage.setItem("hypeChildWindow","login_to_sp");window.close()</script>',
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
  const page = await context.newPage();
  let auth;
  try {
    await page.goto('https://hypeddit.com/fixture/late-auth-return');
    const panel = page.locator('#gatebreaker-panel');
    const download = panel.getByRole('button', { name: 'Download', exact: true });
    await download.click();
    const signIn = panel.getByRole('button', { name: 'Sign in with Spotify', exact: true });
    await signIn.waitFor();
    assert.equal(posts.length, 1);
    const earlyCheck = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/gate/download/ul',
    );
    const opened = context.waitForEvent('page');
    await signIn.click();
    auth = await opened;
    await auth.getByRole('button', { name: 'Finish fixture sign-in' }).waitFor();
    assert.equal(
      await auth.evaluate(() => window.opener === null),
      true,
      'COOP severed the real opener',
    );
    await earlyCheck;
    // The early closed handle must not discard the live authorization attempt.
    await page.waitForTimeout(1200);
    assert.equal(auth.isClosed(), false);
    assert.equal(await download.isDisabled(), true);
    assert.equal(await panel.getByRole('alert').count(), 0);
    assert.equal(posts.length, 2, 'Polling does not repeatedly POST a closed handle');
    await auth.getByRole('button', { name: 'Finish fixture sign-in' }).click();
    await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
    assert.equal(posts.length, 3, 'The late native callback rechecks final HTTP proof');
    assert.equal(await page.evaluate(() => window.nativeClicks), 0);
    console.log(
      `${browserName} isolated late sign-in callback passed: live COOP popup, early refusal retained, late native storage return, final HTTP proof.`,
    );
  } finally {
    if (auth && !auth.isClosed()) await auth.close();
    await page.close();
    await context.unroute('https://hypeddit.com/**', gateRoute);
    await context.unroute('https://accounts.spotify.com/**', authRoute);
  }
}
