# Live Hypeddit coverage — 2026-10-26

Checked 28 public URLs: 25 distinct live download gates and 3 unavailable pages.
The observed skip payload produced a nonempty, provider-allowed destination on 9 gates.
16 gates did not release a destination. All 25 historical public-main-file HEAD probes returned HTTP 403.
All nine resolved destinations were then reissued and verified with a GET request for byte 0 only: each returned HTTP 206, with exactly one byte retained before the stream was closed.

**All Hypeddit gates are not supported.** The supplied Sylver gate remains blocked. Gate step names alone do not predict success: some Spotify-containing configurations resolved, while other Spotify gates refused the same skip request.

## Method

- Sources: current [Hypeddit download charts](https://hypeddit.com/charts/downloads), [music page](https://hypeddit.com/music), and search results restricted to public Hypeddit pages.
- Each distinct gate used a fresh anonymous PowerShell WebRequestSession. Read page metadata; HEAD the observed historical main-object candidate; perform the page-declared `/gate/ge` handshake; submit one form-encoded `/gate/download/ul` skip request matching the provider.
- The payload supplies each declared `nwSteps` code as `skip_gate_steps[]`, with `is_skippable=1`, `gvf=0`, and no email, comment, social account, OAuth token, or personal information.
- A resolution success requires `download_status=true` plus a nonempty HTTPS destination accepted by the current provider policy. Empty-success responses are failures.
- The nine successful cases were resolved once more to obtain fresh signed URLs, then checked with `GET` and `Range: bytes=0-0`, retaining exactly one byte per file and immediately canceling/closing the stream. No complete music file was downloaded or saved. No login, follow, save, comment, donation, email submission, or CAPTCHA action was performed.
- Signed S3 URLs can sign the HTTP method. A HEAD request against a signed GET URL can return HTTP 403 even when GET works; final-file verification therefore uses ranged GET rather than HEAD.
- This checks live protocol resolution and limited file access in anonymous HTTP sessions. Actual extension behavior requires separate browser verification. These observations are not REA runtime evidence; the original REA analysis is documented separately.
- Cookies, CSRF fields, visit tokens, gate request tokens, and full destination URLs are intentionally omitted from the saved JSON and this report.

## Results

| Public page                                                                                                            | Gate ID              | Declared steps | Result                | API status | File GET |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------- | --------------------- | ---------- | -------- |
| [Turn the Tide (VENOMIQUE Schranz Remix) by Sylver](https://hypeddit.com/sylver/turnthetidevenomiqueschranzedit)       | fcmkxx               | email, sc, sp  | server-required       | 200        | —        |
| [Schranz Bearbeiten by Overkilltech](https://hypeddit.com/s11n28)                                                      | s11n28               | sc             | skip-request-resolved | 200        | 206      |
| [INNA - Hot](https://hypeddit.com/jgmzschranz/innahotjgmzschranzreworkfreedl)                                          | gbax4f               | sc             | skip-request-resolved | 200        | 206      |
| [Foggy - Come Into My Dream](https://hypeddit.com/6ldvuo)                                                              | 6ldvuo               | sc             | skip-request-resolved | 200        | 206      |
| [Club Action - Techno / Schranz Remix by MUGLI PROJECT](https://hypeddit.com/qugar2)                                   | qugar2               | sc             | skip-request-resolved | 200        | 206      |
| [Take (free download) by EM@IL](https://hypeddit.com/email-take)                                                       | 5ehywo               | email, sc, ig  | server-required       | 200        | —        |
| [Out Here by Eva Gadd](https://hypeddit.com/evagadd/presave)                                                           | k6fd0b               | sp             | server-required       | 200        | —        |
| [SCREAM](https://hypeddit.com/vzck88)                                                                                  | vzck88               | email          | server-required       | 200        | —        |
| [Restricted Edit by Make Me](https://hypeddit.com/makeme/restrictededit)                                               | f1wza9               | sc, ig, sp     | server-required       | 200        | —        |
| [Only by HilalDeep](https://hypeddit.com/6bvcze)                                                                       | 6bvcze               | sp             | server-required       | 200        | —        |
| [EARLY SUMMER MASHUP PACK by Ghøst](https://hypeddit.com/857xli)                                                       | 857xli               | sc, sp         | server-required       | 200        | —        |
| [More Than You Know Free Your Mind (HALFSTEP Intro Edit) by HALFSTEP](https://hypeddit.com/7meokt)                     | 7meokt               | sc, yt, sp, ig | skip-request-resolved | 200        | 206      |
| [YUSSI - HIGHER [FREE DOWNLOAD] by YUSSI](https://hypeddit.com/yussi/yussihigherfreedownload)                          | nr49k1               | sc, sp         | server-required       | 200        | —        |
| [#ELECTRO HOUSE SAMPLE PACK by Hypeddit](https://hypeddit.com/track/sc/WE1pIM5DlMkLd4xXbHLW)                           | WE1pIM5DlMkLd4xXbHLW | email, sc      | server-required       | 200        | —        |
| [Without You by HYPERKID](https://hypeddit.com/bounceandbass/without-you)                                              | 30pkz2               | email, sc, sp  | server-required       | 200        | —        |
| [Free (WeDamnz VIP Edit) by Ultra Nate](https://hypeddit.com/track/09z1oz)                                             | 09z1oz               | sc, ig, sp     | server-required       | 200        | —        |
| [Hypnotized by Legacy Chill](https://hypeddit.com/legacychill/hypnotized)                                              | 55lhpa               | sc, sp, ig     | server-required       | 200        | —        |
| [track/05764d](https://hypeddit.com/track/05764d)                                                                      | —                    | —              | page-unavailable      | —          | —        |
| [Confront by Calios](https://hypeddit.com/track/0igssh)                                                                | 0igssh               | email, ig      | server-required       | 200        | —        |
| [track/0zzzv4](https://hypeddit.com/track/0zzzv4)                                                                      | —                    | —              | page-unavailable      | —          | —        |
| [track/11wo3r](https://hypeddit.com/track/11wo3r)                                                                      | —                    | —              | page-unavailable      | —          | —        |
| [Universe by FreakNoize](https://hypeddit.com/track/1c5sev)                                                            | 1c5sev               | sc             | skip-request-resolved | 200        | 206      |
| [Internal Contact by FreakNoize](https://hypeddit.com/track/1lpp65)                                                    | 1lpp65               | sc             | skip-request-resolved | 200        | 206      |
| [ISLANDS IN THE STREAM (SPLATA & Rodney Dinkles Remix) by SPLATA & Rodney Dinkles](https://hypeddit.com/track/223t1d)  | 223t1d               | email, sc      | server-required       | 200        | —        |
| [It's No Good - Depeche Mode (Art Attack Remix) FREE DOWNLOAD by ᴀ ʀ ᴛ ᴀ ᴛ ᴛ ᴀ ᴄ ᴋ](https://hypeddit.com/track/233f4q) | 233f4q               | sc, sp         | server-required       | 200        | —        |
| [You Should by Patrick Patrikios](https://hypeddit.com/4yynp6)                                                         | 4yynp6               | yt             | skip-request-resolved | 200        | 206      |
| [Afrobeats Mix 2020 (2Hrs) Youtube by DJ Hol Up](https://hypeddit.com/track/omqdqa)                                    | omqdqa               | yt, dn         | skip-request-resolved | 200        | 206      |
| [Be My Lover (2023 Mix) ft. La Bouche (Instrumental) by Hypaton & David Guetta](https://hypeddit.com/mwgjys)           | mwgjys               | dz             | server-required       | 200        | —        |

## Coverage limits

Live step codes found: `dn`, `dz`, `email`, `ig`, `sc`, `sp`, `yt`.

Successful sampled configurations included SoundCloud only (`sc`), YouTube only (`yt`), YouTube plus an optional donation (`yt,dn`), and a mixed `sc,yt,sp,ig` gate. Email-only and Deezer-only samples were blocked, as were many Spotify and mixed configurations.

TikTok, Facebook, X/Twitter, Apple Music, Twitch, Bandcamp, other step codes, custom domains, password/payment gates, and other layouts were not validated live in this sample. Fixture tests for a step code cannot establish live service support.

This is a purposive sample, not a random sample or a population success rate. Results can change with provider configuration, expiration, request limits, and service changes. The limited GET probes establish access to the nine files at the stated times; they do not verify complete file integrity or guarantee future transfer success.

## Reproduce

`probe-live.ps1` is a manual, opt-in network diagnostic. Run it only when investigating provider compatibility; do not add live service probes to routine CI. It sends at most one skip request per distinct gate per run. `-Resume` retains existing rows and skips previously completed URLs.

`verify-files.ps1` repeats resolution only for the nine previously resolved cases, then makes the one-byte GET checks. It writes `verified-files.json` with status, MIME type, Content-Range, retained-byte count, and no signed URLs.

The accompanying `live-results.json` records requested URLs, UTC timestamps, public gate IDs, titles, step declarations, status codes, and sanitized result classifications. `chart-links.json` pins the chart URL sample used for this run.
