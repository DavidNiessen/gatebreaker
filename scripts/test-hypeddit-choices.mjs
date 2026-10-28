import assert from 'node:assert/strict';

// Authored endpoints only. Final files are intercepted by the parent test harness.
export async function testHypedditChoices({ context, browserName }) {
  const cases = [
    {
      id: 'choice-donation',
      choices: 'dw,email,sp|ap|dn,ig|sc',
      skips: '<a id="skipper_dn" data-step="donation"></a>',
      expected: ['donation', 'sp', 'ap', 'sc'],
      flag: '0',
    },
    {
      id: 'choice-tiktok',
      choices: 'dw,email,sc,ig,sp|tk',
      skips: '',
      expected: ['sp'],
      flag: '0',
    },
    {
      id: 'optional-spotify',
      choices: 'dw,email,sp',
      skips: '<a id="skipper" data-step="sp"></a>',
      expected: ['sp'],
      flag: '1',
    },
    {
      id: 'next-control',
      choices: 'dw,email,sc',
      skips: '<a id="skipper_sc_next" data-step="sc"></a>',
      expected: ['sc'],
      flag: '0',
      spotify: false,
    },
  ];
  let active;
  const posts = [];
  let popups = 0;
  const onPage = (page) => {
    if (new URL(page.url()).origin === 'https://accounts.spotify.com') popups++;
  };
  context.on('page', onPage);
  const handler = async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/fixture/choice-' + active.id) {
      const auth =
        'https://accounts.spotify.com/authorize?client_id=authored&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored';
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta name="csrf-token" content="authored-choices-csrf-000000000000"><h1>Authored choices</h1><a id="downloadProcess">Native Download</a><input id="fan_gate_id" value="54321"><input id="current_download_file_listner" value="${active.id}"><input id="nwSteps" value="email,sc,ig,sp,ap,dn,tk"><input id="steps_select" value="${active.choices}"><input id="is_skippable" value="0"><input id="wrndk" value="authored"><input id="is_unlimited" value="1"><section class="fangate-slider-content"><input id="email_name"><input id="email_address"><button id="email_to_downloads_next">Native email</button>${active.spotify === false ? '' : `<a id="login_to_sp" onclick="PopupCenterDual('${auth}','sp_popup',500,500)">Native Spotify</a>`}${active.skips}</section><script>window.nativeClicks=0;document.querySelectorAll('a,button').forEach(e=>e.addEventListener('click',()=>window.nativeClicks++));</script>`,
      });
    } else if (url.pathname === '/verifyEmailAddress') {
      assert.equal(
        new URLSearchParams(route.request().postData()).get('validateEmailAddress'),
        'gatebreakeros@proton.me',
      );
      await route.fulfill({ contentType: 'application/json', body: '{"status":"T"}' });
    } else if (url.pathname === '/gate/download/ul') {
      const body = new URLSearchParams(route.request().postData());
      posts.push({ id: active.id, body });
      assert.deepEqual(body.getAll('skip_gate_steps[]'), active.expected);
      assert.equal(body.get('is_skippable'), active.flag);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          download_status: true,
          URL: 'https://hypeddit.com/download/authoredChoices',
        }),
      });
    } else await route.abort();
  };
  await context.route('https://hypeddit.com/**', handler);
  try {
    for (active of cases) {
      const page = await context.newPage();
      try {
        await page.goto('https://hypeddit.com/fixture/choice-' + active.id);
        const panel = page.locator('#gatebreaker-panel');
        await panel.getByRole('button', { name: 'Download', exact: true }).click();
        await panel.getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
        assert.equal(posts.filter((post) => post.id === active.id).length, 1);
        assert.equal(
          await panel.getByRole('button', { name: 'Sign in with Spotify', exact: true }).count(),
          0,
        );
        assert.equal(await page.evaluate(() => window.nativeClicks), 0);
        assert.equal(await page.locator('#email_address').inputValue(), '');
        assert.equal(await page.locator('#is_skippable').inputValue(), '0');
      } finally {
        await page.close();
      }
    }
    assert.equal(popups, 0);
    console.log(
      browserName +
        ' Hypeddit choices passed: native OR siblings, optional donation spelling, explicit Spotify flag, revealed next controls, no native clicks or auth popups.',
    );
  } finally {
    context.off('page', onPage);
    await context.unroute('https://hypeddit.com/**', handler);
  }
}
