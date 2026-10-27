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
      <div class="fangate-slider-content" id="soundcloud-step"><button id="login_to_sc">Original SoundCloud login</button></div>
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
      const native = body.has('email') && !rejectEmail;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          download_status: native,
          URL: native ? 'https://hypeddit.com/download/fixtureNative123' : '',
        }),
      });
    } else
      await route.fulfill({
        contentType: 'text/html',
        body:
          url.pathname === '/fixture/native-actions'
            ? fixture
            : fixture.replace(
                '<input id="email_address"',
                '<button id="skipper_sp" data-step="sp">Skip Spotify</button><button id="skipper_sc" data-step="sc">Skip SoundCloud</button>' +
                  (url.pathname === '/fixture/email-optional'
                    ? '<button id="skipper_email" data-step="email">Skip email</button>'
                    : '') +
                  '<input id="email_address"',
              ),
      });
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
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshots, 'panel-required-mobile.png'),
  });
  await page.setViewportSize(originalViewport);
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshots, 'panel-required-desktop.png'),
  });
  assert.equal(
    await panel
      .getByRole('button', { name: 'Download', exact: true })
      .evaluate((button) => getComputedStyle(button).cursor),
    'default',
  );
  assert.equal(emails.length, 0, 'Inspection must not submit email');
  assert.equal(posts.length, 0);
  assert.equal(
    await panel.getByRole('button', { name: 'Download', exact: true }).isDisabled(),
    true,
  );
  await page.locator('#downloadProcess').click();
  assert.equal(emails.length, 0, 'Required login blocks even the original Download control');
  assert.equal(posts.length, 0);

  if (popup) {
    await popup.evaluate(async () => {
      const [gate] = await chrome.tabs.query({
        url: 'https://hypeddit.com/fixture/native-actions',
      });
      await chrome.tabs.update(gate.id, { active: true });
    });
    await popup.reload();
    await popup.getByRole('button', { name: 'Sign in with Spotify' }).waitFor();
    assert.equal(await popup.getByRole('button', { name: /Submit.*email/i }).count(), 0);
    await popup.locator('body').screenshot({
      animations: 'disabled',
      path: path.join(screenshots, 'popup-required-signins.png'),
    });
    const opened = context.waitForEvent('page');
    await popup.getByRole('button', { name: 'Sign in with Spotify' }).click();
    const auth = await opened;
    await auth.getByRole('button', { name: 'Authorize fixture' }).waitFor();
    assert.equal(await auth.evaluate(() => !!window.opener), true, 'Native page opener preserved');
    await auth.getByRole('button', { name: 'Authorize fixture' }).click();
    await popup
      .getByRole('button', { name: 'Connected to Spotify', exact: true })
      .first()
      .waitFor();
    await popup.locator('body').screenshot({
      animations: 'disabled',
      path: path.join(screenshots, 'popup-native-progress.png'),
    });
  } else {
    const opened = context.waitForEvent('page');
    await panel.getByRole('button', { name: 'Sign in with Spotify' }).click();
    const auth = await opened;
    await auth.getByRole('button', { name: 'Authorize fixture' }).click();
    await panel
      .getByRole('button', { name: 'Connected to Spotify', exact: true })
      .first()
      .waitFor();
  }
  assert.equal(
    await panel.getByRole('button', { name: 'Download', exact: true }).isDisabled(),
    true,
    'All required logins must complete',
  );
  assert.equal(emails.length, 0);
  const opened = context.waitForEvent('page');
  await panel.getByRole('button', { name: 'Sign in with SoundCloud' }).click();
  const auth = await opened;
  await auth.getByRole('button', { name: 'Authorize fixture' }).waitFor();
  assert.equal(await auth.evaluate(() => !!window.opener), true);
  await auth.getByRole('button', { name: 'Authorize fixture' }).click();
  await panel
    .getByRole('button', { name: 'Connected to SoundCloud', exact: true })
    .first()
    .waitFor();
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshots, 'panel-native-progress.png'),
  });
  assert.equal(await page.locator('#myCarousel').isVisible(), false);
  assert.equal(
    await panel.getByRole('button', { name: 'Download', exact: true }).isDisabled(),
    false,
  );
  await page.locator('#downloadProcess').click();
  try {
    await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
  } catch (error) {
    console.log('Native email diagnostic', {
      emails: emails.length,
      posts: posts.length,
      errors,
      page: await page.locator('body').innerText(),
      panel: await panel.innerText(),
      native: await page.locator('#email-step').getAttribute('class'),
    });
    await page.screenshot({
      animations: 'disabled',
      path: path.join(screenshots, 'native-debug.png'),
    });
    throw error;
  }
  await page.waitForFunction(() => {
    const root = document.querySelector('#gatebreaker-panel')?.shadowRoot;
    return (
      root?.querySelector('section')?.getAttribute('aria-busy') === 'false' &&
      root.querySelector('section > p')?.textContent === 'Download started.'
    );
  });
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(screenshots, 'panel-success.png'),
  });
  assert.equal(posts.length, 1, 'One website-session request after native email completion');
  assert.equal(posts[0].has('email'), true);
  assert.equal(emails.length, 1, 'Required email submitted automatically once');
  assert.match(emails[0].get('email'), /^[a-z]+@icloud\.com$/);
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
  assert.equal(await panel.getByRole('button', { name: /Submit.*email/i }).count(), 0);

  await panel.getByRole('link', { name: 'Open download' }).waitFor();
  assert.doesNotMatch(await panel.innerText(), /step completed on Hypeddit|@icloud\.com/);
  const nativeBody = posts.at(-1);
  assert.equal(nativeBody.get('email'), emails[0].get('email'));
  assert.deepEqual(nativeBody.getAll('skip_gate_steps[]'), []);
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
  const beforeRejected = emails.length;
  assert.equal(
    await panel.getByRole('button', { name: /Sign in with/ }).count(),
    0,
    'Optional login controls are hidden',
  );
  await panel.getByRole('button', { name: 'Download', exact: true }).click();
  await panel.getByText('Fixture email rejected. Try again.', { exact: true }).first().waitFor();
  assert.equal(await panel.getByRole('button', { name: /Submit.*email/i }).count(), 0);
  assert.equal(
    await panel.getByText('Fixture email rejected. Try again.', { exact: true }).count(),
    1,
  );
  assert.equal(emails.length, beforeRejected + 1);
  assert.equal(await panel.getByRole('alert').count(), 1);
  assert.doesNotMatch(await panel.innerText(), /@icloud\.com|step completed on Hypeddit/);
  const rejectedEmail = emails.at(-1).get('email');
  const retryResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/verifyEmailAddress',
  );
  await panel.getByRole('button', { name: 'Try again', exact: true }).click();
  await retryResponse;
  await panel.getByText('Fixture email rejected. Try again.', { exact: true }).first().waitFor();
  assert.equal(emails.length, beforeRejected + 2);
  assert.notEqual(emails.at(-1).get('email'), rejectedEmail);
  assert.equal(await page.locator('#myCarousel').isVisible(), false);
  await page.waitForFunction(() => {
    const button = document
      .querySelector('#gatebreaker-panel')
      ?.shadowRoot?.querySelector('section > button');
    return button?.textContent === 'Try again' && !button.disabled;
  });
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshots, 'panel-native-error.png'),
  });
  const errorViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: 'disabled',
    path: path.join(screenshots, 'panel-native-error-mobile.png'),
  });
  await page.setViewportSize(errorViewport);
  if (popup) {
    await popup.evaluate(async () => {
      const [gate] = await chrome.tabs.query({
        url: 'https://hypeddit.com/fixture/email-rejected',
      });
      await chrome.tabs.update(gate.id, { active: true });
    });
    await popup.reload();
    await popup.getByText('Fixture email rejected. Try again.', { exact: true }).waitFor();
    assert.equal(await popup.getByRole('button', { name: /Submit.*email/i }).count(), 0);
    assert.equal(
      await popup.getByText('Fixture email rejected. Try again.', { exact: true }).count(),
      1,
    );
    await popup.locator('body').screenshot({
      animations: 'disabled',
      path: path.join(screenshots, 'popup-native-error.png'),
    });
  }
  rejectEmail = false;
  await page.goto('https://hypeddit.com/fixture/email-optional');
  const beforeOptional = emails.length;
  await panel.getByRole('button', { name: 'Download', exact: true }).click();
  await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
  assert.equal(emails.length, beforeOptional + 1, 'Optional email is also submitted automatically');
  assert.match(emails.at(-1).get('email'), /^[a-z]+@icloud\.com$/);
  assert.equal(await panel.getByRole('button', { name: /Submit.*email/i }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    `${browserName} native integration passed: automatic email, native Spotify/SoundCloud popup callbacks, progress and rejection, hidden forms, session download, no token persistence.`,
  );
  await page.close();
}
