import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { createBrowserResolver } = await import(
  pathToFileURL(path.join(root, 'packages/cli/dist/browser.js')).href
);
const hostFile = path.join(root, 'work/cli-host-test.js');
await mkdir(path.dirname(hostFile), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/cli/run.ts'],
  outfile: hostFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
});
const { run } = await import(pathToFileURL(hostFile).href);
const profile = await mkdtemp(path.join(tmpdir(), 'gatebreaker-cli-browser-'));
const extensionPath = path.join(root, 'packages/cli/dist/browser-extension');
const target =
  'https://hypeddit-gates-prod.s3.amazonaws.com/authoredCli_main?signature=authored%2Fvalue';
const boost = 'https://boost.ink/cli-fixture';
const gateUrl = 'https://hypeddit.com/fixture/cli-auth';
const authUrl =
  'https://accounts.spotify.com/authorize?client_id=authored-cli&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored-cli';
const fixture = `<!doctype html><meta name="csrf-token" content="authored-cli-csrf-000000000000"><title>CLI fixture</title><body><h1>CLI sign-in fixture</h1><a id="downloadProcess" href="#">Original download</a>
<input type="hidden" id="current_download_file_listner" value="authoredCli"><input type="hidden" id="fan_gate_id" value="54321"><input type="hidden" id="nwSteps" value="sp"><input type="hidden" id="wrndk" value="authored-cli-session"><input type="hidden" id="is_unlimited" value="1">
<section class="fangate-slider-content"><a id="login_to_sp" onclick="PopupCenterDual('${authUrl}','sp_popup',500,500)">Original sign-in</a></section>
<script>var jsonGateData={"uid":"authoredCli","externID":"${'a'.repeat(64)}"};window.nativeClicks=0;window.PopupCenterDual=()=>window.nativeClicks++;document.querySelector('#downloadProcess').onclick=e=>{e.preventDefault();window.nativeClicks++};</script>`;
const captchaUrl = 'https://hypeddit.com/fixture/cli-captcha';
const captchaFixture = `<!doctype html><meta name="csrf-token" content="authored-cli-captcha-csrf-000000000000"><body><h1>CLI CAPTCHA fixture</h1><a id="downloadProcess" href="#">Original download</a>
<input type="hidden" id="current_download_file_listner" value="authoredCliCaptcha"><input type="hidden" id="fan_gate_id" value="65432"><input type="hidden" id="nwSteps" value="email"><input type="hidden" id="wrndk" value="authored-cli-captcha-session"><input type="hidden" id="is_unlimited" value="1">
<section class="fangate-slider-content"><input id="email_address"><input id="email_name"><button id="email_to_downloads_next">Original email submit</button><div id="gatePreviewCaptcha" class="hide" style="display:none"></div></section><div id="captchalog" data-attempts="over" data-sitekey="authored-sitekey-cli-000000000000"></div>
<script>let config,frame,response='';window.grecaptcha={render(element,options){config=options;frame=document.createElement('iframe');frame.title='Authored CLI CAPTCHA';frame.src='https://www.google.com/recaptcha/api2/anchor?authored=cli';element.append(frame);return 1},getResponse(){return response},reset(){response=''}};addEventListener('message',event=>{if(frame&&event.source===frame.contentWindow&&event.origin==='https://www.google.com'&&event.data?.authored==='cli-complete'){response='authored-cli-challenge-response';config.callback()}});window.nativeClicks=0;document.querySelector('#downloadProcess').onclick=event=>{event.preventDefault();window.nativeClicks++};document.querySelector('#email_to_downloads_next').onclick=()=>window.nativeClicks++;</script>`;
let captchaCompleted = false;
let emailPosts = 0;
let context;
let automaticConsent = false;
let finalPosts = 0;
let authWindows = 0;
let mediaGets = 0;
let nativeClicks = 0;
let resolver;

async function setup(browser) {
  context = browser;
  await browser.route('https://boost.ink/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<button class="complete_btn">Proceed</button><script src="/assets/js/unlock.js" bufpsvdhmjybvgfncqfa="${btoa('https://files.example/song.wav')}"></script>`,
    }),
  );
  await browser.route('https://hypeddit.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/fixture/cli-auth')
      return route.fulfill({ contentType: 'text/html', body: fixture });
    if (url.pathname === '/fixture/cli-captcha')
      return route.fulfill({ contentType: 'text/html', body: captchaFixture });
    if (url.pathname === '/verifyEmailAddress') {
      assert(captchaCompleted, 'No email request before manual fixture CAPTCHA completion');
      emailPosts++;
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'T' }),
      });
    }
    if (url.pathname === '/spotify_callback')
      return route.fulfill({
        contentType: 'text/html',
        headers: { 'Set-Cookie': 'cli_auth=accepted; Secure; HttpOnly; SameSite=Lax; Path=/' },
        body: '<h1>Authentication successful</h1><script>localStorage.setItem("hypeChildWindow","login_to_sp");window.close()</script>',
      });
    if (url.pathname === '/gate/download/ul') {
      finalPosts++;
      const headers = await request.allHeaders();
      assert.match(
        headers.cookie ?? '',
        /cli_auth=accepted/,
        'No final request before actual fixture callback approval',
      );
      assert.equal(headers.origin, 'https://hypeddit.com');
      nativeClicks += await request.frame().evaluate(() => window.nativeClicks);
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ download_status: true, URL: target }),
      });
    }
    return route.abort();
  });
  await browser.route('https://www.google.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<button onclick="parent.postMessage({authored:'cli-complete'},'https://hypeddit.com')">Complete authored CLI CAPTCHA</button>`,
    }),
  );
  await browser.route('https://accounts.spotify.com/**', (route) => {
    authWindows++;
    return route.fulfill({
      contentType: 'text/html',
      body: automaticConsent
        ? '<script>location.href="https://hypeddit.com/spotify_callback"</script>'
        : '<h1>Authored login only</h1><button onclick="location.href=\'https://hypeddit.com/spotify_callback\'">Finish fixture sign-in</button>',
    });
  });
  await browser.route('https://hypeddit-gates-prod.s3.amazonaws.com/**', (route) => {
    if (route.request().method() !== 'HEAD') mediaGets++;
    return route.fulfill({ status: 403, body: '' });
  });
}
function make(loadedExtension = extensionPath) {
  return createBrowserResolver({ profile, extensionPath: loadedExtension, headless: true, setup });
}
async function pageAt(prefix) {
  for (let index = 0; index < 150; index++) {
    const page = context?.pages().find((page) => page.url().startsWith(prefix));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Authored fixture page did not open: ' + prefix);
}
const request = () => ({ signal: AbortSignal.timeout(25000), inspect: false, progress() {} });

try {
  resolver = make();
  const inspected = await resolver.resolve(boost, { ...request(), inspect: true });
  assert.equal(inspected.gate.provider, 'boost');
  assert.equal(inspected.result, undefined);
  const embedded = await resolver.resolve(boost, request());
  assert.equal(embedded.result.url, 'https://files.example/song.wav');
  assert.equal(mediaGets, 0);

  const pending = resolver.resolve(gateUrl, request());
  const page = await pageAt(gateUrl);
  const signIn = page
    .locator('#gatebreaker-panel')
    .getByRole('button', { name: 'Sign in with Spotify', exact: true });
  await signIn.waitFor();
  assert.equal(finalPosts, 0);
  // Test-only human simulation on wholly authored, intercepted pages. The CLI
  // host itself never clicks a sign-in/consent/native step control.
  await signIn.click();
  const auth = await pageAt('https://accounts.spotify.com/');
  await auth.getByRole('button', { name: 'Finish fixture sign-in' }).click();
  const completed = await pending;
  assert.equal(completed.result.ok, true);
  assert.equal(completed.result.url, target);
  assert.equal(finalPosts, 1);
  assert.equal(nativeClicks, 0);
  assert.equal(mediaGets, 0, 'Resolve-only browser mode must never start extension media delivery');
  await resolver.close();

  automaticConsent = true;
  const nextExtension = path.join(profile, 'authored-package-update');
  await cp(extensionPath, nextExtension, { recursive: true });
  resolver = make(nextExtension);
  const reused = await resolver.resolve(gateUrl, request());
  assert.equal(reused.result.ok, true);
  assert.equal(
    authWindows,
    2,
    'The stored CLI profile reuses sign-in through the provider-owned return',
  );
  assert.equal(finalPosts, 2);
  assert.equal(mediaGets, 0);

  const captchaPending = resolver.resolve(captchaUrl, request());
  const captchaPage = await pageAt(captchaUrl);
  const challenge = captchaPage
    .locator('#gatebreaker-panel iframe')
    .first()
    .contentFrame()
    .frameLocator('iframe[title="Authored CLI CAPTCHA"]');
  const solve = challenge.getByRole('button', { name: 'Complete authored CLI CAPTCHA' });
  await solve.waitFor();
  assert.equal(emailPosts, 0);
  captchaCompleted = true;
  await solve.click();
  const captchaResult = await captchaPending;
  assert.equal(captchaResult.result.ok, true);
  assert.equal(emailPosts, 1);
  assert.equal(mediaGets, 0);

  const cancel = new AbortController();
  automaticConsent = false;
  const cancelled = resolver.resolve(gateUrl, { ...request(), signal: cancel.signal });
  const rejection = assert.rejects(cancelled);
  await pageAt(gateUrl);
  cancel.abort();
  await rejection;
  assert.equal(context.pages().length, 0, 'Cancellation closes only the CLI-owned context');
  assert(
    (await readdir(profile)).includes('.gatebreaker-cli-profile'),
    'Owned sign-in profile is retained',
  );
  automaticConsent = true;
  let stdout = '',
    stderr = '',
    fallbacks = 0,
    httpCalls = 0;
  const exit = await run([gateUrl, '--json', '--timeout', '30'], {
    version: 'fixture',
    signal: AbortSignal.timeout(35000),
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
    fetch: async (input, init) => {
      httpCalls++;
      if (String(input).startsWith('https://hypeddit-gates-prod.s3.amazonaws.com/')) {
        assert.equal(init.method, 'HEAD');
        return new Response('', { status: 403 });
      }
      assert.equal(String(input), gateUrl, 'No final HTTP request before sign-in');
      return new Response(fixture, { headers: { 'content-type': 'text/html' } });
    },
    browserFactory: () => {
      fallbacks++;
      return make();
    },
  });
  assert.equal(exit, 0);
  assert.equal(fallbacks, 1);
  assert.equal(httpCalls, 2, 'Initial HTML and one public HEAD precede browser fallback');
  assert.equal(stdout.trim().split('\n').length, 1);
  assert.equal(JSON.parse(stdout).url, target);
  assert.match(stderr, /Opening the dedicated Gatebreaker browser/);
  assert.equal(context.pages().length, 0);
  assert.equal(mediaGets, 0);
  console.log(
    'CLI browser: automatic HTTP fallback, fixture sign-in, persistent reuse, CAPTCHA, cancellation and terminal output passed',
  );
} finally {
  await resolver?.close();
  if (
    path.dirname(profile) === path.resolve(tmpdir()) &&
    path.basename(profile).startsWith('gatebreaker-cli-browser-')
  )
    await rm(profile, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
}
