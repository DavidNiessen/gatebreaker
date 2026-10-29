# Gatebreaker

<img src="static/icons/128.png" width="64" height="64" alt="Gatebreaker: an open gate with a download arrow" />

A TypeScript CLI and extension for Chrome and Firefox that recover destinations from
supported download and social gates. MIT licensed, with separate provider adapters
and no external bypass service.

## CLI

Run Gatebreaker with Node.js 22.12+, 24 or 26+ using the release's npm tarball:

```sh
npx --yes --package=https://github.com/DavidNiessen/gatebreaker/releases/download/v0.13.0/gatebreaker-cli-0.13.0.tgz gatebreaker --help
```

For a persistent installation:

```sh
npm install -g https://github.com/DavidNiessen/gatebreaker/releases/download/v0.13.0/gatebreaker-cli-0.13.0.tgz
gatebreaker --download --directory ./downloads "https://boost.ink/YOUR_GATE"
gatebreaker --download "https://hypeddit.com/ARTIST/TRACK"
```

Supports multiple URLs, JSON Lines, inspection, deadlines and explicit session-file
imports. Commands try HTTP first, then use a dedicated headless Chromium profile
when rendering or a browser session is needed. Required login opens the native
authorization window automatically while the gate stays minimized. CAPTCHA or
other manual verification uses a small Gatebreaker window.
Compatible Chromium downloads on first use if missing; `--install-browser` can
prefetch it. There is no `--browser` flag. Required interactions remain yours and
provider approval is still required. Your normal browser profile is never imported
or controlled. The CLI shares all thirteen core adapters and the extension host. See the
[CLI guide](packages/cli/README.md) for options, sessions and the `gatebreaker-cli/core`
API export. Registry publication of `gatebreaker-cli` is pending; the unrelated npm
package named `gatebreaker` belongs to another project.

## Supported providers

SoundCloud-oriented additions:

GateRush and Droploud support is partial. GateRush uses direct email/ordinary-step
POSTs and checks the original download with HEAD; denied required-comment gates
and link rewards retain their native flow. Droploud can reuse the site's saved
session and directly request its released file or external link. All 17 sampled
Droploud gates required a user-written comment; fresh sessions remained blocked.
Neither provider has a verified real-account end-to-end download. See
[GateRush evidence](docs/research/providers/gaterush/README.md) and
[Droploud evidence](docs/research/providers/droploud/README.md).

Gate processing invokes the providers' HTTP endpoints directly. It never clicks
native step controls, fills native inputs, or treats slide animations as completion.
Required account authorization uses an explicit provider-owned consent window;
only the final server response can release the download.

When Hypeddit actually requires reCAPTCHA, Gatebreaker displays its official widget
inside the page box and extension popup. You solve it manually; email verification
and the remaining Download continue automatically after acceptance. The widget
stays on Hypeddit’s origin in an isolated frame. Frame-loading failures offer retry
and a gate-page fallback; CAPTCHA solving and authentication are never fabricated.

| Provider | Implemented flow                                                                                                           | Live evidence on 2026-10-27                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Valorizd | Read the current public gate's URL/file reward with a projected, exact-slug lookup; no accounts or email submissions       | 10/10 current music gates, including two with email capture                                                          |
| PUSH.fm  | Try the public reward lookup, then automate supported native click acknowledgements; support URL and multiple-file rewards | 5/10 public responses plus three previously refused rewards with acknowledgements; Spotify and a server error remain |

| Provider   | Implemented flow                                                                                                                           | Live evidence on 2026-10-27                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Sub2Unlock | Read the public destination from the current Next.js gate format without social actions                                                    | 10/10 discovered gates resolved                                                                           |
| Boost.ink  | Decode the current embedded destination; refetch only the gate HTML if its script consumed the field                                       | 8/8 URLs: six IDs plus German/Dutch variants                                                              |
| Rekonise   | Wait through the provider interval, then recover a public link or signed uploaded-file URL; no account, social action, or email submission | 16 timed link gates, 3 uploaded-file gates, and 1 email-list gate resolved                                |
| Hypeddit   | Public-file/skip attempts plus HTTP email verification and source-verified Spotify consent                                                 | Expanded Chrome sample: 71/76 active gates released accessible files; five account completions unverified |

## Additional SoundCloud gate providers

Gatebreaker also includes DownloadGater, StillHype, PumpYourSound, MyPressKit and
Bandcamp adapters in both the extension and CLI. Processing starts only when you
choose Gatebreaker's Download. Required native account consent remains visible;
required public comments use your saved text. Site Download buttons keep their
normal manual behavior.

| Provider      | Implemented flow                                                                    | Current live evidence                                                                                    |
| ------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| DownloadGater | Native email, SoundCloud/Spotify consent and original-file preflight                | 12/12 public gates recognized; all anonymous preflights required SoundCloud                              |
| StillHype     | Email, ordinary step acknowledgements, SoundCloud actions/consent and server unlock | 11/11 gates recognized; account/comment completion unverified                                            |
| PumpYourSound | Native form, ordinary acknowledgements and native SoundCloud SDK handoff            | 10/10 gates recognized; real authenticated completion unverified                                         |
| MyPressKit    | Native step/email requests, SoundCloud/Spotify consent and verified download grant  | One current gate recognized; all five SoundCloud steps remained locked                                   |
| Bandcamp      | Artist-issued free downloads or existing valid download grants; FLAC/WAV preference | Two free FLAC tracks downloaded and decoded through Chrome, Firefox and CLI; paid access remains blocked |

These adapters require final server approval. They never substitute preview audio
for the original. Paid Bandcamp checkout, unsupported challenges and unconfirmed
account actions remain explicit limitations. See the [comparison and validation
report](docs/research/provider-expansion.md) for per-provider evidence.

Rekonise shows a countdown and **Cancel check**. Sampled ordinary-action gates
completed after conservative 20–50 second waits. Watch-video actions use a longer
source-derived allowance; email-list gates add an allowance for the extra UI step.
Public gate tokens and returned passes are not stored.

PUSH.fm support is partial: native Spotify authorization and unsupported action types
can still be required. Supported click acknowledgements need no social account. All released file rewards start automatically after Download, including every
file in a multi-file reward. The file chooser and links remain available for retry. Valorizd handles Next.js consuming its script tags
after hydration by reading the exact owned script's resource timing, without
evaluating page code or reading page/account objects.

These are tested samples and formats, not promises about every possible gate.
A recovered destination may be another gate; it does not prove the final file is
still available. One Rekonise file also passed a header-only availability check.
No full files were downloaded for the new-provider validation. Snippet-only Rekonise
output, unverified aliases, private/payment access, CAPTCHA bypass, and unsafe
destinations are not supported.

ToneDen's tested flow required login on 14 gates, so it is not advertised as
supported. Hypeddit's Sylver gate delivered its original WAV in a live Chrome test
on 2026-10-28 using the required Spotify sign-in, the configured Proton email and
future-song opt-out. Account-free Sylver unlocking remains unsupported. See the
[live sign-in ordering findings](docs/research/hypeddit-live-ordering.md). See [provider findings and matrices](docs/research/providers/README.md),
[Hypeddit coverage](docs/research/live-coverage.md), and [native validation](docs/research/native-gate-actions.md).

Further SoundCloud candidates were investigated rather than advertised as working:
Earlier PumpYourSound and DownloadGater probes refused incomplete flows; the
current adapters are documented above. Fangate.eu refused the sampled flows; Beltergate's account/challenge path was not submitted; Feature.fm/Show.co
exposed no verified account-free reward lookup. Historical Click.dj/Unlock.fm links
had availability errors, and Artist Union domains are repurposed. See the
[candidate reports](docs/research/providers/soundcloud-candidates/candidate-board.md).

The [expanded Hypeddit matrix](docs/research/hypeddit-expanded-coverage.md) covers
82 public URLs, 14 declared step codes and 40 combinations. It verifies file access
with one-byte requests, including 24 Spotify sign-ins. Mixcloud and Deezer native
handoffs are implemented, but their five sampled account completions remain unverified.
Link Gates are outside the current download adapter.

The opt-in anonymous reproduction command submits the configured email and stops
at required accounts; it never downloads complete files:

```sh
npm run build
npm run check:hypeddit -- docs/research/hypeddit-expanded-urls.json --allow-email --verify-files
```

## Install

Download the [v0.13.0 packages](https://github.com/DavidNiessen/gatebreaker/releases/tag/v0.13.0)
and verify them with `SHA256SUMS`, or build locally. These are manual-install
packages; browser-store publication and Mozilla signing are not included.

### Chrome 120+

1. Extract `gatebreaker-0.13.0-chrome.zip` into a folder you will keep.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the folder containing `manifest.json`.
4. Reload gate tabs after installation or update.

### Firefox 140+

1. Extract `gatebreaker-0.13.0-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**.
3. Select the extracted `manifest.json`.
4. Reload gate tabs. Temporary add-ons disappear when Firefox restarts.

A permanent standard-Firefox installation requires signing. Android's manifest
minimum is 142; mobile extension behavior has not been tested.

## Use

The page panel and extension popup use a blue palette and follow your system's
light or dark setting automatically, including changes while they are open.
There is no separate theme setting to configure.

Visit a supported gate and choose **Download** in the starting-page panel or popup.
Opening the page only inspects it; automatic processing starts after a Gatebreaker
Download click. The website's original buttons and individual steps remain available
and follow its normal manual flow. Native buttons never start Gatebreaker processing.
After one confirmed Spotify sign-in with Gatebreaker, later Hypeddit Downloads
automatically try the existing browser session. You do not need another Sign in
click. A native window may appear briefly; expired sessions or new consent still
require your input. See [session reuse validation](docs/research/hypeddit-spotify-reuse.md).

Required sign-in buttons appear on that page, and Download stays disabled until
all required sign-ins are confirmed by the website. If a requirement is discovered
after Download, processing pauses and continues automatically after sign-in. Recovered
files start in the browser download manager automatically. URL rewards open in a
new tab; they may lead to another gate. Result links remain available if you need
to retry. Opening a gate page alone never starts a download. File keys, including MEGA fragments,
are preserved.

Use **Cancel check** during a pending request. Navigation or disabling also cancels
where possible and discards stale results. Uncheck **Enabled** in the popup to
remove Gatebreaker's panel. Cancellation cannot undo requests already received
or an email/authorization already handed to Hypeddit.

For required SoundCloud comments, open **SoundCloud comment settings** in the popup
and save your own reusable text. Missing text can also be entered in the page panel
with **Save and continue**. The provider may post it publicly from your signed-in
SoundCloud account. Clear it in settings whenever you want. Droploud and GateRush
prepare it before their native authorization; Hypeddit includes it only when the
SoundCloud comment field is required and unskipped.

Droploud reposts run automatically after Download. Gatebreaker opens an owned
SoundCloud window and uses HTTP requests to check or repost the exact required
track. If its website session has expired, sign in there; processing resumes
automatically, without clicking Repost. Existing reposts stay reposted. This makes
a real public repost from your account. Droploud must still verify it and approve
the download. Manual likes remain a separate native requirement.
See [automatic repost evidence](docs/research/soundcloud-repost-http.md) and
[comment support](docs/research/soundcloud-social.md) for provider boundaries.

Droploud's known Instagram confirmation runs automatically through its native
gate API after required SoundCloud checks. It acknowledges that gate step without
opening Instagram, accessing an Instagram account or performing a follow. Final
server approval is still required. See the [Instagram fix and live check](docs/research/providers/droploud/instagram-ack.md).

Automatic reposting adds `scripting` and SoundCloud host access. Allow the updated
permissions and reload gate tabs after updating. Account tokens remain inside the
SoundCloud page and are never stored by the extension.

On Hypeddit, Download automatically submits `gatebreakeros@proton.me` through the native email verification endpoint, including optional email. It waits
for acceptance before requesting the download. There is no separate email button.
A rejection stops processing; Try again reuses the same fixed address. The panel
shows errors without a success log or submitted address. This does not
create or control a mailbox, and the provider may reject it or require verification.
Supported required Spotify controls open Hypeddit's own consent address directly. Mixcloud and Deezer native handoffs are also available; their real account completion remains unverified.
Unverified required SoundCloud variants remain unsupported.
PUSH.fm likewise uses its own Spotify window when authorization is required.
Review its requested follows, saves, and permissions. Session reuse follows those
websites, not an extension-owned token store. PUSH.fm can reuse its own existing
receipt for the same gate when its native control also confirms completion. New callbacks are bound to the
exact consent window and do not depend on native button updates. A
Spotify session alone cannot prove authorization for a different gate.

Reload expired sessions and wait before retrying rate limits. Hidden forms,
completed timers, empty success responses, and audio previews never count as a
recovered original download.

## Develop and verify

Use Node.js 22.12+, 24, or 26+ as permitted by `package.json`.

```sh
npm ci
npm run check
npm run package
npx playwright install chromium firefox
npm run test:browser
```

`check` runs Prettier, strict TypeScript, offline tests, both builds, and Mozilla's
validator. No runtime npm dependencies are used. Unpacked builds are in `dist/`;
reproducible ZIPs/checksums are in `release/`.

Both installed-browser suites cover provider formats, unsafe results, retries,
MEGA keys, real countdowns, cancellation, automatic file/page handoff, and absence
of social API calls. Provider fixture suites intercept the browser delivery API
boundary so synthetic signed URLs never request real media. Chrome also exercises
the real download manager with an authored text fixture in a temporary directory. Chrome additionally exercises the real popup. Firefox popup
documents are outside this Playwright check; its page controls are tested. Firefox
background HEADs are outside Playwright routing and may contact the fixed
nonexistent S3 fixture object. CI runs both installed-browser suites and the Firefox validator.

Opt-in live diagnostics extract links without opening destinations by default:

```sh
npm run check:live -- https://sub2unlock.com/Ucdex https://boost.ink/27e
```

The checker accepts configured HTTPS page hosts, remains anonymous-only, blocks
unrelated browser requests, and saves origins/statuses instead of complete result
URLs. It never submits Hypeddit email or opens sign-in. Rekonise checks include the
real wait. Optional `--verify-destinations` requests one byte and cancels the body;
redirects are refused. This is a metadata check, not file-integrity verification.
For multiple files this optional check applies to the primary destination only.
Native Valorizd rendering permits its fixed project's read transports; writes are
blocked. PUSH.fm's fixed product CDN is allowed for native rendering. Anonymous diagnostics disable native automation: PUSH.fm only makes the original
two public GETs. Valorizd never records action completion; neither adapter submits
email or requests a recovered file.
Live diagnostics are excluded from CI.

Core provider composition is in `src/core/providers/index.ts`; browser interactions
are composed separately in `src/extension/providers/index.ts`. Explicit page hosts shared by builds
and diagnostics are in `config/provider-hosts.json`. Read [architecture](docs/architecture.md),
[contributing](docs/contributing.md), [privacy](PRIVACY.md), and [security](SECURITY.md).

## Reusable core

`src/core` contains the provider request contracts, parsing, validation and resolution
engine. `src/extension` owns browser messaging, native storage, sign-in windows,
callback observation, CAPTCHA views, download delivery and UI. The extension uses
the same core providers exposed to other hosts.

Build the standalone ESM library and declarations with `npm run build:core`. It is
available as `gatebreaker/core` from a built checkout or local package; no npm
publication is required. `npm run test:core:node` runs a complete authored example
in Node without Chrome, Firefox or browser globals.

```ts
import { createGatebreaker, providers } from 'gatebreaker/core';

const engine = createGatebreaker({
  providers,
  fetch: host.fetch,
  parseHtml: host.parseInertHtml,
  readNativeSession: host.readNativeSession,
  preferences: { soundcloudComment: userSuppliedComment },
});
const gate = engine.createSession({ url, html: htmlLoadedByTheHost });
const summary = gate.inspect();
const result = await gate.resolve({ automate: true, signal });
```

The host supplies an inert DOM parser, such as JSDOM without script execution, and
an HTTP transport scoped to the current user/session. It also owns and disposes any
created DOMs. The core never fetches the initial page, opens a sign-in window,
delivers a file or writes storage. Inspection makes no requests and returns copied
summaries, including declared input requirements, without CSRF/session metadata.
Automatic supported steps require explicit `resolve({ automate: true })`.

Node fetch does not provide a browser cookie jar through `credentials: 'include'`.
Authenticated hosts must supply appropriate session-aware HTTP and native-session
capabilities; separate users must not share a credential jar. Required sign-in,
CAPTCHA and manual social-action outcomes remain host interactions, not hidden
headless automation. User-written comments are provided explicitly and are never
generated from captured website text. Per-gate sessions keep concurrent resolutions
separate and reject late results after cancellation.

An optional `repostSoundcloud` host capability can perform a declared Droploud
repost for an automated resolution. It receives the bound public track URL,
provider/gate IDs, cancellation signal and progress callback, and returns only a
typed state. The host owns account authentication; the core still requires native
verification and final file approval. The extension supplies its owned page adapter;
an API/CLI host must implement its own account/session-scoped capability.

See [the runnable Node example](scripts/test-core-node.mjs) and
[the core contracts](src/core/client.ts). Builds validate the core with no Chrome
types, reject imports of extension code and check its declarations under NodeNext.

## License

[MIT](LICENSE). Gatebreaker is independent of the gate and social platforms.
