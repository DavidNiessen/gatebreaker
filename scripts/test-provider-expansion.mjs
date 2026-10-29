import assert from 'node:assert/strict';

const id = '11111111-1111-4111-8111-111111111111';
const fan = '22222222-2222-4222-8222-222222222222';
const original = 'https://files.example.invalid/stillhype-original.wav?signature=authored%2Fvalue';
function shell(title, body, scripts = '') {
  return `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><button data-native>Original Download</button>${body}
  <script>window.nativeClicks=0;document.querySelector('[data-native]').onclick=()=>window.nativeClicks++;self.__next_f=[];</script>${scripts}</body></html>`;
}
function stillHtml(mode) {
  const campaign = {
    id,
    slug: `fixture-${mode}`,
    title: 'Authored StillHype',
    is_published: true,
    is_external_download: mode === 'external',
    gate_steps:
      mode === 'auth'
        ? [
            {
              id: 'follow',
              type: 'soundcloud_follow',
              required: true,
              target_user_id: 'https://soundcloud.com/authored',
            },
          ]
        : [
            { id: 'email', type: 'email_capture', required: true },
            { id: 'instagram', type: 'instagram_follow', required: true },
          ],
    download_url: 'https://files.example.invalid/preview.mp3',
  };
  const flight = '1:' + JSON.stringify(['$', '$L1', null, { campaign }]);
  return shell(
    'Authored StillHype',
    '',
    `<script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`,
  );
}
function kitHtml(mode) {
  const gate = {
    id: '30',
    handle: `fixture-${mode}`,
    title: 'Authored MyPressKit',
    availability: { state: 'available' },
    combineSoundCloudSteps: false,
    gateSteps: [{ index: 0, type: 'instagram-follow', required: true }],
  };
  const flight =
    '5:' +
    JSON.stringify([
      '$',
      '$L1',
      null,
      {
        gate,
        providers: { soundcloudOAuth: true, spotifyOAuth: true },
        initialCompletedStepIndexes: [],
        initialCapturedEmail: null,
        initialUnlocked: false,
      },
    ]);
  return shell(
    'Authored MyPressKit',
    '',
    `<script src="/_next/static/chunks/app/(frontend)/gate/%5Bhandle%5D/page-authored.js"></script><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`,
  );
}
export async function testProviderExpansion({ context, browserName, popup }) {
  const state = new Map();
  const counts = { unlocks: 0, previews: 0, steps: 0, emails: 0 };
  const stillRoute = async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.startsWith('/g/fixture-')) {
      const mode = url.pathname.slice('/g/fixture-'.length);
      if (!state.has(mode)) state.set(mode, { mode, completed: [], connected: false });
      return route.fulfill({ contentType: 'text/html', body: stillHtml(mode) });
    }
    const referer = (await request.allHeaders()).referer ?? '';
    const mode = /fixture-(\w+)/.exec(referer)?.[1] ?? 'auth';
    const current = state.get(mode) ?? state.get('auth');
    if (url.pathname === '/api/oauth/soundcloud') {
      assert.equal(url.searchParams.get('fan_id'), fan);
      assert.equal(url.searchParams.get('step_id'), 'follow');
      return route.fulfill({
        contentType: 'text/html',
        body: "<button onclick=\"fetch('/fixture/approve',{method:'POST'}).then(()=>window.close())\">Complete authored consent</button>",
      });
    }
    if (url.pathname === '/fixture/approve') {
      state.get('auth').connected = true;
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    if (url.pathname.endsWith('/preview')) {
      counts.previews++;
      return route.abort();
    }
    const data = JSON.parse(request.postData() ?? '{}');
    assert.equal(data.campaign_id, id);
    const respond = (value, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.endsWith('/init')) return respond({ fan_id: fan, completed_steps: [] });
    assert.equal(data.fan_id, fan);
    if (url.pathname.endsWith('/submit-email')) {
      counts.emails++;
      assert.equal(data.email, 'gatebreakeros@proton.me');
      return respond({ fan_id: fan });
    }
    if (url.pathname.endsWith('/mark-complete')) {
      counts.steps++;
      assert.equal(data.step_id, 'instagram');
      return respond({ ok: true });
    }
    if (url.pathname.endsWith('/sc-action')) return respond({ needs_auth: true }, 401);
    if (url.pathname.endsWith('/verify-action')) return respond({ verified: current.connected });
    assert.equal(url.pathname, '/api/gate/unlock');
    counts.unlocks++;
    if (mode === 'auth')
      assert(current.connected, 'Final unlock must wait for server-verified login');
    if (mode === 'refused') return respond({ error: 'locked' }, 403);
    return respond({ download_url: mode === 'unsafe' ? 'http://localhost/unsafe' : original });
  };
  const kitState = new Map();
  const kitRoute = async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.startsWith('/gate/fixture-'))
      return route.fulfill({
        contentType: 'text/html',
        body: kitHtml(url.pathname.slice('/gate/fixture-'.length)),
      });
    if (url.pathname.includes('/_next/'))
      return route.fulfill({ contentType: 'text/javascript', body: '' });
    const mode = /fixture-(\w+)/.exec((await request.allHeaders()).referer ?? '')?.[1] ?? 'ready';
    if (url.pathname.endsWith('/track-step')) {
      assert.equal(request.method(), 'POST');
      assert.equal(JSON.parse(request.postData()).stepIndex, 0);
      kitState.set(mode, true);
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    if (url.pathname.endsWith('/verify-step')) {
      const done = kitState.get(mode) === true;
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          unlockState: { unlocked: done, remaining: done ? [] : [0], total: 1 },
          completedStepIndexes: done ? [0] : [],
          downloadToken: done && mode !== 'nogrant' ? 'authored-native-download-grant' : null,
        }),
      });
    }
    if (url.pathname.endsWith('/preview')) {
      counts.previews++;
      return route.abort();
    }
    throw new Error('Unexpected MyPressKit fixture request');
  };
  await context.route('https://www.stillhype.io/**', stillRoute);
  await context.route('https://www.mypresskit.info/**', kitRoute);
  try {
    for (const mode of ['ready', 'external', 'refused', 'unsafe']) {
      const page = await context.newPage();
      await page.goto(`https://www.stillhype.io/g/fixture-${mode}`);
      const panel = page.locator('#gatebreaker-panel');
      await panel.waitFor();
      assert.equal(counts.emails, state.size - 1, 'Page inspection must not submit the email');
      await panel.getByRole('button', { name: 'Download', exact: true }).click();
      if (mode === 'ready' || mode === 'external') {
        const link = panel.getByRole('link').filter({ hasText: /Open/ }).first();
        await link.waitFor();
        assert.equal(await link.getAttribute('href'), original);
      } else await panel.getByRole('button', { name: 'Try again', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.nativeClicks), 0);
      await page.close();
    }
    const page = await context.newPage();
    await page.goto('https://www.stillhype.io/g/fixture-auth');
    const panel = page.locator('#gatebreaker-panel');
    await panel.waitFor();
    const prior = counts.unlocks;
    await panel.getByRole('button', { name: 'Download', exact: true }).click();
    const login = panel.getByRole('button', { name: 'Sign in with SoundCloud', exact: true });
    await login.waitFor();
    assert.equal(counts.unlocks, prior);
    const opened = context.waitForEvent('page');
    await login.click();
    const auth = await opened;
    await auth.getByRole('button', { name: 'Complete authored consent' }).click();
    await panel.getByRole('link').filter({ hasText: /Open/ }).first().waitFor();
    assert.equal(counts.unlocks, prior + 1);
    assert.equal(await page.evaluate(() => window.nativeClicks), 0);
    if (popup) {
      await popup.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((entry) => entry.url === url);
        await chrome.tabs.update(tab.id, { active: true });
      }, page.url());
      await popup.reload();
      await popup.getByRole('link').filter({ hasText: /Open/ }).first().waitFor();
    }
    await page.close();
    for (const mode of ['ready', 'nogrant']) {
      const page = await context.newPage();
      await page.goto(`https://www.mypresskit.info/gate/fixture-${mode}`);
      const panel = page.locator('#gatebreaker-panel');
      await panel.waitFor();
      await panel.getByRole('button', { name: 'Download', exact: true }).click();
      if (mode === 'ready') {
        const link = panel.getByRole('link').filter({ hasText: /Open/ }).first();
        await link.waitFor();
        assert.match(
          await link.getAttribute('href'),
          /^https:\/\/www\.mypresskit\.info\/api\/download-gates\/30\/download\?/,
        );
      } else await panel.getByRole('button', { name: 'Try again', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.nativeClicks), 0);
      await page.close();
    }
    assert.equal(counts.previews, 0);
    console.log(
      `${browserName} StillHype/MyPressKit: native HTTP, final grants/refusals, sign-in continuation, no preview/native clicks passed`,
    );
  } finally {
    await context.unroute('https://www.stillhype.io/**', stillRoute);
    await context.unroute('https://www.mypresskit.info/**', kitRoute);
  }
}
