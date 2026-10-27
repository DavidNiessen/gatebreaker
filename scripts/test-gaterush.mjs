import assert from 'node:assert/strict';

const origin = 'https://gaterush.me';
const csrf = 'authored-gaterush-csrf-000000000000';
const session = 'gatebreaker_gaterush_fixture=authored';
function html(item) {
  const config = {
    slug: item.slug,
    authUrl: `${origin}/auth/soundcloud?slug=${item.slug}`,
    artistName: 'Authored fixture artist',
    trackTitle: 'Authored original WAV',
    hasDownloadFile: true,
    rewardIsLink: false,
    rewardLabel: 'Download',
    steps: item.steps.map((id) => ({
      id,
      name: id,
      allowSkip: false,
      data: {
        slug: item.slug,
        ...(id === 'soundcloud'
          ? {
              authUrl: `${origin}/auth/soundcloud?slug=${item.slug}`,
              enableScComment: item.comment === true,
            }
          : {}),
        ...(id === 'email' ? { collectName: true } : {}),
      },
    })),
  };
  return `<!doctype html><html><head><title>Authored GateRush fixture</title><meta name="csrf-token" content="${csrf}"></head><body><h1 class="track">Authored original WAV</h1><div id="progress"></div><div id="stepStage"><button data-native>Original native step</button></div><button class="download" id="download" disabled>Original native download</button><script>window.nativeClicks=0;document.querySelector('[data-native]').onclick=()=>window.nativeClicks++;document.querySelector('#download').onclick=()=>window.nativeClicks++;</script><script>window.__GATE__ = {${Object.entries(
    config,
  )
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(',')}};</script><script src="/js/gate-liquid.js"></script></body></html>`;
}
function callback(slug, includeSlug = false) {
  const data = { type: 'sc-auth', ...(includeSlug ? { slug } : {}) };
  return `<!doctype html><h1>Authored GateRush consent callback</h1><p>No real account is used.</p><button id="finish">Complete authored consent</button><script>document.querySelector('#finish').onclick=()=>window.opener.postMessage(${JSON.stringify(data)},${JSON.stringify(origin)});</script>`;
}

/** Run only in the installed-extension harness AFTER fixture delivery interception.
 * All final GETs are aborted; this helper is authored, never a production media run. */
export async function testGateRush({ context, browserName }) {
  const cases = [
    { slug: 'Gt0001', steps: ['email', 'instagram', 'spotify'] },
    { slug: 'Gt0002', steps: [], blocked: true },
    { slug: 'Gt0003', steps: ['soundcloud', 'instagram'] },
    { slug: 'Gt0004', steps: ['email', 'soundcloud', 'instagram'], existing: true, comment: true },
    { slug: 'Gt0005', steps: ['email', 'soundcloud', 'instagram'], comment: true },
    { slug: 'Gt0006', steps: ['soundcloud'] },
  ];
  const bySlug = new Map(cases.map((item) => [item.slug, item]));
  const counts = new Map(cases.map((item) => [item.slug, { posts: [], heads: 0, auth: 0 }]));
  const errors = [];
  const unexpected = [];
  let mediaGets = 0;
  const page = await context.newPage();
  const children = new Set();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('popup', (child) => children.add(child));
  const handler = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/js/gate-liquid.js')
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    if (url.pathname === '/auth/soundcloud') {
      const slug = url.searchParams.get('slug');
      assert.ok(['Gt0003', 'Gt0006'].includes(slug));
      assert.equal(request.method(), 'GET');
      counts.get(slug).auth++;
      return route.fulfill({ contentType: 'text/html', body: callback(slug, slug === 'Gt0006') });
    }
    const direct = /^\/(save-email|gate-step|download)\/(Gt000[123456])$/.exec(url.pathname);
    const item = bySlug.get(direct?.[2] ?? url.pathname.slice(1));
    if (!item) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const count = counts.get(item.slug);
    if (!direct)
      return route.fulfill({
        contentType: 'text/html',
        headers: { 'Set-Cookie': `${session}; Path=/; Secure; SameSite=Lax` },
        body: html(item),
      });
    if (direct[1] === 'download') {
      if (request.method() !== 'HEAD') {
        mediaGets++;
        return route.abort();
      }
      count.heads++;
      return route.fulfill(
        item.blocked ||
          (!item.existing &&
            (item.comment ||
              count.posts.length !== item.steps.filter((id) => id !== 'soundcloud').length ||
              (item.steps.includes('soundcloud') && count.auth === 0)))
          ? { status: 403, contentType: 'text/html', body: '' }
          : {
              contentType: 'audio/wav',
              headers: { 'Content-Disposition': 'attachment; filename="Authored-original.wav"' },
              body: '',
            },
      );
    }
    assert.equal(request.method(), 'POST');
    const headers = await request.allHeaders();
    assert.equal(headers['x-csrf-token'], csrf);
    assert.ok(headers['cookie']?.includes(session));
    assert.equal(headers['authorization'], undefined);
    const body = new URLSearchParams(request.postData() ?? '');
    assert.equal(body.get('_csrf'), csrf);
    if (direct[1] === 'save-email') {
      assert.equal(body.get('email'), 'test@icloud.com');
      assert.equal(body.get('name'), body.get('email').split('@')[0]);
      count.posts.push('email');
    } else {
      assert.ok(['instagram', 'spotify'].includes(body.get('stepId')));
      count.posts.push(body.get('stepId'));
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  };
  await context.route(`${origin}/**`, handler);
  try {
    for (const item of cases) {
      await page.goto(`${origin}/${item.slug}`);
      const panel = page.locator('#gatebreaker-panel');
      await panel.waitFor();
      const button = panel.getByRole('button', { name: 'Download', exact: true });
      assert.deepEqual(
        counts.get(item.slug),
        { posts: [], heads: 0, auth: 0 },
        'Page opening does no processing',
      );
      assert.equal(
        await button.isDisabled(),
        false,
        'Unknown cookie sessions may first request a read-only HEAD',
      );
      assert.equal(
        await panel.getByRole('button', { name: 'Sign in with SoundCloud', exact: true }).count(),
        0,
      );
      await button.click();
      if (item.steps.includes('soundcloud') && !item.comment && !item.existing) {
        await panel.getByRole('button', { name: 'Sign in with SoundCloud', exact: true }).waitFor();
        assert.equal(await button.isDisabled(), true);
        assert.deepEqual(
          counts.get(item.slug),
          {
            posts: item.steps.filter((id) => id !== 'soundcloud'),
            heads: item.steps.length > 1 ? 2 : 1,
            auth: 0,
          },
          'Login is discovered after actual HTTP denial and supported acknowledgements',
        );
        const opened = page.waitForEvent('popup');
        await panel.getByRole('button', { name: 'Sign in with SoundCloud', exact: true }).click();
        const consent = await opened;
        await consent.getByRole('button', { name: 'Complete authored consent' }).click();
      }
      if (item.blocked || (item.comment && !item.existing)) {
        await panel
          .getByRole('status')
          .filter({
            hasText: item.comment ? 'user-written SoundCloud comment' : 'requires its gate steps',
          })
          .first()
          .waitFor();
        assert.equal(await panel.getByRole('link').count(), 0);
      } else {
        await panel.getByRole('link', { name: 'Open download', exact: true }).waitFor();
        assert.equal(
          await panel
            .getByRole('link', { name: 'Open download', exact: true })
            .getAttribute('href'),
          `${origin}/download/${item.slug}`,
        );
      }
      assert.equal(
        counts.get(item.slug).heads,
        item.existing || item.blocked || item.comment
          ? 1
          : item.steps.includes('soundcloud')
            ? item.steps.length > 1
              ? 3
              : 2
            : 2,
      );
      assert.deepEqual(
        counts.get(item.slug).posts,
        item.existing || item.comment ? [] : item.steps.filter((id) => id !== 'soundcloud'),
      );
      assert.equal(
        await page.evaluate(() => window.nativeClicks),
        0,
        'Processing never clicks native controls',
      );
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
        'No OAuth/receipt storage',
      );
    }
    assert.equal(mediaGets, 0, 'Fixture deliveries must be intercepted before final media GET');
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log(
      `${browserName} GateRush authored direct-HTTP fixtures passed: email/name and ordinary ACK POSTs, explicit OAuth callback, final HEAD, 403 enforcement, no native clicks/media GETs.`,
    );
  } finally {
    for (const child of children) if (!child.isClosed()) await child.close();
    await page.close();
    await context.unroute(`${origin}/**`, handler);
    await context.clearCookies({ name: 'gatebreaker_gaterush_fixture', domain: 'gaterush.me' });
  }
}
