import assert from 'node:assert/strict';

const origin = 'https://pumpyoursound.com';
const secret = 'authored-pys-main-world-only';
const ids = ['910001', '910002', '910003', '910004'];
function gatePath(id) {
  return `/f/pys/authored-pys-${id}/${id}`;
}
function fixture(item, released = false) {
  const steps = [...(item.account ? ['soundcloud'] : []), ...(item.social ? ['instagram'] : [])];
  return `<!doctype html><html><head><title>Authored PumpYourSound fixture</title><style>body{max-width:620px;margin:30px auto;font:16px system-ui}</style></head><body><h1 class="fangateTitle">Authored PYS ${item.id}</h1>
    <script src="/js/require.js" data-main="/js/main.min.js?csv=fixture"></script>
    <form id="frm-freeDownloadForm" method="post" action="${gatePath(item.id)}"><input type="hidden" name="_do" value="freeDownloadForm-submit"><input type="submit" class="nativePys" name="send" value="Download">
    ${steps.map((kind) => `<li id="${kind}_follow"><div class="fangateStep fangateStep--${kind} ${item.done.has(kind) ? 'done' : ''}"></div><a class="nativePys" data-href="/auth/instagram-follow/?fangateId=${item.id}">Native social step</a></li>`).join('')}
    ${item.account ? `<div class="nativePys socBtn__soundcloud sn-connect-with-soundcloud" data-href="/auth/soundcloud-events/?fangateId=${item.id}&amp;accessToken=access_token">Native SC</div>` : ''}
    <span data-stream="https://files.example/preview.mp3"></span></form>
    <div id="soundcloud-api" data-client-id="QxSZqSh6CRcE0Bh21F7lJ6Ans3ucLCzq" data-redirect-url="http://pumpyoursound.com/?do=soundConnectAuth"></div>
    ${item.blocked ? '<ul id="flashMessages"><li data-type="error">Authored refusal</li></ul>' : ''}
    ${released ? `<div class="fangateDownload" data-redirect-link="https://files.example/pys-${item.id}.wav?signature=authored%2Fvalue"></div>` : ''}
    <script>window.nativeClicks=0;window.sdkConnects=0;document.querySelectorAll('.nativePys').forEach(element=>element.onclick=event=>{event.preventDefault();window.nativeClicks++});
    let connection,popup;
    window.SC={options:{client_id:'QxSZqSh6CRcE0Bh21F7lJ6Ans3ucLCzq',redirect_uri:'http://pumpyoursound.com/?do=soundConnectAuth'},connect(options){window.sdkConnects++;connection=options.connected;popup=options.window;popup.location.href='/authored-pys-consent?gate=${item.id}'}};
    addEventListener('message',event=>{if(event.origin==='${origin}'&&event.source===popup&&event.data?.authored==='pys-approved-${item.id}')connection()});
    window.$={nette:{ajax(options){let done=()=>{},failed=()=>{};const controller=new AbortController();const result={done(callback){done=callback;return result},fail(callback){failed=callback;return result},abort(){controller.abort()}};fetch(options.url,{credentials:'same-origin',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('refused');const value=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();if(value?.doneKind)document.querySelector('.fangateStep--'+value.doneKind)?.classList.add('done');done(value)}).catch(()=>failed());return result}}};</script></body></html>`;
}

/** Authored/intercepted gates only. Root installs fixture delivery interception first. */
export async function testPumpyoursound({ context, browserName }) {
  const cases = new Map(
    ids.map((id, index) => [
      id,
      {
        id,
        blocked: index === 1,
        social: index >= 2,
        account: index === 3,
        done: new Set(),
        posts: 0,
        connects: 0,
      },
    ]),
  );
  const errors = [];
  let mediaGets = 0;
  const children = new Set();
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('popup', (child) => children.add(child));
  const handler = async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === '/js/require.js' || url.pathname === '/js/main.min.js')
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    const id =
      /\/(\d+)$/.exec(url.pathname)?.[1] ??
      url.searchParams.get('gate') ??
      url.searchParams.get('fangateId');
    const item = cases.get(id);
    if (url.pathname === '/authored-pys-consent' && item) {
      item.connects++;
      return route.fulfill({
        contentType: 'text/html',
        body: `<h1>Authored provider consent</h1><p>No real account is used.</p><button onclick="location.href='/authored-pys-callback?gate=${id}'">Approve authored PYS</button>`,
      });
    }
    if (url.pathname === '/authored-pys-callback' && item)
      return route.fulfill({
        contentType: 'text/html',
        headers: { 'Set-Cookie': 'pys_auth=authored; Secure; HttpOnly; SameSite=Lax; Path=/' },
        body: `<script>window.opener.postMessage({authored:'pys-approved-${id}'},'${origin}');window.close()</script>`,
      });
    if (url.pathname === '/' && url.searchParams.get('do') === 'mySoundcloudAccessToken') {
      assert.match((await request.allHeaders()).cookie ?? '', /pys_auth=authored/);
      return route.fulfill({ contentType: 'text/plain', body: secret });
    }
    if (url.pathname === '/auth/soundcloud-events/' && item) {
      assert.equal(url.searchParams.get('accessToken'), secret);
      item.done.add('soundcloud');
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ doneKind: 'soundcloud' }),
      });
    }
    if (url.pathname === '/auth/instagram-follow/' && item) {
      item.done.add('instagram');
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    if (item && url.pathname === gatePath(id)) {
      if (request.method() === 'POST') {
        item.posts++;
        const body = new URLSearchParams(request.postData() ?? '');
        assert.deepEqual([...body.entries()].sort(), [
          ['_do', 'freeDownloadForm-submit'],
          ['send', 'Download'],
        ]);
        assert.equal(
          item.account && !item.done.has('soundcloud'),
          false,
          'No final native form request before approved account action',
        );
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ redirect: gatePath(id) + '?_fid=authored-result' }),
        });
      }
      return route.fulfill({
        contentType: 'text/html',
        body: fixture(item, url.searchParams.has('_fid') && !item.blocked),
      });
    }
    return route.abort();
  };
  const media = async (route) => {
    mediaGets++;
    await route.abort();
  };
  await context.route(`${origin}/**`, handler);
  await context.route('https://files.example/**', media);
  try {
    for (const item of cases.values()) {
      await page.goto(origin + gatePath(item.id));
      const panel = page.locator('#gatebreaker-panel');
      await panel.getByRole('button', { name: 'Download', exact: true }).waitFor();
      assert.equal(item.posts, 0);
      await panel.getByRole('button', { name: 'Download', exact: true }).click();
      if (item.account) {
        const signIn = panel.getByRole('button', { name: 'Sign in with SoundCloud', exact: true });
        await signIn.waitFor();
        assert.equal(item.posts, 0);
        const opened = context.waitForEvent('page');
        await signIn.click();
        const auth = await opened;
        await auth.getByRole('button', { name: 'Approve authored PYS' }).click();
      }
      if (item.blocked) {
        await panel.getByText(/PumpYourSound refused the download/).waitFor();
        assert.equal(await panel.locator('a[href*="files.example"]').count(), 0);
      } else await panel.locator('a[href*="files.example/pys-"]').first().waitFor();
      assert.equal(item.posts, 1);
      assert.equal(await page.evaluate(() => window.nativeClicks), 0);
      assert.equal((await panel.textContent()).includes(secret), false);
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      if (item.account) {
        assert.equal(item.connects, 1);
        assert.equal(await page.evaluate(() => window.sdkConnects), 1);
      }
    }
    assert.equal(
      mediaGets,
      0,
      'Released file delivery must be intercepted by the root fixture harness',
    );
    assert.deepEqual(errors, []);
    console.log(
      `${browserName} PumpYourSound authored HTTP/flash/social/native-SDK fixtures passed without native clicks or media GETs.`,
    );
  } finally {
    for (const child of children) if (!child.isClosed()) await child.close();
    await page.close();
    await context.unroute(`${origin}/**`, handler);
    await context.unroute('https://files.example/**', media);
    await context.clearCookies({ name: 'pys_auth', domain: 'pumpyoursound.com' });
  }
}

export { fixture as pumpFixture, gatePath as pumpGatePath };
