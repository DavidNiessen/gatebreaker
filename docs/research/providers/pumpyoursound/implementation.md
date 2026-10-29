# PumpYourSound adapter — 2026-10-29

The adapter recognizes the current native `/f/<owner>/<slug>/<numeric-id>` forms
and the released `.fangateDownload[data-redirect-link]` result. It uses native HTTP
requests after Download, then requires a verified result page and a safe released
destination. Audio-player `data-stream` values are never download candidates.

## Coverage and limits

`adapter-matrix.json` records ten current public gates. All ten produced matching
native models through inert HTML inspection. They cover SoundCloud, user comment,
Spotify, Instagram, Facebook and YouTube declarations. No live accounts, comments,
social mutations, form submissions or destination requests were used in that pass.

The original eight anonymous native-form probes in `live-matrix.json` remain
historical refusal evidence. A same-gate `_fid` flash redirect does not grant a
download. The new adapter explicitly rejects that case. Matching the page or
implementing a callback is not a live account-completion claim.

- Released native result pages are supported without an account submission.
- Declared Instagram/YouTube/Facebook ordinary steps use only the exact observed
  same-origin URL for that gate, and require a freshly rendered `done` state.
- Native form submission sends `_do=freeDownloadForm-submit`, `send=Download`, a
  declared anti-CSRF field if present, the configured email only when the native
  email field exists, and only explicitly user-supplied comment text.
- Required SoundCloud login uses the website's own SC SDK in a narrowly scoped
  MAIN-world function. This preserves the registered redirect and native token
  exchange. Its follow/comment HTTP calls run entirely within that page world;
  credentials are not returned to the extension host/core/CLI, logged or persisted
  by Gatebreaker. Native Nette AJAX can update the website's own snippets.
- The extension preopens its owned blank window during the user's sign-in click
  so background scripting does not need to invent user activation. Missing SDK,
  blocked popup or unconfirmed account state fails and offers retry/native flow.
- The background boundary accepts only same-extension, top-frame messages on an
  exact supported gate, bounded operation/comment fields and the original document
  when document IDs are available. An operation marker on the original form also
  rejects stale injection after document replacement when only frame IDs exist.
  Only fixed provider code can execute.
- The account step is complete only after a fresh same-origin HTML read confirms
  the declared steps. The final form still needs the server's released result.
- Spotify uses the native `spotify-follow` route, then checks the fresh gate state.
  Its real-account completion, like SoundCloud's, remains **unverified** here.
- Unknown native step kinds, changed credential contracts, unsupported redirects,
  refused account actions and invalid results remain explicit failures. Released
  Bandcamp/other website rewards remain page destinations rather than audio files.

The root background entrypoint must import `pumpYourSoundMessage` from
`src/extension/providers/pumpyoursound/native-job.ts` and delegate its two private
message types before unrelated handlers. No new core capability port is required.

## Native source and REA

Public scripts acquired from PumpYourSound on 2026-10-29:

| Script                                          | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `/js/main.min.js?csv=1792946038`                | `5a24a8333e5605aadade253809e8e6aba0addb9814f946a676220f7961b88dd0` |
| `/js/internal_components.min.js?csv=1792946038` | `6bfc30f95a211b8d3b53278f8c9af2edaf2b2d3b18103d35a64aba7f3c8f84cd` |
| `/js/sc-sdk-2.0.0.js?t=1793125734`              | `16cfdbc8cbddde10143a87db765de28ff759bd9ec2d6b26f96bbe1d12bfe6e4a` |

REA parent: `ev_a9a531046b8b4162c5c5f99ff4f44c9a955121fc0cf9965da8c3d2f4316199c7`.
Summary: `ev_152f0d100e3fa00a9c8dc69f0d00245ea5a707c24e6fd748418a0bfa8d5000fc`.
Three selected scripts, 181,263 source bytes, zero parse failures. One then-inventoried
HTML file was outside the source selection. Application/semantic relationships
remain partial/unknown because the scripts use dynamic jQuery/SDK machinery; this
static evidence does not establish backend behavior or successful live OAuth.

The native `SC.connect` code uses a registered code/PKCE flow and callback owned by
PumpYourSound. `main.min.js` then reads the provider's access/refresh/expiry endpoints
and invokes the selected native action. The current action URLs contain only the
access-token placeholder, so Gatebreaker does not read unused refresh-token or
expiry fields. The adapter never sends account values to a separate resolver.

Reference behavior was compared with sc-gate-dl at commit
`983fc2ce025b436a5692a4ccc8700c3e90251df9`; no reference implementation code is copied.
The TypeScript implementation is original and follows current shipped contracts.

## Authored verification

Unit tests cover route/model validation, native form fields, signed destinations,
Bandcamp page rewards, unsafe URLs, `_fid` refusals, unsupported redirects, ignored
previews/default comments, ordinary-step confirmation, cancellation, SDK-owned
authorization, popup denial, token confinement and private sender/document checks.
These are authored fixtures and cannot replace live-account completion evidence.

The installed Chromium and Firefox 157 extensions passed four authored intercepted-site cases:
ordinary final release, same-page flash refusal, Instagram confirmation and an
SDK-owned SoundCloud popup/callback followed by native HTTP approval. The tests
assert zero native-control clicks, no preview/media requests, and no credentials
in panel output or page storage. The isolated Firefox run recorded three intercepted
file-delivery API calls and zero page rewards. Its copied build was compiled from
the final source including the original-form operation marker. Real
SoundCloud/Spotify completion remains unverified.

Compatibility follows the platform's available document identity: Firefox before
153 provides neither sender `documentId` nor scripting `documentIds`, so the helper
uses frame 0 with its original-form operation guard. This boundary is based on
[MDN's scripting compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/scripting.json)
and [runtime compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/runtime.json).

## Real authorization-start follow-up

The current Kenaj gate was opened in the isolated real Chrome diagnostic profile
with the unmodified v0.12.0 extension. After declining optional cookies through
Cookiebot's own control, Gatebreaker Download showed the required SoundCloud
sign-in and kept Download disabled. Its native-SDK handoff reached SoundCloud's
real `/authorize` page, which required account login. REA performed and recorded
the declared preparation and sign-in actions without response interception.
See [live-auth-start.json](live-auth-start.json). This verifies the real SDK entry
path and waiting controls, **not** account completion or file delivery. The
remaining test requires the user to sign into SoundCloud and review consent.
