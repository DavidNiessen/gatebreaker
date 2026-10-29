import assert from 'node:assert/strict';

const origin = 'https://droploud.com';
const api = 'https://api.droploud.com';
const nativeSid = '11111111-1111-4111-8111-111111111111';
const otherSid = '22222222-2222-4222-8222-222222222222';
const file = 'https://example.invalid/authored-droploud-original.wav';
const r2File =
  'https://example.invalid/authored-r2-original.wav?X-Amz-Credential=fixture%2F20260101%2Fauto%2Fs3%2Faws4_request&X-Amz-Signature=authored-not-a-signature&response-content-disposition=attachment%3B%20filename%3D%22Authored%20mix.wav%22%3B%20filename%2A%3DUTF-8%27%27Authored%2520mix.wav';
const external = 'https://example.invalid/authored-droploud-page';
const cors = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};
const sc = [{ id: 'sc_follow', type: 'soundcloud_follow' }];
const comment = [...sc, { id: 'sc_comment', type: 'soundcloud_comment' }];
function html(item) {
  const model = {
    track: {
      id: item.id,
      title: 'Authored Droploud original WAV',
      ...(item.manualActions
        ? { soundcloud_url: `https://soundcloud.com/gatebreaker-fixture/${item.id}` }
        : {}),
    },
    steps: item.steps,
    advertise_droploud_follow: false,
  };
  const flight = `1:["$","$L1",null,{"gateData":${JSON.stringify(model)},"trackId":"${item.id}"}]`;
  return `<!doctype html><html><head><title>Authored Droploud fixture</title></head><body><h1 class="dtr-caption-title">Authored Droploud original WAV</h1><div class="dtr-track-header"></div><div class="dtr-stage"><div class="dtr-card-pane"><h2 class="dtr-card-title">Free download</h2><button class="dtr-card-cta">Free download</button><button data-native-step>Original required step</button></div></div><script>
    localStorage.clear();sessionStorage.clear();
    ${item.saved ? `localStorage.setItem('dw_sid:${item.id}',${JSON.stringify(nativeSid)});sessionStorage.setItem('dw_sid',${JSON.stringify(otherSid)});` : item.general ? `sessionStorage.setItem('dw_sid',${JSON.stringify(nativeSid)});` : ''}
    window.nativeClicks=0;
    document.querySelector('.dtr-card-cta').onclick=()=>window.nativeClicks++;
    document.querySelector('[data-native-step]').onclick=()=>window.nativeClicks++;
    window.fixtureInitialStorage=JSON.stringify({local:Object.entries(localStorage),session:Object.entries(sessionStorage)});
    self.__next_f=[];
  </script><script>self.__next_f.push(${JSON.stringify([1, flight])})</script><script src="/_next/static/immutable/chunks/1d0l2-pz5xzsu.js"></script></body></html>`;
}
function callback(id) {
  return `<!doctype html><h1>Authored Droploud consent fixture</h1><p>No real account is used.</p><button id="finish">Finish authored consent</button><script>document.querySelector('#finish').onclick=async()=>{await fetch('/__authored_complete?track_id=${id}');document.querySelector('#finish').disabled=true;};</script>`;
}

/** Authored installed-extension helper. Call only AFTER fixture-delivery API interception.
 * Never run against production models/accounts. Every destination request is aborted. */
export async function testDroploud({
  context,
  browserName,
  screenshots,
  preparePreferences = async () => {},
}) {
  const cases = [
    {
      id: '11111111-aaaa-4111-8111-111111111111',
      steps: [...comment, { id: 'email', type: 'email' }],
      saved: true,
    },
    { id: '22222222-aaaa-4222-8222-222222222222', steps: comment, general: true, external: true },
    { id: '33333333-aaaa-4333-8333-333333333333', steps: sc, general: true, authorize: true },
    { id: '44444444-aaaa-4444-8444-444444444444', steps: comment, general: true, unfinished: true },
    { id: '55555555-aaaa-4555-8555-555555555555', steps: [], general: true, unsafe: true },
    {
      id: '66666666-aaaa-4666-8666-666666666666',
      steps: [{ id: 'email', type: 'email' }],
      general: true,
      blocked: true,
    },
    {
      id: '77777777-aaaa-4777-8777-777777777777',
      steps: [{ id: 'droploud_follow', type: 'droploud_follow' }],
    },
    {
      id: '88888888-aaaa-4888-8888-888888888888',
      steps: [
        { id: 'instagram', type: 'instagram_follow' },
        ...comment,
        { id: 'sc_repost', type: 'soundcloud_repost' },
      ],
      general: true,
      authorize: true,
      configuredComment: true,
    },
    {
      id: '99999999-aaaa-4999-8999-999999999999',
      steps: [...comment, { id: 'sc_repost', type: 'soundcloud_repost' }],
      general: true,
      authorize: true,
      configuredComment: true,
      configureInPanel: true,
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      steps: [...comment, { id: 'sc_repost', type: 'soundcloud_repost' }],
      general: true,
      authorize: true,
      configuredComment: true,
      manualActions: true,
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      steps: [...comment, { id: 'sc_repost', type: 'soundcloud_repost' }],
      general: true,
      authorize: true,
      configuredComment: true,
      manualActions: true,
      soundcloudLogin: true,
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      steps: [{ id: 'instagram', type: 'instagram_follow' }],
      general: true,
      instagramOnly: true,
      r2: true,
    },
  ];
  const byId = new Map(cases.map((item) => [item.id, item]));
  const counts = new Map(
    cases.map((item) => [
      item.id,
      {
        finals: 0,
        status: 0,
        ack: 0,
        auth: 0,
        comments: 0,
        verifications: 0,
        connected: false,
        acted: false,
        graphReads: 0,
        reposts: 0,
        nativeRepostClicks: 0,
        sid: null,
      },
    ]),
  );
  const errors = [],
    unexpected = [];
  let mediaGets = 0;
  const page = await context.newPage();
  const children = new Set();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('popup', (child) => children.add(child));
  const reply = (route, value, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify(value),
    });
  const pageRoute = async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/_next/static/immutable/chunks/1d0l2-pz5xzsu.js')
      return route.fulfill({
        contentType: 'application/javascript',
        body: '// Authored native marker only.',
      });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    const item = byId.get(/^\/track\/([^/]+)$/.exec(url.pathname)?.[1]);
    if (item && route.request().isNavigationRequest())
      return route.fulfill({ contentType: 'text/html', body: html(item) });
    unexpected.push(`page ${route.request().method()} ${url.pathname}`);
    return route.abort();
  };
  const apiRoute = async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors, body: '' });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    if (url.pathname === '/api/soundcloud/connect') {
      const item = byId.get(url.searchParams.get('track_id'));
      assert.equal(item?.authorize, true);
      assert.equal(request.method(), 'GET');
      assert.equal(url.searchParams.get('session_id'), nativeSid);
      assert.equal(url.searchParams.get('disclose_droploud'), '0');
      counts.get(item.id).auth++;
      return route.fulfill({ contentType: 'text/html', body: callback(item.id) });
    }
    if (url.pathname === '/__authored_complete') {
      const item = byId.get(url.searchParams.get('track_id'));
      assert.equal(item?.authorize, true);
      counts.get(item.id).connected = true;
      return reply(route, { ok: true });
    }
    if (request.method() !== 'POST') {
      unexpected.push(`API ${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const body = JSON.parse(request.postData() ?? '{}');
    const matched = /^\/api\/gate\/([^/]+)\/(download|step)$/.exec(url.pathname);
    const item = byId.get(matched?.[1] ?? body.track_id);
    assert.ok(item, 'Only fixture IDs may be requested');
    const count = counts.get(item.id),
      headers = await request.allHeaders();
    assert.equal(headers.authorization, undefined);
    assert.equal(headers['x-csrf-token'], undefined);
    assert.match(body.session_id, /^[a-f0-9-]{36}$/);
    count.sid ??= body.session_id;
    assert.equal(body.session_id, count.sid);
    if (item.saved || item.general)
      assert.equal(body.session_id, nativeSid, 'Reuse source-owned existing native SID');
    if (url.pathname === '/api/soundcloud/gate-status') {
      assert.deepEqual(Object.keys(body).sort(), ['session_id', 'track_id']);
      count.status++;
      return reply(route, {
        connected: count.connected,
        steps: {},
        ...(item.configuredComment ? { repost_mode: 'manual' } : {}),
      });
    }
    if (url.pathname === '/api/soundcloud/verify-repost') {
      assert.equal(item.configuredComment, true);
      assert.equal(count.connected, true);
      assert.deepEqual(body, {
        track_id: item.id,
        session_id: nativeSid,
        fresh: true,
      });
      count.verifications++;
      return reply(route, { found: !item.manualActions || count.acted });
    }
    if (matched?.[2] === 'step') {
      if (body.step === 'instagram') {
        assert.equal(
          item.steps.some((step) => step.id === 'instagram' && step.type === 'instagram_follow'),
          true,
        );
        assert.deepEqual(body, { session_id: nativeSid, step: 'instagram' });
        count.ack++;
        return reply(route, { ok: true });
      }
      if (item.configuredComment) {
        assert.deepEqual(body, {
          session_id: nativeSid,
          step: 'sc_comment',
          value: 'Authored listener comment',
        });
        count.comments++;
        return reply(route, { ok: true });
      }
      assert.equal(item.id, cases[6].id);
      assert.deepEqual(Object.keys(body).sort(), ['session_id', 'step']);
      assert.equal(body.step, 'droploud_follow');
      count.ack++;
      return reply(route, { ok: true });
    }
    assert.equal(matched?.[2], 'download');
    assert.deepEqual(Object.keys(body), ['session_id']);
    count.finals++;
    if (
      item.steps.some((step) => step.id === 'instagram' && step.type === 'instagram_follow') &&
      count.ack === 0
    )
      return reply(route, { error: 'Instagram step not completed' }, 403);
    if (
      item.unfinished ||
      item.blocked ||
      (item.authorize && !count.connected) ||
      (item.configuredComment && count.verifications === 0) ||
      (item.manualActions && !count.acted)
    )
      return reply(route, { error: 'Gate not completed' }, 403);
    if (item.id === cases[6].id) assert.equal(count.ack, 1);
    return reply(route, {
      download_url: item.unsafe
        ? 'javascript:alert(1)'
        : item.external
          ? external
          : item.r2
            ? r2File
            : file,
      type: item.external ? 'external' : item.r2 ? 'r2' : 'native',
      ...(item.r2 ? { points_earned: 0, daily_cap_reached: false } : {}),
    });
  };
  const blockMedia = async (route) => {
    mediaGets++;
    await route.abort();
  };
  await context.route(`${origin}/**`, pageRoute);
  await context.route(`${api}/**`, apiRoute);
  await context.route('https://example.invalid/**', blockMedia);
  const manualSocial = async (route) => {
    const address = new URL(route.request().url());
    if (address.pathname === '/gatebreaker-fixture/__native_repost') {
      const item = byId.get(address.searchParams.get('track_id'));
      assert.equal(item?.manualActions, true);
      counts.get(item.id).nativeRepostClicks++;
      return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    }
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    const item = byId.get(id);
    assert.equal(item?.manualActions, true);
    const trackNumber = 1000 + cases.indexOf(item);
    const hydration = [
      { hydratable: 'apiClient', data: { id: 'a'.repeat(32), isExpiring: true } },
      {
        hydratable: 'sound',
        data: {
          id: trackNumber,
          urn: `soundcloud:tracks:${trackNumber}`,
          kind: 'track',
          permalink_url: `https://soundcloud.com/gatebreaker-fixture/${id}`,
        },
      },
    ];
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><h1>Authored SoundCloud action</h1><button id="repost">Native Repost</button><button id="finish-sc-login">Finish authored SoundCloud login</button><script>
        window.__sc_hydration=${JSON.stringify(hydration)};
        document.cookie=${JSON.stringify(item.soundcloudLogin ? 'oauth_token=; Max-Age=0; path=/' : 'oauth_token=authored-soundcloud-token; path=/; Secure')};
        document.querySelector('#finish-sc-login').onclick=()=>{document.cookie='oauth_token=authored-soundcloud-token; path=/; Secure';document.querySelector('#finish-sc-login').disabled=true;};
        document.querySelector('#repost').onclick=async()=>{await fetch('/gatebreaker-fixture/__native_repost?track_id=${id}');};</script>`,
    });
  };
  const graphRoute = async (route) => {
    const request = route.request();
    const headers = {
      'Access-Control-Allow-Origin': 'https://soundcloud.com',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,content-type',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
    assert.equal(request.method(), 'POST');
    assert.equal(new URL(request.url()).searchParams.get('client_id'), 'a'.repeat(32));
    assert.equal((await request.allHeaders()).authorization, 'OAuth authored-soundcloud-token');
    const body = JSON.parse(request.postData());
    const urn = body.variables.urn ?? body.variables.trackUrn;
    const item = cases[Number(String(urn).split(':').at(-1)) - 1000];
    assert.equal(item?.manualActions, true);
    const count = counts.get(item.id);
    let data;
    if (body.operationName === 'GatebreakerTrackState') {
      count.graphReads++;
      data = {
        allTracks: [
          {
            __typename: 'Track',
            urn,
            permalinkUrl: `https://soundcloud.com/gatebreaker-fixture/${item.id}`,
            engagement: { hasReposted: count.acted },
          },
        ],
      };
    } else {
      assert.equal(body.operationName, 'RepostTrack');
      assert.match(body.query, /mutation RepostTrack/);
      assert.doesNotMatch(body.query, /Unrepost|unrepost/);
      count.reposts++;
      count.acted = true;
      data = { repostTrack: { __typename: 'Repost', caption: null } };
    }
    return route.fulfill({
      contentType: 'application/json',
      headers,
      body: JSON.stringify({ data }),
    });
  };
  await context.route('https://soundcloud.com/gatebreaker-fixture/**', manualSocial);
  await context.route('https://graph.soundcloud.com/graphql?*', graphRoute);
  try {
    for (const item of cases) {
      await preparePreferences(
        item.configuredComment && !item.configureInPanel
          ? { soundcloudComment: 'Authored listener comment' }
          : {},
      );
      await page.goto(`${origin}/track/${item.id}`);
      const panel = page.locator('#gatebreaker-panel');
      await panel.waitFor();
      if (item === cases[0]) {
        await page.locator('.dtr-card-cta').click();
        await page.locator('[data-native-step]').click();
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.nativeClicks), 2);
        assert.equal(
          Object.values(counts.get(item.id))
            .filter((value) => typeof value === 'number')
            .reduce((sum, value) => sum + value, 0),
          0,
          'Native Droploud buttons do not start extension processing',
        );
        await page.reload();
        await panel.waitFor();
      }
      const button = panel.getByRole('button', { name: 'Download', exact: true });
      const initial = counts.get(item.id);
      assert.equal(
        initial.finals + initial.status + initial.ack + initial.auth,
        0,
        'Opening/inspecting does no processing',
      );
      assert.equal(
        await button.isDisabled(),
        false,
        'Initial Download checks existing native sessions before requiring login',
      );
      assert.equal(
        await panel.getByRole('button', { name: 'Connect SoundCloud', exact: true }).count(),
        0,
      );
      await button.click();
      if (item.configureInPanel) {
        const commentInput = panel.getByLabel('Reusable comment', { exact: true });
        await commentInput.waitFor();
        assert.match(await panel.locator('.comment-settings').textContent(), /Posted publicly/);
        await commentInput.fill('Authored listener comment');
        if (screenshots) await panel.screenshot({ path: `${screenshots}/comment-required.png` });
        await panel.getByRole('button', { name: 'Save and continue', exact: true }).click();
      }
      if (item.authorize) {
        const signIn = panel.getByRole('button', { name: 'Connect SoundCloud', exact: true });
        await signIn.waitFor();
        assert.equal(await button.isDisabled(), true);
        assert.equal(initial.finals, item.configureInPanel ? 2 : 1);
        assert.equal(initial.status, 1);
        assert.equal(initial.auth, 0);
        const opened = page.waitForEvent('popup');
        await signIn.click();
        const consent = await opened;
        const soundcloudOpened = item.soundcloudLogin ? context.waitForEvent('page') : null;
        await consent.getByRole('button', { name: 'Finish authored consent', exact: true }).click();
        if (soundcloudOpened) {
          const track = await soundcloudOpened;
          await track
            .getByRole('button', { name: 'Finish authored SoundCloud login', exact: true })
            .waitFor();
          assert.equal(counts.get(item.id).reposts, 0, 'No mutation before SoundCloud login');
          await track
            .getByRole('button', { name: 'Finish authored SoundCloud login', exact: true })
            .click();
        }
      }
      if (item.unfinished || item.blocked || item.unsafe) {
        await panel
          .getByRole('status')
          .filter({
            hasText: item.unsafe
              ? 'unsafe destination'
              : item.unfinished
                ? 'Save a SoundCloud comment'
                : 'required native steps',
          })
          .first()
          .waitFor();
        assert.equal(await panel.getByRole('link').count(), 0);
        assert.equal(
          await panel.getByRole('button', { name: 'Connect SoundCloud', exact: true }).count(),
          0,
        );
      } else {
        const ready = panel.getByRole('link', {
          name: 'Open destination',
          exact: true,
        });
        await ready.waitFor();
        assert.equal(
          await ready.getAttribute('href'),
          item.external ? external : item.r2 ? r2File : file,
        );
        if (item.r2)
          await panel
            .getByRole('status')
            .filter({ hasText: 'Download started.' })
            .first()
            .waitFor();
      }
      const count = counts.get(item.id);
      assert.equal(count.nativeRepostClicks, 0, 'SoundCloud UI repost controls are never clicked');
      assert.equal(count.reposts, item.manualActions ? 1 : 0);
      assert.equal(count.graphReads, item.manualActions ? 1 : 0);
      assert.equal(
        await panel
          .getByRole('button', { name: 'Complete SoundCloud actions', exact: true })
          .count(),
        0,
      );
      assert.equal(
        count.finals,
        item.configuredComment
          ? item.configureInPanel
            ? 4
            : 3
          : item.authorize || item.instagramOnly
            ? 2
            : 1,
      );
      assert.equal(
        count.ack,
        item.id === cases[6].id ||
          item.steps.some((step) => step.id === 'instagram' && step.type === 'instagram_follow')
          ? 1
          : 0,
      );
      assert.equal(count.auth, item.authorize ? 1 : 0);
      assert.equal(count.comments, item.configuredComment ? 1 : 0);
      assert.equal(count.verifications, item.manualActions ? 2 : item.configuredComment ? 1 : 0);
      if (item.saved || item.external)
        assert.equal(
          count.status,
          0,
          'Server-approved saved comment gate does not introduce login',
        );
      assert.equal(
        await page.evaluate(() => window.nativeClicks),
        0,
        'The provider never clicks native controls',
      );
      assert.equal(
        await page.evaluate(
          () =>
            JSON.stringify({
              local: Object.entries(localStorage),
              session: Object.entries(sessionStorage),
            }) === window.fixtureInitialStorage,
        ),
        true,
        'Native SID storage remains read-only',
      );
    }
    assert.equal(
      mediaGets,
      0,
      'The installed harness must intercept delivery before media/page GET',
    );
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log(
      `${browserName} Droploud authored direct-HTTP fixtures passed: saved SID/comment gate, Instagram acknowledgement, automatic signed r2 file delivery, native refusal recovery, external page, native consent, automatic HTTP repost and SoundCloud login resume, unsupported comment/email, optional skip ACK, unsafe destination, no native/Repost clicks, SID storage writes or media GETs.`,
    );
  } finally {
    await preparePreferences({});
    for (const child of children) if (!child.isClosed()) await child.close();
    await page.close();
    await context.unroute(`${origin}/**`, pageRoute);
    await context.unroute(`${api}/**`, apiRoute);
    await context.unroute('https://example.invalid/**', blockMedia);
    await context.unroute('https://soundcloud.com/gatebreaker-fixture/**', manualSocial);
    await context.unroute('https://graph.soundcloud.com/graphql?*', graphRoute);
  }
}
