import assert from 'node:assert/strict';
import path from 'node:path';

// Authored local fixtures only. The Google-origin frame is intercepted in full;
// no Google challenge, account, email delivery or production media is contacted.
export async function testCaptcha({ context, browserName, screenshots, popup }) {
  const emails = [],
    posts = [],
    accepted = new Set();
  const csrf = 'authored-captcha-csrf-000000000000';
  const cases = new Map([
    ['over', { id: 'captchaOver01', fan: '71001', reason: 'over' }],
    ['threshold', { id: 'captchaThreshold02', fan: '71002', reason: 'threshold' }],
    ['visible', { id: 'captchaVisible03', fan: '71003', reason: 'visible' }],
    ['states', { id: 'captchaStates04', fan: '71004', reason: 'over' }],
    ['rejected', { id: 'captchaRejected05', fan: '71005', reason: 'over' }],
    ['popup', { id: 'captchaPopup06', fan: '71006', reason: 'over' }],
  ]);
  let current,
    serverMode = 'accept',
    releaseEmail;
  function fixture(item) {
    return `<!doctype html><html><head><meta name="csrf-token" content="${csrf}"><title>Authored CAPTCHA gate</title><style>body{max-width:520px;margin:32px auto;font:16px system-ui;background:#fafaf8}.hide{display:none!important}</style></head><body>
      <h1>CAPTCHA fixture ${item.id}</h1><a id="downloadProcess" href="#">Original download</a>
      <input type="hidden" id="current_download_file_listner" value="${item.id}"><input type="hidden" id="fan_gate_id" value="${item.fan}"><input type="hidden" id="nwSteps" value="email"><input type="hidden" id="wrndk" value="authored-captcha-session-${item.id}"><input type="hidden" id="is_unlimited" value="1">
      <section class="fangate-slider-content"><input id="email_address"><input id="email_name"><button id="email_to_downloads_next">Original email submit</button><div id="gatePreviewCaptcha" class="${item.reason === 'visible' ? '' : 'hide'}"></div></section>
      <div id="captchalog" data-max-attempts="6" data-attempts="${item.reason === 'over' ? 'over' : ''}" data-sitekey="authored-sitekey-000000000000"></div>
      <script>
      document.cookie='teb3456767win='+encodeURIComponent(JSON.stringify({'${item.fan}':${item.reason === 'threshold' ? 6 : 0}}))+';path=/';
      window.nativeClicks=0;window.bridgeMessages=[];
      document.querySelector('#downloadProcess').onclick=e=>{e.preventDefault();window.nativeClicks++};
      document.querySelector('#email_to_downloads_next').onclick=()=>window.nativeClicks++;
      window.authoredCaptcha={renders:0,resets:0,response:'',widget:27};
      let options,anchor;
      window.grecaptcha={
        render(element,config){
          if(config.sitekey!=='authored-sitekey-000000000000')throw Error('Unexpected fixture sitekey');
          options=config;window.authoredCaptcha.renders++;
          anchor=document.createElement('iframe');anchor.title='Authored Google challenge';
          anchor.src='https://www.google.com/recaptcha/api2/anchor?authored=${item.id}';
          anchor.style='width:304px;height:126px;border:0';element.append(anchor);return 27;
        },
        getResponse(widget){if(widget!==27)throw Error('Wrong widget ID');return window.authoredCaptcha.response},
        reset(widget){if(widget!==27)throw Error('Wrong widget ID');window.authoredCaptcha.resets++;window.authoredCaptcha.response=''}
      };
      addEventListener('message',event=>{
        window.bridgeMessages.push(JSON.stringify(event.data));
        if(!anchor||event.source!==anchor.contentWindow||event.origin!=='https://www.google.com'||event.data?.authored!=='${item.id}')return;
        if(event.data.state==='complete'){window.authoredCaptcha.response='authored-widget-response-${item.id}';options.callback()}
        if(event.data.state==='expired'){window.authoredCaptcha.response='';options['expired-callback']()}
        if(event.data.state==='error'){window.authoredCaptcha.response='';options['error-callback']()}
      });
      </script></body></html>`;
  }
  const gateRoute = async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const item = cases.get(url.pathname.replace('/fixture/captcha-', ''));
    if (item) return route.fulfill({ contentType: 'text/html', body: fixture(item) });
    if (url.pathname === '/verifyEmailAddress') {
      assert.equal(request.method(), 'POST');
      const headers = await request.allHeaders();
      assert.equal(headers['x-csrf-token'], csrf);
      assert.equal(headers['x-requested-with'], 'XMLHttpRequest');
      const body = new URLSearchParams(request.postData() ?? '');
      assert.deepEqual(
        [...body.keys()].sort(),
        ['adcode', 'email_name', 'fan_gate_id', 'hypesource', 'validateEmailAddress'].sort(),
      );
      assert.equal(body.get('fan_gate_id'), current.fan);
      assert.equal(body.get('validateEmailAddress'), 'gatebreakeros@proton.me');
      assert.equal(body.get('email_name'), 'Listener');
      emails.push(body);
      await new Promise((resolve) => {
        releaseEmail = resolve;
      });
      if (serverMode === 'accept') accepted.add(current.id);
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: serverMode === 'accept' ? 'T' : 'F' }),
      });
    }
    if (url.pathname === '/gate/download/ul') {
      assert.equal(request.method(), 'POST');
      const body = new URLSearchParams(request.postData() ?? '');
      posts.push(body);
      assert.equal(body.get('file'), current.id);
      assert(accepted.has(current.id), 'Final request must follow HTTP email acceptance');
      assert.equal(body.get('email'), 'gatebreakeros@proton.me');
      assert(
        !request.postData().includes('authored-widget-response'),
        'Opaque CAPTCHA response stays inside its frame',
      );
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          download_status: true,
          URL: `https://hypeddit.com/download/${current.id}`,
        }),
      });
    }
    return route.abort();
  };
  const googleRoute = async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.pathname, '/recaptcha/api2/anchor');
    assert.equal(route.request().method(), 'GET');
    const id = url.searchParams.get('authored');
    assert([...cases.values()].some((item) => item.id === id));
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><style>body{margin:0;font:14px system-ui}button{display:block;margin:3px;padding:5px}</style><button data-state="complete">Complete authored challenge</button><button data-state="expired">Expire authored challenge</button><button data-state="error">Fail authored challenge</button><script>document.querySelectorAll('button').forEach(button=>button.onclick=()=>parent.postMessage({authored:${JSON.stringify(id)},state:button.dataset.state},'https://hypeddit.com'))</script>`,
    });
  };
  const mediaRoute = async (route) => {
    assert.equal(route.request().method(), 'HEAD', 'Never GET a media object');
    return route.fulfill({ status: 403, body: '' });
  };
  await context.route('https://hypeddit.com/**', gateRoute);
  await context.route('https://www.google.com/**', googleRoute);
  await context.route('https://hypeddit-gates-prod.s3.amazonaws.com/**', mediaRoute);
  async function waitFor(predicate, page) {
    const deadline = Date.now() + 10000;
    while (!predicate() && Date.now() < deadline) await page.waitForTimeout(30);
    assert(predicate(), 'Authored HTTP fixture reached expected state');
  }
  try {
    const names = [
      'over',
      'threshold',
      'visible',
      'states',
      'rejected',
      ...(popup ? ['popup'] : []),
    ];
    for (const name of names) {
      current = cases.get(name);
      serverMode = name === 'rejected' ? 'reject' : 'accept';
      const beforeEmail = emails.length,
        beforePost = posts.length;
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        const url = `https://hypeddit.com/fixture/captcha-${name}`;
        await page.goto(url);
        const panel = page.locator('#gatebreaker-panel');
        await panel.waitFor();
        assert.equal(emails.length, beforeEmail);
        assert.equal(posts.length, beforePost);
        let parent = page,
          surface = panel;
        if (name === 'popup') {
          await popup.evaluate(async (gateUrl) => {
            const [tab] = await chrome.tabs.query({ url: gateUrl });
            await chrome.tabs.update(tab.id, { active: true });
          }, url);
          await popup.reload();
          await popup.locator('#resolve').click();
          parent = popup;
          surface = popup.locator('#captcha-view');
        } else await panel.getByRole('button', { name: 'Download', exact: true }).click();
        const inline = panel.locator('iframe[title="Hypeddit CAPTCHA"]');
        await inline.waitFor();
        assert.equal(
          await panel.getByRole('dialog').count(),
          0,
          'Challenge stays inline in the Gatebreaker box',
        );
        const frameElement = surface.locator('iframe[title="Hypeddit CAPTCHA"]');
        await frameElement.waitFor();
        const frameUrl = new URL(await frameElement.getAttribute('src'));
        assert.equal(frameUrl.origin + frameUrl.pathname, url);
        assert.match(frameUrl.hash, /^#gatebreaker-captcha=[a-f0-9-]{36}$/);
        if (name === 'popup') {
          assert.equal(await popup.locator('#gate-view').isVisible(), false);
          assert.equal(await surface.isVisible(), true);
        }
        const challenge = frameElement.contentFrame();
        const google = challenge.frameLocator('iframe[title="Authored Google challenge"]');
        await google
          .getByRole('button', { name: 'Complete authored challenge', exact: true })
          .waitFor();
        if (name === 'over' || name === 'popup')
          await parent.screenshot({
            path: path.join(screenshots, 'captcha-' + name + '-challenge.png'),
            animations: 'disabled',
          });
        assert.equal(emails.length, beforeEmail, 'Widget rendering never submits email');
        assert.equal(posts.length, beforePost);
        await frameElement.evaluate((frame, gate) => {
          window.dispatchEvent(
            new MessageEvent('message', {
              source: frame.contentWindow,
              origin: 'https://hypeddit.com',
              data: {
                type: 'gatebreaker:captcha-frame',
                state: 'solved',
                nonce: new URL(frame.src).hash.slice('#gatebreaker-captcha='.length),
                gate,
              },
            }),
          );
        }, current.id);
        await parent.waitForTimeout(150);
        assert.equal(
          emails.length,
          beforeEmail,
          'Synthetic parent event cannot complete the challenge',
        );
        if (name === 'states') {
          await google
            .getByRole('button', { name: 'Expire authored challenge', exact: true })
            .click();
          await surface.getByRole('status').filter({ hasText: 'expired' }).waitFor();
          assert.equal(emails.length, beforeEmail);
          await google
            .getByRole('button', { name: 'Fail authored challenge', exact: true })
            .click();
          await challenge.getByRole('button', { name: 'Retry CAPTCHA', exact: true }).click();
          await surface.getByRole('status').filter({ hasText: 'Solve the CAPTCHA' }).waitFor();
          assert.equal(emails.length, beforeEmail);
          await surface.getByRole('button', { name: 'Cancel CAPTCHA', exact: true }).click();
          await frameElement.waitFor({ state: 'detached' });
          assert.equal(posts.length, beforePost);
          assert.equal(emails.length, beforeEmail);
        } else {
          await google
            .getByRole('button', { name: 'Complete authored challenge', exact: true })
            .click();
          await waitFor(() => emails.length === beforeEmail + 1, page);
          assert.equal(
            posts.length,
            beforePost,
            'Widget success alone cannot release the download',
          );
          releaseEmail();
          releaseEmail = undefined;
          await frameElement.waitFor({ state: 'detached' });
          if (name === 'rejected') {
            await panel.getByRole('alert').filter({ hasText: 'Hypeddit rejected' }).waitFor();
            assert.equal(posts.length, beforePost, 'HTTP F never resumes the download');
          } else {
            await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
            await panel
              .getByRole('status')
              .filter({ hasText: /^Download started\.$/ })
              .waitFor();
            assert.equal(
              posts.length,
              beforePost + 1,
              'HTTP T resumes and delivers once automatically',
            );
          }
        }
        assert.equal(await page.evaluate(() => window.nativeClicks), 0);
        assert.equal(await page.locator('#email_address').inputValue(), '');
        assert.equal(
          await page.evaluate(() =>
            window.bridgeMessages.some((value) => value.includes('authored-widget-response')),
          ),
          false,
        );
        assert.deepEqual(errors, []);
        if (name === 'over' || name === 'popup') {
          await parent.screenshot({
            path: path.join(screenshots, `captcha-${name}-complete.png`),
            animations: 'disabled',
          });
        }
      } catch (error) {
        console.error('Authored CAPTCHA case failed:', name, {
          emails: emails.length - beforeEmail,
          posts: posts.length - beforePost,
        });
        console.error(
          'Panel states:',
          await page.locator('#gatebreaker-panel').getByRole('status').allTextContents(),
        );
        await page
          .screenshot({
            path: path.join(screenshots, 'captcha-' + name + '-failure.png'),
            animations: 'disabled',
          })
          .catch(() => {});
        throw error;
      } finally {
        releaseEmail?.();
        releaseEmail = undefined;
        await page.close();
      }
    }
    console.log(
      `${browserName} CAPTCHA integration passed: installed frame scripts, ${popup ? 'inline and popup placement' : 'inline placement (Firefox popup runtime unsupported by harness)'}, three requirement signals, trusted manual completion, expiry/error/retry/cancel, exact HTTP acceptance, no native clicks or token export.`,
    );
  } finally {
    await context.unroute('https://hypeddit.com/**', gateRoute);
    await context.unroute('https://www.google.com/**', googleRoute);
    await context.unroute('https://hypeddit-gates-prod.s3.amazonaws.com/**', mediaRoute);
  }
}
