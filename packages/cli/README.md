# Gatebreaker CLI

Resolve supported music download gates with the same TypeScript engine as the
Gatebreaker Chrome/Firefox extension. Node.js 22.12+, 24, or 26+ is required.

## Run with npm / npx

The CLI is distributed as an npm tarball on GitHub. The unrelated
registry package named `gatebreaker` is not this project. Registry publication of
`gatebreaker-cli` is pending; use this exact package URL:

```sh
npx --yes --package=https://github.com/DavidNiessen/gatebreaker/releases/download/v0.13.0/gatebreaker-cli-0.13.0.tgz gatebreaker --help
```

Install the executable globally if preferred:

```sh
npm install -g https://github.com/DavidNiessen/gatebreaker/releases/download/v0.13.0/gatebreaker-cli-0.13.0.tgz
gatebreaker --providers
```

Check the tarball against the release's `SHA256SUMS` when downloading it manually.

## Usage

```sh
gatebreaker "https://boost.ink/YOUR_GATE"
gatebreaker --download --directory ./downloads "https://hypeddit.com/ARTIST/TRACK"
gatebreaker --json "https://sub2unlock.com/YOUR_GATE" "https://boost.ink/YOUR_GATE"
gatebreaker --inspect "https://droploud.com/track/YOUR_TRACK_ID"
gatebreaker --session ./session.json --timeout 180 "https://droploud.com/track/YOUR_TRACK_ID"
```

Default behavior resolves and prints destinations without fetching the reward.
`--download` streams file rewards to disk, including multiple-file rewards.
Page rewards are printed for you to open. Existing filenames are never overwritten;
choose another directory when retrying. Incomplete transfers are cleaned up. A
multi-file failure leaves already completed files intact and reports their paths.

`--json` produces one JSON object per input URL (JSON Lines). Progress goes to
stderr, or is suppressed by `--quiet`. Results include `input`, `ok`, the core
resolution fields, and `files` when saved. Failures include `code` and `message`.
`--inspect` always prints a JSON metadata object without invoking resolution.
`--timeout` is a total deadline per input, including login and downloads (default
600 seconds, maximum 3600). Ctrl+C cancels the active request and closes the CLI-owned browser. Exit codes: 0 for success,
1 if any input failed, 2 for invalid arguments, 130 for interruption.

An explicit URL command permits the core's supported automatic HTTP steps, including
the configured `gatebreakeros@proton.me` email where required. `--inspect` does not
submit gate steps. Required comments use only your own text supplied with
`--soundcloud-comment "YOUR COMMENT"`.

## Provider coverage and sign-in

Includes Hypeddit, Sub2Unlock, Boost.ink, Rekonise, Valorizd, PUSH.fm, GateRush and
Droploud, DownloadGater, StillHype, PumpYourSound, MyPressKit and Bandcamp adapters. These are shared adapters, not a claim that every gate works
without a browser. See the repository's [provider evidence](https://github.com/DavidNiessen/gatebreaker/tree/master/docs/research).

### Automatic browser fallback

Run a URL command normally. It first tries HTTP with inert HTML parsing. If a
supported gate needs rendering or a browser session, Gatebreaker prepares it in
headless Chromium. There is no `--browser` parameter.

When required sign-in cannot finish silently, the CLI reopens its own profile in
windowed mode, keeps the gate minimized, and automatically opens the provider's
native Spotify, SoundCloud or other authorization window. You complete login and
review consent there. A required CAPTCHA or other manual verification appears in
a small Gatebreaker window. Processing resumes only after provider confirmation;
the CLI never types credentials, clicks native gate controls or solves challenges.

Chromium's headless setting applies to the entire browser. The interactive phase
therefore uses a windowed browser with a minimized gate, rather than a visible
popup attached to a headless process. It stays alive and minimized until the
command finishes, preserving session-only cookies across multiple inputs. The
switch closes the headless process before reopening the same dedicated profile;
no browser cookies or tokens are exported/imported between processes. Persistent
state survives through normal profile storage; unfinished gate preparation is
repeated before interaction. Saved sessions may allow the whole browser phase to
finish headlessly, but fresh consent or verification can still be required.

The compatible Chromium binary downloads automatically on first fallback if it is
missing. Optional `gatebreaker --install-browser` prefetches it. No browser is
installed or opened for a successful HTTP resolution or `--inspect`. Rate limits,
unsafe destinations, invalid responses from recognized gates, missing required
comment text and network failures do not trigger browser fallback.

This follows sc-gate-dl's HTTP-first/browser-fallback architecture; see the
[source comparison](https://github.com/DavidNiessen/gatebreaker/blob/master/docs/research/cli-login-reference.md).
It does not copy that project's implementation or claim a URL-only OAuth flow.

Browser mode retains its own profile at `~/.gatebreaker/browser`. Persistent
website cookies, saved provider login state and the extension's reusable-sign-in
preference persist there across commands. The bundled extension has a stable identity across package paths
and updates. A provider may still require fresh authorization or gate-specific
consent; saved login does not override server requirements. Close concurrent CLI
commands using the same profile before starting another.

Use `--profile ./my-cli-profile` for a different dedicated profile. An
existing directory must carry the CLI's ownership marker; an unmarked nonempty
browser directory is refused. Never point it at your normal Chrome/Firefox profile.
The CLI neither reads nor controls your normal browser. Keep this dedicated profile
private; deleting it while the CLI is closed removes its saved login state.

Only the CLI owns final file delivery: resolve-only commands print the approved
URL without opening or downloading rewards. `--download` streams released files
through the terminal client and omits browser/account cookies from those file
requests. Required SoundCloud reposts are handled by the existing extension host
when supported and signed in. Required comments still use only text you supply
through `--soundcloud-comment` or save in this dedicated browser's Gatebreaker
settings. Browser-profile cookies are never exported to JSON/session files.

Headless processing needs no display. Interactive verification requires a desktop with a window manager;
without one, the CLI stops with an explanation. On Linux, install Chromium's system
libraries if needed (`npx playwright@1.64.1 install-deps chromium`); this can require
administrator access. The CLI does not install operating-system packages for you.
Browser binaries download only when first needed or explicitly prefetched, never
through an npm lifecycle script.

### HTTP fast path and explicit sessions

The initial HTTP attempt parses inert HTML and keeps a cookie jar in memory. It
executes no website JavaScript and never imports browser credentials. A supplied
`--session` file applies only to this HTTP attempt; its cookies are not copied into
the fallback browser, and browser cookies are not exported back into it. A valid
supplied native session can allow an HTTP resolution to finish without a browser.
Both transports still require current server approval, and session reuse is not
guaranteed.

You can explicitly supply your own session JSON:

```json
{
  "version": 1,
  "cookies": [
    {
      "url": "https://hypeddit.com/",
      "cookie": "YOUR_COOKIE_NAME=YOUR_VALUE; Secure; Path=/"
    }
  ],
  "nativeSessions": [
    {
      "provider": "droploud",
      "gateId": "YOUR_TRACK_UUID",
      "value": "YOUR_EXISTING_NATIVE_SESSION_UUID"
    }
  ]
}
```

Both arrays are required and may be empty. Cookie strings are Set-Cookie format;
provide one entry per cookie. Native sessions are gate-specific identifiers, not
Spotify/SoundCloud OAuth tokens. The file is read-only and limited to 1 MiB.
The CLI never exports sessions or saves updated cookies. Keep session files private
and out of version control. File downloads omit all imported cookies.

There is no telemetry or external bypass service. Requests go directly to providers
and selected file hosts. JSON and plain output may contain signed links or file
keys; treat captured output as private. Public HTTPS URL checks and redirect checks
reject literal private addresses; they are not a DNS-pinned network sandbox.

## Use the core in an API

The package also exports the browser-independent engine and TypeScript declarations:

```js
import { createGatebreaker, providers } from 'gatebreaker-cli/core';

const engine = createGatebreaker({
  providers,
  fetch: yourSessionAwareFetch,
  parseHtml: yourInertHtmlParser,
});
const session = engine.createSession({ url: gateUrl, html: gateHtml });
const result = await session.resolve({ automate: true });
```

Supply your own HTTP/session policy and inert DOM parser. The core resolves links;
your host owns authentication, cancellation, file delivery and any API server.
No HTTP API server is started by this package.

MIT licensed. Source and issue tracker:
[DavidNiessen/gatebreaker](https://github.com/DavidNiessen/gatebreaker).
