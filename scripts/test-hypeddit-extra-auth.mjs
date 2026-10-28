import assert from 'node:assert/strict';

// Authored pages only. No provider account, real consent, social writes or media.
export async function testHypedditExtraAuth({ context, browserName }) {
  const contracts = [
    {
      id: 'mixcloud',
      label: 'Mixcloud',
      step: 'mc',
      element: 'login_to_mc',
      popup: 'mc_popup',
      origin: 'https://mixcloud.com',
      authPath: '/oauth/authorize',
      callback: '/gate/mixcloudlogin',
      client: 'client_id',
    },
    {
      id: 'deezer',
      label: 'Deezer',
      step: 'dz',
      element: 'login_to_dz',
      popup: 'dz_popup',
      origin: 'https://connect.deezer.com',
      authPath: '/oauth/auth.php',
      callback: '/deezer_callback',
      client: 'app_id',
    },
  ];
  let contract, mode, ready, invalidated, posts;
  const state = 'authored-extra-state';
  const cookieName = 'gatebreaker_extra_auth_fixture';
  const callback = () =>
    new URL(
      contract.callback + (contract.id === 'mixcloud' ? '?state=' + state : ''),
      'https://hypeddit.com',
    ).href;
  const address = () => {
    const url = new URL(contract.authPath, contract.origin);
    url.searchParams.set(contract.client, 'authored-public-client');
    url.searchParams.set('redirect_uri', callback());
    if (contract.id === 'deezer') url.searchParams.set('perms', 'basic_access,manage_library');
    url.searchParams.set('state', state);
    return url.href;
  };
  const fixture =
    () => `<!doctype html><meta name="csrf-token" content="authored-extra-csrf-000000000000"><title>Authored ${contract.label}</title>
    <body><h1>Extra native handoff</h1><a id="downloadProcess">Original download</a><input type="hidden" id="current_download_file_listner" value="extraAuth${contract.step}"><input type="hidden" id="fan_gate_id" value="54321"><input type="hidden" id="wrndk" value="authored-extra-session"><input type="hidden" id="is_unlimited" value="1"><input type="hidden" id="nwSteps" value="${contract.step}"><input type="hidden" id="steps_select" value="dw,${contract.step}">
    ${contract.step === 'dz' ? '<input type="hidden" id="lifetime_fan_dz" value="1">' : ''}
    <section class="fangate-slider-content"><a id="${contract.element}" onclick="PopupCenterDual('${address()}','${contract.popup}',500,500)">Original connect</a><input name="additional_${contract.step}_user_id[]" value="authored-target" data-profile_type="artist"></section>
    <script>var jsonGateData={"uid":"extraAuth${contract.step}","externID":"${'b'.repeat(64)}"};window.nativeClicks=0;window.PopupCenterDual=()=>window.nativeClicks++;document.getElementById('downloadProcess').onclick=()=>window.nativeClicks++;localStorage.removeItem('hypeChildWindow');addEventListener('storage',event=>{if(event.key==='hypeChildWindow')localStorage.removeItem('hypeChildWindow')});</script>`;
  const gateRoute = async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === '/fixture/extra-native-auth')
      return route.fulfill({ contentType: 'text/html', body: fixture() });
    if (url.pathname === contract.callback) {
      ready = true;
      return route.fulfill({
        contentType: 'text/html',
        headers: { 'Set-Cookie': cookieName + '=accepted; Secure; HttpOnly; SameSite=Lax; Path=/' },
        body:
          mode === 'opener'
            ? `<script>opener.document.getElementById('${contract.element}').closest('.fangate-slider-content').classList.add('move-left');window.close()</script>`
            : `<script>localStorage.setItem('hypeChildWindow','${contract.element}');window.close()</script>`,
      });
    }
    if (url.pathname === '/gate/download/ul') {
      assert.equal(request.method(), 'POST');
      const payload = new URLSearchParams(request.postData() ?? '');
      const headers = await request.allHeaders();
      posts.push(payload);
      if (!ready && posts.length > 1) invalidated = true;
      const confirmed = ready && !invalidated && headers.cookie?.includes(cookieName + '=accepted');
      if (ready) {
        assert.equal(headers.origin, 'https://hypeddit.com');
        assert.deepEqual(payload.getAll('additional_' + contract.step + '_user_id[]'), [
          'authored-target',
        ]);
        if (contract.id === 'deezer') assert.equal(payload.get('lifetime_fan_deezer'), '0');
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          download_status: !!confirmed,
          URL: confirmed ? 'https://hypeddit.com/download/authoredExtraNative' : '',
        }),
      });
    }
    return route.abort();
  };
  const authRoute = async (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: mode === 'storage' ? { 'Cross-Origin-Opener-Policy': 'same-origin' } : {},
      body: `<h1>Authored consent boundary</h1><button onclick='location.href=${JSON.stringify(callback())}'>Finish fixture sign-in</button>`,
    });
  const publicRoute = (route) => route.fulfill({ status: 403, body: '' });
  await context.route('https://hypeddit.com/**', gateRoute);
  await context.route('https://mixcloud.com/**', authRoute);
  await context.route('https://connect.deezer.com/**', authRoute);
  await context.route('https://hypeddit-gates-prod.s3.amazonaws.com/extraAuth*', publicRoute);
  try {
    for (contract of contracts)
      for (mode of ['storage', 'opener']) {
        ready = false;
        invalidated = false;
        posts = [];
        await context.clearCookies({ name: cookieName, domain: 'hypeddit.com', path: '/' });
        const page = await context.newPage();
        let auth;
        try {
          await page.goto('https://hypeddit.com/fixture/extra-native-auth');
          const panel = page.locator('#gatebreaker-panel'),
            download = panel.getByRole('button', { name: 'Download', exact: true });
          await download.waitFor();
          assert.equal(
            await panel
              .getByRole('button', { name: 'Sign in with ' + contract.label, exact: true })
              .count(),
            0,
          );
          await download.click();
          const signIn = panel.getByRole('button', {
            name: 'Sign in with ' + contract.label,
            exact: true,
          });
          await signIn.waitFor();
          assert.equal(posts.length, 1, 'One ordinary anonymous probe before introducing login');
          const opened = context.waitForEvent('page');
          await signIn.click();
          auth = await opened;
          await auth.getByRole('button', { name: 'Finish fixture sign-in', exact: true }).waitFor();
          // COOP may clear window.name; exact open() names are checked in unit tests.
          assert.equal(await auth.evaluate(() => window.opener === null), mode === 'storage');
          await page.waitForTimeout(1300);
          assert.equal(
            posts.length,
            1,
            'An open or COOP-closed handle never starts a premature check',
          );
          assert.equal(await download.isDisabled(), true);
          await auth.getByRole('button', { name: 'Finish fixture sign-in', exact: true }).click();
          await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
          assert.equal(posts.length, 2, 'One final request after the exact native callback');
          assert.equal(invalidated, false);
          assert.equal(
            await panel
              .getByRole('button', { name: 'Connected to ' + contract.label, exact: true })
              .isDisabled(),
            true,
          );
          assert.equal(await page.evaluate(() => window.nativeClicks), 0);
        } finally {
          if (auth && !auth.isClosed()) await auth.close();
          await page.close();
        }
      }
    console.log(
      browserName +
        ' Hypeddit Mixcloud/Deezer fixtures passed: initial server-first probe, strict native addresses and popup names, opener/COOP callbacks, no early post-sign-in checks, HttpOnly session and final server proof. Real account completion remains unverified.',
    );
  } finally {
    await context.clearCookies({ name: cookieName, domain: 'hypeddit.com', path: '/' });
    await context.unroute('https://hypeddit.com/**', gateRoute);
    await context.unroute('https://mixcloud.com/**', authRoute);
    await context.unroute('https://connect.deezer.com/**', authRoute);
    await context.unroute('https://hypeddit-gates-prod.s3.amazonaws.com/extraAuth*', publicRoute);
  }
}
