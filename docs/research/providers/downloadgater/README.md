# DownloadGater — provider integration, 2026-10-29

The adapter handles current `/g/<id>` download gates through DownloadGater's
native HTTP preflight and first-party SoundCloud/Spotify consent. The final file
is the provider's original `/api/download/<id>` route, never its audio preview.
HTTP 204 from the exact `preflight=1` request is required before releasing that
route. HTTP 200 JSON, a refused check, a popup closing, or a stored receipt alone
does not grant a download.

## Evidence

Public shipped sources were fetched directly from DownloadGater and analyzed as
inert text with REA. Parent Evidence:
`ev_59f3eda3dc30811351f8889bc8d180a2f18e1b0092213df7d52746fdb5bf357b`.
Summary Evidence:
`ev_5b89accfbbfe266eb52f49d72e81c007a517c9b637790c3c7f0c256959fbe8`.
The selected four modules total 115,146 UTF-8 bytes, parsed without failures and
without semantic-node truncation. Runtime/framework behavior remains partial;
two inventoried files were outside the selected analysis. Source digests and
fresh live probe results are recorded in [live-matrix.json](live-matrix.json).

The same original three gate modules match their 2026-10-27 hashes. The added
`remoteStorage-YU6vGPtF.js` establishes the native email endpoint. The reference
project's `src/downloadgater.ts` was consulted for comparison at commit
`983fc2ce025b436a5692a4ccc8700c3e90251df9`; no GPL implementation code is copied.

## Implemented native contracts

- Exact public gate bootstrap: `script#__GATE_DATA__[type=application/json]`,
  `kind:gate`, matching `link.id`, known native asset and `#root`. Creator contact
  objects and preview/file internals are not exposed as gate metadata.
- The site consumes its bootstrap after hydration. On Download, the adapter can
  refetch only the exact same-origin gate HTML through the injected inert parser.
- Required email: `POST /api/links/<id>/email` with only the configured
  `gatebreakeros@proton.me` address. This requires explicit automation and a
  successful JSON response. No analytics or visit endpoint is called by the adapter.
- Native authorization: `POST /api/soundcloud/start` with `linkId` and, when
  declared, the user's reusable `soundCloudComment`; Spotify uses
  `POST /api/spotify/start` with `linkId`. The returned first-party authorization
  URL must use the known service origin, code response type and DownloadGater's
  exact owned callback. Original page controls and event handlers remain untouched.
- The extension background owns a dedicated consent tab and tracks its browser tab
  ID across cross-origin opener isolation (COOP). It reads only the documented
  native sessionStorage receipt after that exact tab returns to the same gate;
  it never injects code or reads storage on account origins. A short heartbeat
  lease, exact parent tab/document ownership, cancellation and a two-minute
  deadline reject unrelated or stale callbacks. The provider's own callback page performs SoundCloud
  continuation and stores its opaque gate receipt in
  `downloadgater.soundcloudUnlock.<id>` or `downloadgater.spotifyUnlock.<id>`.
  Receipt records have a 14-minute native lifetime. Account OAuth credentials are
  never read or copied by this adapter. The opaque gate receipt remains in active
  memory; it is not written to extension storage.
- Final preflight: `GET /api/download/<id>?preflight=1`, with same-origin
  credentials, cache disabled and redirects rejected. Native SoundCloud receipts
  use `soundcloudToken` plus `token`; Spotify receipts use `spotifyToken`. These
  query fields are gate receipts, not account OAuth tokens. Rejected receipts
  cannot repeatedly satisfy the login action. Signed/native result URLs are private.
- The host owns file delivery. The returned original route retains the provider's
  tokens, and approval is rechecked after every manual sign-in. Cancellation closes
  only the extension-owned popup and aborts pending native start requests.

Paid downloads, unsupported unprotected-file layouts, arbitrary verified-provider
actions and manual upstream SoundCloud failures remain with the native website.
The adapter does not invent comments or substitute previews. First-party consent
may perform real follows, likes, reposts or public comments; users review the
provider's requested actions and supply their own comment text.

## Validation boundary

Forty authored unit tests cover route/model validation, exact 204 approval, safe native
query construction, email automation, hydration, paid/unsupported refusal, scoped
receipts and expiry, authorization URL validation, owned-tab completion, COOP-independent recovery,
wrong-document/tab rejection, callback navigation races, lease expiry and cancellation.
The installed-extension fixture script additionally covers email/preflight, consumed
bootstrap recovery, refusal and COOP-isolated SoundCloud and Spotify consent callbacks; all
network replies are authored and media delivery is intercepted. They use synthetic account/receipt values, not real accounts.
These five installed-extension cases pass in isolated headless Chrome and Firefox.
The authored callback uses a document navigation to keep Firefox's redirected
document inside Playwright interception; this does not validate the live server's
OAuth redirect chain.

Fresh public inspection detected all twelve sampled live gates. Every anonymous
metadata-only preflight returned 403 `soundcloud_unlock_required`. No authorization,
email, social mutation, payment or media body was requested in the live probe.
Native account-required completion is implemented and fixture-tested, but remains
unverified with a real account. The twelve refusals are not presented as twelve
successful downloads or proof that all provider gate combinations are supported.

## Live placement fix, 2026-10-29

A real hydrated Crowd Voices page exposed a defect in the original heading
anchor: its release title is absolutely positioned inside the native artwork
layout. The extension panel was clipped and the fixed site header intercepted
Download. The adapter now places its panel at the beginning of the normal-flow
landing content, ahead of related downloads. The generic presentation port can
request insertion before an anchor; all existing adapters retain after-anchor
placement by default. Native hero sizing and native controls are unchanged.

The authored fixture now reproduces the clipped absolute title. It failed a real
pointer click with the old implementation and passes all five cases in Chrome
and Firefox with the fix. A fresh live build also passed preparation, showed the
required SoundCloud control and locked Download. The native hero and action area
remain 430px tall; desktop and 390px mobile renders were reviewed, with no mobile
horizontal overflow. See [live-placement.json](live-placement.json). Final real
account approval and download remain unverified; no new login was attempted.
