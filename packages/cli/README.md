# Gatebreaker CLI

Resolve supported music download gates with the same TypeScript engine as the
Gatebreaker Chrome/Firefox extension. Node.js 22.12+, 24, or 26+ is required.

## Run with npm / npx

The first CLI release is distributed as an npm tarball on GitHub. The unrelated
registry package named `gatebreaker` is not this project. Registry publication of
`gatebreaker-cli` is pending; use this exact package URL:

```sh
npx --yes --package=https://github.com/DavidNiessen/gatebreaker/releases/download/v0.10.0/gatebreaker-cli-0.10.0.tgz gatebreaker --help
```

Install the executable globally if preferred:

```sh
npm install -g https://github.com/DavidNiessen/gatebreaker/releases/download/v0.10.0/gatebreaker-cli-0.10.0.tgz
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
`--timeout` is a total deadline per input, including its downloads (default 120
seconds, maximum 3600). Ctrl+C cancels the active request. Exit codes: 0 for success,
1 if any input failed, 2 for invalid arguments, 130 for interruption.

An explicit URL command permits the core's supported automatic HTTP steps, including
the configured `gatebreakeros@proton.me` email where required. `--inspect` does not
submit gate steps. Required comments use only your own text supplied with
`--soundcloud-comment "YOUR COMMENT"`.

## Provider coverage and sign-in

Includes Hypeddit, Sub2Unlock, Boost.ink, Rekonise, Valorizd, PUSH.fm, GateRush and
Droploud adapters. These are shared adapters, not a claim that every gate works
without a browser. See the repository's [provider evidence](https://github.com/DavidNiessen/gatebreaker/tree/master/docs/research).

This HTTP host parses inert HTML, maintains an in-memory cookie jar and never
executes website JavaScript. It does not open a browser, solve CAPTCHA, perform
interactive OAuth, import browser credentials, or implement SoundCloud's browser
repost capability. Gates needing those actions can remain blocked; use the
extension/native website. A supplied session is scoped by normal cookie domain,
path and expiry checks; provider-side authentication can still expire or require
fresh authorization. Session reuse is not guaranteed.

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
