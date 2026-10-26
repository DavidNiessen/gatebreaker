import assert from 'node:assert/strict';
import path from 'node:path';

// All website, mail, and OAuth responses below are local fixtures. No account,
// email delivery, follow/save, or third-party authorization is performed.
export async function testNativeActions({ context, browserName, screenshots, popup }) {
  const posts = [];
  const emails = [];
  const errors = [];
  let rejectEmail = false;
  let finalClicks = 0;
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const fixture = `<!doctype html><html><head><meta name="csrf-token" content="fixture-csrf"><title>Native fixture</title><style>body{max-width:520px;margin:32px auto;font:16px system-ui;background:#fafaf8}.hide,.move-left{display:none!important}</style></head><body>
    <h1>Native sign-in fixture</h1><a id="downloadProcess" href="#">Original download</a>
    <input type="hidden" id="current_download_file_listner" value="native01"><input type="hidden" id="nwSteps" value="email,sc,sp"><input type="hidden" id="wrndk" value="fixture-token"><input type="hidden" id="is_unlimited" value="1"><input type="hidden" id="is_skippable" value="0"><input type="hidden" name="additional_sp_user_id[]" value="fixture-artist">
    <div class="hype-download-gate-steps-wrapper hide" id="myCarousel">
      <div class="fangate-slider-content" id="email-step"><input id="email_address"><input id="email_name"><button id="email_to_downloads_next">Original email submit</button><span class="name_error_email hide"></span><div id="gatePreviewCaptcha" class="hide"></div></div>
      <div class="fangate-slider-content" id="spotify-step"><button id="login_to_sp">Original Spotify login</button></div>
      <div class="fangate-slider-content" id="soundcloud-step"><button id="login_to_sc">Original SoundCloud login</button><button id="skipper_sc" data-step="sc">Skip SoundCloud</button></div>
      <button id="gateDownloadButton">Original final download</button>
    </div><script>
      window.emailSubmissions=0;window.finalClicks=0;window.originalClicks=0;
      document.querySelector('#downloadProcess').onclick=(event)=>{event.preventDefault();window.originalClicks++;document.querySelector('#myCarousel').classList.remove('hide');};
      document.querySelector('#email_to_downloads_next').onclick=async()=>{
        window.emailSubmissions++;
        const response=await fetch('/verifyEmailAddress',{method:'POST',body:new URLSearchParams({email:document.querySelector('#email_address').value,name:document.querySelector('#email_name').value})});
        const result=await response.json();
        if(result.ok) document.querySelector('#email-step').classList.add('move-left');
        else {const error=document.querySelector('.name_error_email');error.textContent='Fixture email rejected. Try again.';error.classList.remove('hide');}
      };
      for(const [service,host] of [['spotify','accounts.spotify.com'],['soundcloud','secure.soundcloud.com']]) document.querySelector(service==='spotify'?'#login_to_sp':'#login_to_sc').onclick=()=>{
        window.open('https://'+host+'/authorize?gatebreaker-fixture='+service,'gatebreaker-'+service,'width=600,height=700');
      };
      window.addEventListener('storage',(event)=>{if(event.key==='hypeChildWindow'){document.querySelector('#'+event.newValue+'-step').classList.add('move-left');localStorage.removeItem('hypeChildWindow');}});
      document.querySelector('#gateDownloadButton').onclick=()=>window.finalClicks++;
    </script></body></html>`;

  await context.route('https://hypeddit.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/verifyEmailAddress') {
      emails.push(new URLSearchParams(route.request().postData() ?? ''));
      // Keep the native email request pending long enough to exercise duplicate prevention.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: !rejectEmail }),
      });
    } else if (url.pathname === '/fixture/native-callback') {
      const service = url.searchParams.get('service');
      assert.ok(['spotify', 'soundcloud'].includes(service));
      await route.fulfill({
        contentType: 'text/html',
        body: `<script>localStorage.setItem('hypeChildWindow',${JSON.stringify(service)});window.close();</script>`,
      });
    } else if (url.pathname === '/gate/download/ul') {
      const body = new URLSearchParams(route.request().postData() ?? '');
      posts.push(body);
      const native = body.has('email');
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          download_status: native,
          URL: native ? 'https://hypeddit.com/download/fixtureNative123' : '',
        }),
      });
    } else await route.fulfill({ contentType: 'text/html', body: fixture });
  });
  for (const host of ['accounts.spotify.com', 'secure.soundcloud.com']) {
    await context.route(`https://${host}/**`, async (route) => {
      const service = new URL(route.request().url()).searchParams.get('gatebreaker-fixture');
      assert.ok(['spotify', 'soundcloud'].includes(service));
      await route.fulfill({
        contentType: 'text/html',
        body: `<h1>Local ${service} authorization fixture</h1><button onclick="location.href='https://hypeddit.com/fixture/native-callback?service=${service}'">Authorize fixture</button>`,
      });
    });
  }
  await page.goto('https://hypeddit.com/fixture/native-actions');
  const panel = page.locator('#gatebreaker-panel');
  await panel.waitFor();
  assert.equal(emails.length, 0, 'Inspection must not submit email');
  assert.equal(posts.length, 0);
  await page.locator('#downloadProcess').click();
  try {
    await panel.getByText('Email step completed on Hypeddit.', { exact: true }).first().waitFor();
  } catch (error) {
    console.log('Native email diagnostic', {
      emails: emails.length,
      posts: posts.length,
      errors,
      page: await page.locator('body').innerText(),
      panel: await panel.innerText(),
      native: await page.locator('#email-step').getAttribute('class'),
    });
    await page.screenshot({ path: path.join(screenshots, 'native-debug.png') });
    throw error;
  }
  assert.equal(posts.length, 1, 'One anonymous attempt before native email submission');
  assert.equal(posts[0].has('email'), false);
  assert.equal(emails.length, 1, 'Required email submitted automatically once');
  assert.match(emails[0].get('email'), /^[a-f0-9]{30}@gmail\.com$/);
  assert.equal(emails[0].get('name'), 'Listener');
  assert.equal(await page.locator('#myCarousel').isVisible(), false);
  assert.equal(
    await page.evaluate(() => window.originalClicks),
    0,
    'Original Download is routed through Gatebreaker',
  );
  await page.locator('#myCarousel').evaluate((element) => element.classList.remove('hide'));
  assert.equal(
    await page.locator('#myCarousel').isVisible(),
    false,
    'Native forms stay hidden if the website reveals their wrapper',
  );
  assert.equal(await panel.getByRole('button', { name: 'Submit random email' }).isDisabled(), true);

  if (popup) {
    await popup.evaluate(async () => {
      const [gate] = await chrome.tabs.query({
        url: 'https://hypeddit.com/fixture/native-actions',
      });
      await chrome.tabs.update(gate.id, { active: true });
    });
    await popup.reload();
    await popup.getByRole('button', { name: 'Sign in with Spotify' }).waitFor();
    const opened = context.waitForEvent('page');
    await popup.getByRole('button', { name: 'Sign in with Spotify' }).click();
    const auth = await opened;
    await auth.getByRole('button', { name: 'Authorize fixture' }).waitFor();
    assert.equal(await auth.evaluate(() => !!window.opener), true, 'Native page opener preserved');
    await auth.getByRole('button', { name: 'Authorize fixture' }).click();
    await popup.getByText('Spotify step completed on Hypeddit.', { exact: true }).first().waitFor();
    await popup
      .locator('body')
      .screenshot({ path: path.join(screenshots, 'popup-native-progress.png') });
  } else {
    const opened = context.waitForEvent('page');
    await panel.getByRole('button', { name: 'Sign in with Spotify' }).click();
    const auth = await opened;
    await auth.getByRole('button', { name: 'Authorize fixture' }).click();
    await panel.getByText('Spotify step completed on Hypeddit.', { exact: true }).first().waitFor();
  }
  const opened = context.waitForEvent('page');
  await panel.getByRole('button', { name: 'Sign in with SoundCloud' }).click();
  const auth = await opened;
  await auth.getByRole('button', { name: 'Authorize fixture' }).waitFor();
  assert.equal(await auth.evaluate(() => !!window.opener), true);
  await auth.getByRole('button', { name: 'Authorize fixture' }).click();
  await panel
    .getByText('SoundCloud step completed on Hypeddit.', { exact: true })
    .first()
    .waitFor();
  await page.screenshot({ path: path.join(screenshots, 'panel-native-progress.png') });
  assert.equal(await page.locator('#myCarousel').isVisible(), false);
  await panel.getByRole('button', { name: 'Download', exact: true }).click();
  await panel.getByRole('link', { name: 'Open download' }).waitFor();
  const nativeBody = posts.at(-1);
  assert.equal(nativeBody.get('email'), emails[0].get('email'));
  assert.deepEqual(nativeBody.getAll('skip_gate_steps[]'), ['sc']);
  assert.deepEqual(nativeBody.getAll('additional_sp_user_id[]'), ['fixture-artist']);
  assert.equal(nativeBody.get('lifetime_fan_spotify'), '0');
  assert.equal(await page.evaluate(() => window.finalClicks), finalClicks);
  assert.equal(
    await panel.getByRole('link').getAttribute('href'),
    'https://hypeddit.com/download/fixtureNative123',
  );
  if (popup)
    assert.deepEqual(Object.keys(await popup.evaluate(() => chrome.storage.local.get())).sort(), [
      'enabled',
    ]);

  rejectEmail = true;
  await page.goto('https://hypeddit.com/fixture/email-rejected');
  await panel.getByRole('button', { name: 'Submit random email' }).click();
  await panel.getByText('Fixture email rejected. Try again.', { exact: true }).first().waitFor();
  assert.equal(await panel.getByRole('button', { name: 'Submit random email' }).isEnabled(), true);
  assert.equal(await page.locator('#myCarousel').isVisible(), false);
  await page.screenshot({ path: path.join(screenshots, 'panel-native-error.png') });
  assert.deepEqual(errors, []);
  console.log(
    `${browserName} native integration passed: automatic email, native Spotify/SoundCloud popup callbacks, progress and rejection, hidden forms, session download, no token persistence.`,
  );
  await page.close();
}
