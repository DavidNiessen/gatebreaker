# Gatebreaker

A TypeScript extension for Chrome and Firefox that recovers destinations from
supported download and social gates. MIT licensed, with separate provider adapters
and no external bypass service.

## Supported providers

SoundCloud-oriented additions:

| Provider | Implemented flow                                                                                                           | Live evidence on 2026-10-27                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Valorizd | Read the current public gate's URL/file reward with a projected, exact-slug lookup; no accounts or email submissions       | 10/10 current music gates, including two with email capture                                                          |
| PUSH.fm  | Try the public reward lookup, then automate supported native click acknowledgements; support URL and multiple-file rewards | 5/10 public responses plus three previously refused rewards with acknowledgements; Spotify and a server error remain |

| Provider   | Implemented flow                                                                                                                           | Live evidence on 2026-10-27                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Sub2Unlock | Read the public destination from the current Next.js gate format without social actions                                                    | 10/10 discovered gates resolved                                             |
| Boost.ink  | Decode the current embedded destination; refetch only the gate HTML if its script consumed the field                                       | 8/8 URLs: six IDs plus German/Dutch variants                                |
| Rekonise   | Wait through the provider interval, then recover a public link or signed uploaded-file URL; no account, social action, or email submission | 16 timed link gates, 3 uploaded-file gates, and 1 email-list gate resolved  |
| Hypeddit   | Public-file/skip attempts plus native email and Spotify/SoundCloud assistance                                                              | Earlier anonymous baseline: 9/25 working originals; support remains partial |

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
supported. Hypeddit's Sylver account-free unlock and real-account delivery remain unverified. See [provider findings and matrices](docs/research/providers/README.md),
[Hypeddit coverage](docs/research/live-coverage.md), and [native validation](docs/research/native-gate-actions.md).

Further SoundCloud candidates were investigated rather than advertised as working:
PumpYourSound, Droploud, DownloadGater and Fangate.eu refused the sampled incomplete
flows; Beltergate's account/challenge path was not submitted; Feature.fm/Show.co
exposed no verified account-free reward lookup. Historical Click.dj/Unlock.fm links
had availability errors, and Artist Union domains are repurposed. See the
[candidate reports](docs/research/providers/soundcloud-candidates/candidate-board.md).

## Install

Download the [v0.6.0 packages](https://github.com/DavidNiessen/gatebreaker/releases/tag/v0.6.0)
and verify them with `SHA256SUMS`, or build locally. These are manual-install
packages; browser-store publication and Mozilla signing are not included.

### Chrome 120+

1. Extract `gatebreaker-0.6.0-chrome.zip` into a folder you will keep.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the folder containing `manifest.json`.
4. Reload gate tabs after installation or update.

### Firefox 140+

1. Extract `gatebreaker-0.6.0-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**.
3. Select the extracted `manifest.json`.
4. Reload gate tabs. Temporary add-ons disappear when Firefox restarts.

A permanent standard-Firefox installation requires signing. Android's manifest
minimum is 142; mobile extension behavior has not been tested.

## Use

Visit a supported gate and choose **Download** in the starting-page panel or popup.
Opening the page only inspects it; automatic processing starts after Download.
Required sign-in buttons appear on that page, and Download stays disabled until
all required sign-ins are confirmed by the website. If a requirement is discovered
after Download, processing pauses and continues automatically after sign-in. Supported individual gate forms stay hidden while enabled. Recovered
files start in the browser download manager automatically. URL rewards open in a
new tab; they may lead to another gate. Result links remain available if you need
to retry. Opening a gate page alone never starts a download. File keys, including MEGA fragments,
are preserved.

Use **Cancel check** during a pending request. Navigation or disabling also cancels
where possible and discards stale results. Uncheck **Enabled** in the popup to
restore the site's controls. Cancellation cannot undo requests already received
or an email/authorization already handed to Hypeddit.

On Hypeddit, Download automatically submits a single random dictionary word at
`icloud.com` through the native email handler, including optional email. It waits
for acceptance before requesting the download. There is no separate email button.
A rejection stops processing; Try again generates a different word. The panel
shows errors without a success log or generated address. This does not
create or control a mailbox, and the provider may reject it or require verification.
Required Spotify/SoundCloud controls use Hypeddit's own login and consent windows.
PUSH.fm likewise uses its own Spotify window when authorization is required.
Review its requested follows, saves, and permissions. Session reuse follows those
websites, not an extension-owned token store. PUSH.fm can reuse its own existing
receipt for the same gate when its native control also confirms completion. A
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
nonexistent S3 fixture object. CI runs Chrome integration and the Firefox validator.

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

Composition is in `src/providers/index.ts`; explicit page hosts shared by builds
and diagnostics are in `config/provider-hosts.json`. Read [architecture](docs/architecture.md),
[contributing](docs/contributing.md), [privacy](PRIVACY.md), and [security](SECURITY.md).

## License

[MIT](LICENSE). Gatebreaker is independent of the gate and social platforms.
