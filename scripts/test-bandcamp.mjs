import assert from 'node:assert/strict';
import path from 'node:path';

const artist = 'https://authored-bandcamp-fixture.bandcamp.com';
const signature = 'a'.repeat(32);
const cases = [
  { id: '1231', mode: 'ready', success: true },
  { id: '1232', mode: 'paid' },
  { id: '1233', mode: 'preview' },
  { id: '1234', mode: 'unsafe' },
  { id: '1235', mode: 'nonce' },
  { id: '1236', mode: 'expired' },
  { id: '1237', mode: 'track', type: 'track', success: true },
  { id: '1238', mode: 'receipt', success: true },
];
const itemType = (item) => item.type ?? 'album';
const grant = (item) =>
  `https://bandcamp.com/download?fsig=${signature}&id=${item.id}&ts=12345.0&type=${itemType(item)}`;
const released = (item) =>
  `https://p4.bcbits.com/download/${itemType(item)}/authored-bandcamp-${item.id}/original.${item.type === 'track' ? 'wav' : 'zip'}?signature=fixture`;
const escapeAttribute = (value) =>
  JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
function receipt(item) {
  const type = itemType(item),
    encoding = type === 'track' ? 'wav' : 'flac';
  return `<!doctype html><html><head><title>Authored Bandcamp grant</title></head><body><h1>Authored authorized receipt</h1><button id="native-download">Native download</button><div class="download-panel" data-blob="${escapeAttribute(
    {
      download_items: [
        {
          item_id: Number(item.id),
          type,
          title: 'Authored Bandcamp original',
          is_pure_free: true,
          paid_for: false,
          downloads:
            item.mode === 'preview'
              ? {}
              : {
                  [encoding]: {
                    url: `https://popplers5.bandcamp.com/download/${type}?enc=${encoding}&fsig=${signature}&id=${item.id}&ts=12345.0`,
                  },
                },
          trackinfo: [{ file: { 'mp3-128': 'https://t4.bcbits.com/stream/authored-preview' } }],
        },
      ],
    },
  )}"></div><script>window.nativeClicks=0;document.querySelector('#native-download').onclick=()=>window.nativeClicks++;</script></body></html>`;
}
function product(item) {
  const type = itemType(item);
  return `<!doctype html><html><head><title>Authored Bandcamp release</title></head><body><div id="name-section"><h2>Authored Bandcamp original</h2></div><button id="native-download">Native download</button><script data-tralbum="${escapeAttribute(
    {
      id: Number(item.id),
      item_type: type,
      url: `${artist}/${type}/fixture-${item.mode}`,
      current: {
        id: Number(item.id),
        type,
        title: 'Authored Bandcamp original',
        download_pref: item.mode === 'paid' ? 2 : 1,
        minimum_price: item.mode === 'paid' ? 0 : 9,
      },
      freeDownloadPage: grant(item),
      trackinfo: [{ file: { 'mp3-128': 'https://t4.bcbits.com/stream/authored-preview' } }],
    },
  )}"></script><script>window.nativeClicks=0;document.querySelector('#native-download').onclick=()=>window.nativeClicks++;</script></body></html>`;
}

/** Inject ONLY into an isolated installed-extension fixture background. This
 * instruments fetch at its HTTP boundary because Firefox's extension requests
 * are not exposed to Playwright routing. Real media is never fetched. */
export const bandcampFixtureTransportScript = `(() => {
  if(globalThis.gatebreakerBandcampFixture) return true;
  const originalFetch=globalThis.fetch;
  const cases=${JSON.stringify(cases.map((item) => ({ ...item, receipt: receipt(item), released: released(item) })))};
  const byId=new Map(cases.map(item=>[item.id,item]));
  const counts={grants:0,stats:0,renewals:0,previewGets:0,unexpected:0,items:{}};
  globalThis.gatebreakerBandcampFixture=counts;
  globalThis.fetch=async (input,init={})=>{
    const url=new URL(String(input));
    if(url.hostname!=='bandcamp.com' && url.hostname!=='popplers5.bandcamp.com') return originalFetch(input,init);
    const item=byId.get(url.searchParams.get('id'));
    if(!item || init.credentials!=='omit' || init.redirect!=='error' || (init.method && init.method!=='GET')) {counts.unexpected++;throw Error('Unexpected authored Bandcamp metadata request');}
    const state=counts.items[item.id]??=( {grants:0,stats:0} );
    if(url.hostname==='bandcamp.com' && url.pathname==='/download') {
      counts.grants++;state.grants++;
      if(item.mode==='paid') {counts.unexpected++;throw Error('Paid page must not acquire grants');}
      return new Response(item.receipt,{headers:{'content-type':'text/html'}});
    }
    if(url.hostname!=='popplers5.bandcamp.com' || url.pathname!=='/statdownload/'+(item.type??'album') || url.searchParams.get('.vrs')!=='1' || !/^\\d+$/.test(url.searchParams.get('.rand')??'')) {counts.unexpected++;throw Error('Unexpected authored Bandcamp stat endpoint');}
    counts.stats++;state.stats++;
    if(item.mode==='preview') {counts.unexpected++;throw Error('Preview-only grant must not be statted');}
    const reply={url:url.href.replace(/^https:\\/\\//,''),result:'ok',download_url:item.released};
    if(item.mode==='nonce') reply.url=reply.url.replace(/([?&]\\.rand=)\\d+/,'$1999999999999999');
    if(item.mode==='unsafe') reply.download_url='https://p4.bcbits.com.evil.invalid/download/album/original.zip';
    if((item.mode==='ready' && state.stats===1)||item.mode==='expired') {
      counts.renewals++;
      reply.result='err';reply.errortype='ExpiredFreeDownloadError';
      const renewed=new URL(url);renewed.pathname=renewed.pathname.replace('/statdownload/','/download/');renewed.searchParams.delete('.rand');renewed.searchParams.delete('.vrs');renewed.searchParams.set('fsig','b'.repeat(32));reply.retry_url=renewed.href;
      delete reply.download_url;
    }
    return new Response(JSON.stringify(reply),{headers:{'content-type':'application/json'}});
  };
  return true;
})()`;

/** Authored product, grant and original-status fixtures. Inject the fixed
 * transport fixture and deliveryFixtureScript before calling this helper. */
export async function testBandcamp({ context, browserName, screenshots, popup }) {
  let unexpected = 0,
    previews = 0,
    media = 0;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const pageRoute = async (route) => {
    const url = new URL(route.request().url());
    const item = cases.find((item) => url.pathname === `/${itemType(item)}/fixture-${item.mode}`);
    if (item && route.request().isNavigationRequest())
      return route.fulfill({ contentType: 'text/html', body: product(item) });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    unexpected++;
    return route.abort();
  };
  const grantRoute = async (route) => {
    const url = new URL(route.request().url());
    const item = cases.find((item) => item.id === url.searchParams.get('id'));
    if (item && route.request().isNavigationRequest() && url.pathname === '/download')
      return route.fulfill({ contentType: 'text/html', body: receipt(item) });
    unexpected++;
    return route.abort();
  };
  const mediaRoute = async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/stream/')) previews++;
    else media++;
    return route.abort();
  };
  await context.route(`${artist}/**`, pageRoute);
  await context.route('https://bandcamp.com/**', grantRoute);
  await context.route('https://*.bcbits.com/**', mediaRoute);
  try {
    for (const item of cases) {
      await page.goto(
        item.mode === 'receipt' ? grant(item) : `${artist}/${itemType(item)}/fixture-${item.mode}`,
      );
      const panel = page.locator('#gatebreaker-panel');
      await panel.waitFor();
      await page.locator('#native-download').click();
      assert.equal(
        await page.evaluate(() => window.nativeClicks),
        1,
        'Native Download must retain its manual handler',
      );
      assert.equal(await panel.getByRole('link').count(), 0);
      await panel.getByRole('button', { name: 'Download', exact: true }).click();
      if (item.success) {
        const link = panel.getByRole('link').filter({ hasText: /Open/ }).first();
        await link.waitFor();
        assert.equal(await link.getAttribute('href'), released(item));
        if (item.mode === 'ready' && popup) {
          await popup.evaluate(async (url) => {
            const api = globalThis.browser ?? globalThis.chrome;
            const tabs = await api.tabs.query({});
            const tab = tabs.find((tab) => tab.url === url);
            if (!tab?.id) throw Error('Authored Bandcamp tab missing');
            await api.tabs.update(tab.id, { active: true });
          }, page.url());
          await popup.reload();
          await popup.getByRole('link').filter({ hasText: /Open/ }).first().waitFor();
          assert.equal(await popup.locator('#download').getAttribute('href'), released(item));
        }
      } else {
        await panel.getByRole('button', { name: 'Try again', exact: true }).waitFor();
        assert.match(await panel.getByRole('status').textContent(), /Bandcamp/);
        assert.equal(await panel.getByRole('link').count(), 0);
      }
      assert.equal(await page.evaluate(() => window.nativeClicks), 1);
      if (screenshots && (item.mode === 'ready' || item.mode === 'paid'))
        await page.screenshot({
          animations: 'disabled',
          path: path.join(screenshots, `bandcamp-${item.mode}.png`),
        });
    }
    assert.equal(unexpected, 0);
    assert.equal(previews, 0);
    assert.equal(
      media,
      0,
      'Original delivery must be intercepted by the installed-extension fixture',
    );
    assert.deepEqual(errors, []);
    console.log(
      `${browserName}: Bandcamp artist-issued free originals, one native expiry renewal, paid/preview/unsafe/status refusals, untouched native controls`,
    );
  } finally {
    await context.unroute(`${artist}/**`, pageRoute);
    await context.unroute('https://bandcamp.com/**', grantRoute);
    await context.unroute('https://*.bcbits.com/**', mediaRoute);
    await page.close();
  }
}
