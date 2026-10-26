# Gatebreaker

A TypeScript browser extension that tries to reach the original download on
Hypeddit without sharing an email address or connecting social accounts.
MIT licensed, with a provider interface for adding other gate services.

**Support is partial.** On 2026-10-26, 9 of 25 distinct live gates returned
working downloads; 16 remained blocked. Three additional URLs were unavailable.
The supplied Sylver / Turn the Tide example is **not bypassed** by this release.
See the [full live results](docs/research/live-coverage.md) and [deeper blocked-gate investigation](docs/research/blocked-followup.md) before installing.

## Install

Download the [v0.1.0 browser packages](https://github.com/DavidNiessen/gatebreaker/releases/tag/v0.1.0)
or build them locally. Releases include separate Chrome and Firefox ZIPs and
`SHA256SUMS`. These packages are for manual installation; they are not browser
store listings or a signed Firefox add-on.

### Chrome 120+

1. Extract `gatebreaker-0.1.0-chrome.zip` into a folder you will keep.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the extracted folder containing `manifest.json`.
4. Reload any Hypeddit tabs that were open before installation.

### Firefox 140+

1. Extract `gatebreaker-0.1.0-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**.
3. Select `manifest.json` inside the extracted folder.
4. Reload existing Hypeddit tabs. Temporary add-ons are removed when Firefox restarts.

A permanent installation on standard Firefox requires Mozilla signing. This
release does not claim store approval. Android's manifest minimum is 142;
mobile browser behavior has not been tested.

## Use

Visit a supported `https://hypeddit.com/…` download page and click **Try skipping
gates** in the Gatebreaker panel or extension popup. If a usable URL is returned,
choose **Open download**. The extension waits for your click; it does not
automatically download files or act on social accounts.

Use the popup's **Enabled** checkbox to hide the panel and stop new resolution
requests. Disabling also cancels the active provider request where possible and
discards its result. The original website remains usable.

If Hypeddit enforces the steps on its server, Gatebreaker explains that no link
was released. It does not treat a hidden form, completed carousel, empty API
success, or audio preview as a successful bypass. Reload the page if a session
expires; wait if the service limits requests. Custom-domain, Link, password,
payment, CAPTCHA and account-protected gates are not claimed as supported.

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
and public/blocked/unsafe destinations. Firefox tests install the real add-on
and exercise its page controls and background fallback. Playwright cannot
reliably inspect Firefox extension documents, so that check does not cover its
popup. Firefox's background HEAD requests are outside Playwright's routing;
its browser test may contact the fixed nonexistent S3 fixture object. Unit tests
are fully offline. CI runs the Chrome integration suite and the Firefox linter.

Manual live diagnostics are opt-in:

```sh
npm run check:live -- https://hypeddit.com/s11n28
```

That command makes one resolution attempt for each supplied URL and verifies
returned links using a one-byte range request. It saves no signed URLs or music.
Live diagnostics are excluded from routine CI.

Read [architecture](docs/architecture.md), [contributing](docs/contributing.md),
[privacy](PRIVACY.md), [security reporting](SECURITY.md), and the
[REA investigation](docs/research/hypeddit.md).

## License

[MIT](LICENSE). Gatebreaker is independent of Hypeddit and the social platforms.
