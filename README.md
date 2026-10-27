# Gatebreaker

A TypeScript browser extension that tries to reach the original download on
Hypeddit and manages supported email and sign-in steps from the starting page.
MIT licensed, with a provider interface for adding other gate services.

**Support is partial.** On 2026-10-26, 9 of 25 distinct live gates returned
working downloads; 16 remained blocked. Three additional URLs were unavailable.
That is the anonymous-download baseline. Native email and Spotify/SoundCloud
sign-in are now implemented, but real-account unlocks, including the Sylver /
Turn the Tide example, are **not yet verified**.
The live Sylver check rejected the random email placeholder; this is shown in
Gatebreaker rather than treated as success. See [native-flow validation](docs/research/native-gate-actions.md).
See the [full live results](docs/research/live-coverage.md) and [deeper blocked-gate investigation](docs/research/blocked-followup.md) before installing.

## Install

Download the [v0.2.0 browser packages](https://github.com/DavidNiessen/gatebreaker/releases/tag/v0.2.0)
or build them locally. Releases include separate Chrome and Firefox ZIPs and
`SHA256SUMS`. These packages are for manual installation; they are not browser
store listings or a signed Firefox add-on.

### Chrome 120+

1. Extract `gatebreaker-0.2.0-chrome.zip` into a folder you will keep.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the extracted folder containing `manifest.json`.
4. Reload any Hypeddit tabs that were open before installation.

### Firefox 140+

1. Extract `gatebreaker-0.2.0-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**.
3. Select `manifest.json` inside the extracted folder.
4. Reload existing Hypeddit tabs. Temporary add-ons are removed when Firefox restarts.

A permanent installation on standard Firefox requires Mozilla signing. This
release does not claim store approval. Android's manifest minimum is 142;
mobile browser behavior has not been tested.

## Use

Visit a supported `https://hypeddit.com/…` download page and click **Try skipping
gates** in the Gatebreaker panel or extension popup. If a usable URL is returned,
choose **Open download**. Files do not start downloading automatically.
The site's initial Download button also uses Gatebreaker while enabled; individual
native gate forms remain hidden. Disabling restores the site's normal controls.

If the anonymous attempt fails and the gate requires email, Gatebreaker generates
and submits a Gmail-format placeholder through Hypeddit's handler once. The panel
reports acceptance, rejection, or timeout. This creates no inbox; verification
emails cannot be received. Optional email submits only when its button is clicked.

Use **Sign in with Spotify** or **Sign in with SoundCloud** in Gatebreaker when
needed. These invoke Hypeddit's own controls while keeping individual gate forms
hidden. Complete the provider's login/consent window, return to Gatebreaker, then
choose **Download**. Review Hypeddit's requested follows, saves, and permissions:
authorization may perform those account actions. Optional sign-in can be left alone.

Download then uses Hypeddit's current session and known form fields. Gatebreaker
does not collect or persist social tokens. Login reuse follows the website's and
provider's sessions; one login across every gate or provider is not guaranteed.
Allow Hypeddit popups if the browser blocks them. CAPTCHA and inbox verification
remain unsupported; errors appear in the panel.

Use the popup's **Enabled** checkbox to hide the panel and stop new resolution
requests and native actions. Disabling also cancels the active download request
where possible and discards its result. It cannot undo an email or authorization
already submitted to Hypeddit. The original website remains usable.

If Hypeddit enforces the steps on its server, Gatebreaker explains that no link
was released. It does not treat a hidden form, completed carousel, empty API
success, or audio preview as a successful bypass. Reload the page if a session
expires; wait if the service limits requests. Custom-domain, Link, password,
payment, CAPTCHA bypass, and other sign-in providers are not claimed as supported.

## Verified coverage

| Configuration in the live sample                   | Result            |
| -------------------------------------------------- | ----------------- |
| SoundCloud-only gates                              | Several worked    |
| YouTube-only gate                                  | Worked            |
| SoundCloud + YouTube + Spotify + Instagram         | One worked        |
| YouTube + optional donation                        | One worked        |
| Email-only or Deezer-only samples                  | Blocked           |
| Other Spotify and mixed gates                      | Many blocked      |
| TikTok, Facebook, X, Apple Music, Twitch, Bandcamp | Not verified live |

Every one of the nine successful destinations returned HTTP 206 to a one-byte
range request. Full music files were not downloaded during validation.
This is a deliberately varied sample, not a population success rate or a
guarantee that any platform's every gate works. Configurations can change.

## Develop

Use Node.js 22.12+, 24, or 26+ according to `package.json`.

```sh
npm ci
npm run check
npm run package
```

`check` runs Prettier, strict TypeScript, offline tests, both builds, and
Mozilla's Firefox package validator. `dist/chrome` and `dist/firefox` contain
unpacked extensions; `release/` contains reproducible browser ZIPs and checksums.
The package has no runtime npm dependencies.

Run browser integration checks with isolated profiles:

```sh
npx playwright install chromium firefox
npm run test:browser
```

Chrome tests cover the real popup, content script, background worker, settings,
and public/blocked/unsafe destinations. Both browsers also verify automatic email
submission/rejection, native Spotify/SoundCloud popup callbacks, live progress,
hidden forms, and the session download request against local fixtures. Chrome
also exercises popup sign-in with normal popup blocking enabled. These are not
real-account authorizations or evidence of all-gate support.
Firefox tests install the real add-on
and exercise its page controls and background fallback. Playwright cannot
reliably inspect Firefox extension documents, so that check does not cover its
popup. Firefox's background HEAD requests are outside Playwright's routing;
its browser test may contact the fixed nonexistent S3 fixture object. Unit tests
are fully offline. CI runs the Chrome integration suite and the Firefox linter.

Manual live diagnostics are opt-in:

```sh
npm run check:live -- https://hypeddit.com/s11n28
```

That command makes one anonymous-only resolution attempt for each supplied URL and verifies
returned links using a one-byte range request. It saves no signed URLs or music.
It never submits email or opens sign-in. Live diagnostics are excluded from routine CI.

Read [architecture](docs/architecture.md), [contributing](docs/contributing.md),
[privacy](PRIVACY.md), [security reporting](SECURITY.md), and the
[REA investigation](docs/research/hypeddit.md).

## License

[MIT](LICENSE). Gatebreaker is independent of Hypeddit and the social platforms.
