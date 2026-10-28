import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availablePort, installFirefoxAddon } from './firefox-debugger.mjs';
import { deliveryFixtureScript, setupChromeDeliveries } from './fixture-delivery.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const key = 'hypedditSpotifyReuse';
const mirrorScript = `(()=>{const api=globalThis.browser??chrome;globalThis.reuseFixtureReceipt=null;api.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.hypedditSpotifyReuse)globalThis.reuseFixtureReceipt=changes.hypedditSpotifyReuse.newValue??null});return true})()`;

/** Fresh, wholly authored browser profile: no credentials, real consent or media. */
export async function testSpotifyReuse({ browserName }) {
  const profile = await mkdtemp(path.join(tmpdir(), 'gatebreaker-reuse-'));
  const port = browserName === 'firefox' ? await availablePort() : null;
  const extensionPath = path.join(root, 'dist', browserName);
  const context =
    browserName === 'chrome'
      ? await chromium.launchPersistentContext(profile, {
          channel: 'chromium',
          headless: true,
          ...(process.env.GATEBREAKER_BROWSER
            ? { executablePath: process.env.GATEBREAKER_BROWSER }
            : {}),
          ignoreDefaultArgs: ['--disable-extensions', '--disable-popup-blocking'],
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        })
      : await firefox.launchPersistentContext(profile, {
          headless: true,
          args: ['--start-debugger-server', String(port)],
          firefoxUserPrefs: {
            'devtools.debugger.remote-enabled': true,
            'devtools.debugger.prompt-connection': false,
            'devtools.chrome.enabled': true,
            'xpinstall.signatures.required': false,
          },
        });
  let debug;
  const accepted = new Set(),
    authorized = new Set(),
    posts = [],
    auths = new Map();
  const modes = new Map([
    ['first', 'hold'],
    ['second', 'silent'],
    ['parallelA', 'hold'],
    ['parallelB', 'hold'],
    ['cancelled', 'hold'],
  ]);
  const gateIds = new Map([...modes.keys()].map((name, index) => [name, 'reuse' + index]));
  const names = new Map([...gateIds].map(([name, id]) => [id, name]));
  async function worker() {
    return (
      context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ??
      (await context.waitForEvent('serviceworker'))
    );
  }
  async function evaluate(expression) {
    return browserName === 'chrome'
      ? (await worker()).evaluate(expression)
      : debug.evaluateJSON(expression);
  }
  async function receipt() {
    return browserName === 'chrome'
      ? (await worker()).evaluate(
          async () =>
            (await chrome.storage.local.get('hypedditSpotifyReuse')).hypedditSpotifyReuse ?? null,
        )
      : debug.evaluateJSON('globalThis.reuseFixtureReceipt');
  }
  async function clearReceipt() {
    await evaluate(
      '(()=>{const api=globalThis.browser??chrome;void api.storage.local.remove("hypedditSpotifyReuse");return true})()',
    );
    for (let n = 0; n < 60; n++) {
      if ((await receipt()) === null) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error('Fixture preference clear timed out');
  }
  const pageFor = async (name) => {
    const page = await context.newPage();
    await page.goto('https://hypeddit.com/fixture/reuse/' + name);
    await page.locator('#gatebreaker-panel').waitFor();
    return page;
  };
  const panel = (page) => page.locator('#gatebreaker-panel');
  const count = (name) => posts.filter((id) => id === gateIds.get(name)).length;
  const authFor = async (name) => {
    for (let n = 0; n < 120; n++) {
      const page =
        auths.get(name) ??
        context.pages().find((page) => {
          try {
            const url = new URL(page.url());
            return (
              url.origin === 'https://accounts.spotify.com' &&
              url.searchParams.get('state') === gateIds.get(name)
            );
          } catch {
            return false;
          }
        });
      if (page) {
        auths.set(name, page);
        return page;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error('Fixture auth window unavailable: ' + name);
  };
  const completed = async (page) => {
    await panel(page).getByRole('link', { name: 'Open download', exact: true }).first().waitFor();
  };
  try {
    if (browserName === 'firefox')
      debug = await installFirefoxAddon(
        port,
        extensionPath,
        deliveryFixtureScript + ';' + mirrorScript,
      );
    else {
      await setupChromeDeliveries(await worker());
      await (await worker()).evaluate(mirrorScript);
    }
    await context.route('https://accounts.spotify.com/**', async (route) => {
      const url = new URL(route.request().url()),
        name = names.get(url.searchParams.get('state'));
      assert(name);
      assert(accepted.has(gateIds.get(name)), 'Email must be accepted before authorization');
      let authPage;
      try {
        authPage = route.request().frame().page();
      } catch {
        /* Firefox can route before exposing the navigation frame. */
      }
      auths.set(name, authPage ?? null);
      const callback = 'https://hypeddit.com/spotify_callback?state=' + gateIds.get(name);
      if (modes.get(name) === 'silent')
        await route.fulfill({
          contentType: 'text/html',
          body: '<script>location.href=' + JSON.stringify(callback) + '</script>',
        });
      else
        await route.fulfill({
          contentType: 'text/html',
          headers: { 'Cross-Origin-Opener-Policy': 'same-origin' },
          body:
            '<h1>Authored sign-in or consent</h1><button data-target="' +
            callback +
            '" onclick="location.href=this.dataset.target">Finish fixture sign-in</button>',
        });
    });
    await context.route('https://hypeddit.com/**', async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.pathname.startsWith('/fixture/reuse/')) {
        const name = url.pathname.split('/').at(-1),
          id = gateIds.get(name);
        assert(id);
        const address =
          'https://accounts.spotify.com/authorize?client_id=authored-reuse&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=' +
          id;
        await route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><meta name="csrf-token" content="authored-reuse-csrf-000000000000"><h1>Reuse ${name}</h1><a id="downloadProcess">Native Download</a><input id="fan_gate_id" value="${10000 + [...gateIds.values()].indexOf(id)}"><input id="current_download_file_listner" value="${id}"><input id="wrndk" value="authored-${id}"><input id="nwSteps" value="email,sp"><input id="is_unlimited" value="1"><section class="fangate-slider-content"><input id="email_address"><input id="email_name"><button id="email_to_downloads_next">Native email</button><a id="login_to_sp" onclick="PopupCenterDual('${address}','sp_popup',500,500)">Native Spotify</a></section>`,
        });
      } else if (url.pathname === '/verifyEmailAddress') {
        const body = new URLSearchParams(request.postData()),
          index = Number(body.get('fan_gate_id')) - 10000,
          id = [...gateIds.values()][index];
        assert.equal(body.get('validateEmailAddress'), 'gatebreakeros@proton.me');
        await new Promise((resolve) => setTimeout(resolve, 100));
        accepted.add(id);
        await route.fulfill({ contentType: 'application/json', body: '{"status":"T"}' });
      } else if (url.pathname === '/spotify_callback') {
        const id = url.searchParams.get('state');
        assert(names.has(id));
        authorized.add(id);
        await route.fulfill({
          contentType: 'text/html',
          headers: {
            'Set-Cookie': 'reuse_fixture=accepted; Secure; HttpOnly; SameSite=Lax; Path=/',
          },
          body: '<h1>Authentication successful</h1><script>localStorage.setItem("hypeChildWindow","login_to_sp");window.close()</script>',
        });
      } else if (url.pathname === '/gate/download/ul') {
        const body = new URLSearchParams(request.postData()),
          id = body.get('file');
        posts.push(id);
        assert(
          authorized.has(id),
          'No gate may POST before its own callback: ' +
            id +
            ' authorized=' +
            [...authorized].join(','),
        );
        assert((await request.allHeaders()).cookie?.includes('reuse_fixture=accepted'));
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            download_status: true,
            URL: 'https://hypeddit.com/download/authoredReuse',
          }),
        });
      } else await route.abort();
    });
    const first = await pageFor('first');
    await first.waitForTimeout(250);
    assert.equal(auths.size, 0);
    assert.equal(posts.length, 0);
    assert.equal(accepted.size, 0);
    await panel(first).getByRole('button', { name: 'Download', exact: true }).click();
    const firstSignIn = panel(first).getByRole('button', {
      name: 'Sign in with Spotify',
      exact: true,
    });
    await firstSignIn.waitFor();
    assert.equal(auths.size, 0);
    assert.equal(await firstSignIn.isEnabled(), true);
    await firstSignIn.click();
    const firstAuth = await authFor('first');
    await firstAuth.getByRole('button', { name: 'Finish fixture sign-in' }).click();
    await completed(first);
    for (let n = 0; n < 60 && !(await receipt()); n++) await first.waitForTimeout(50);
    const saved = await receipt();
    assert.deepEqual(Object.keys(saved).sort(), ['confirmedAt', 'version']);
    assert.equal(saved.version, 1);
    assert.equal(count('first'), 1);
    const second = await pageFor('second');
    const before = auths.size;
    await second.waitForTimeout(250);
    assert.equal(auths.size, before);
    await panel(second).getByRole('button', { name: 'Download', exact: true }).click();
    await completed(second);
    assert(auths.has('second'), 'A later Download reuses Spotify without another sign-in click');
    assert.equal(count('second'), 1);
    const a = await pageFor('parallelA');
    await panel(a).getByRole('button', { name: 'Download', exact: true }).click();
    const authA = await authFor('parallelA');
    await clearReceipt();
    const b = await pageFor('parallelB');
    await panel(b).getByRole('button', { name: 'Download', exact: true }).click();
    await panel(b).getByRole('button', { name: 'Sign in with Spotify', exact: true }).click();
    const authB = await authFor('parallelB');
    await authA.getByRole('button', { name: 'Finish fixture sign-in' }).click();
    await completed(a);
    await b.waitForTimeout(2500);
    assert.equal(count('parallelB'), 0, 'Automatic A global storage cannot advance still-manual B');
    assert.equal(authB.isClosed(), false);
    await authB.getByRole('button', { name: 'Finish fixture sign-in' }).click();
    await completed(b);
    assert.equal(count('parallelA'), 1);
    assert.equal(count('parallelB'), 1);
    const cancelled = await pageFor('cancelled');
    await panel(cancelled).getByRole('button', { name: 'Download', exact: true }).click();
    const cancelAuth = await authFor('cancelled');
    const prior = await receipt();
    if (browserName === 'chrome') {
      const cdp = await context.newCDPSession(cancelled);
      const targets = await cdp.send('Target.getTargets');
      const background = targets.targetInfos.find(
        (target) =>
          target.type === 'service_worker' &&
          target.url ===
            context
              .serviceWorkers()
              .find((w) => w.url().startsWith('chrome-extension://'))
              ?.url(),
      );
      assert(background);
      await cdp.send('Target.closeTarget', { targetId: background.targetId });
      await cdp.detach();
      await cancelled.waitForTimeout(2500);
      await (await worker()).evaluate(deliveryFixtureScript);
      await (await worker()).evaluate(mirrorScript);
    }
    await cancelAuth.close();
    const retry = panel(cancelled).getByRole('button', {
      name: 'Sign in with Spotify',
      exact: true,
    });
    await retry.waitFor();
    for (let n = 0; n < 120 && !(await retry.isEnabled()); n++) await cancelled.waitForTimeout(50);
    assert.equal(await retry.isEnabled(), true);
    assert.equal(count('cancelled'), 0);
    assert.deepEqual(await receipt(), prior);
    await cancelled.waitForTimeout(2200);
    assert.equal(count('cancelled'), 0);
    console.log(
      browserName +
        ' Spotify reuse passed: first manual grant, later Download-only silent reuse, delayed email, actual session cookie, manual/automatic concurrent callback isolation, close/retry without POST, nonsecret preference' +
        (browserName === 'chrome' ? ', real worker stop/recovery.' : '.'),
    );
  } finally {
    debug?.close();
    await context.close();
    const relative = path.relative(tmpdir(), profile);
    if (
      !relative ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !path.basename(profile).startsWith('gatebreaker-reuse-')
    )
      throw Error('Unsafe fixture cleanup');
    await rm(profile, { recursive: true, force: true });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await testSpotifyReuse({ browserName: process.argv[2] ?? 'chrome' });
