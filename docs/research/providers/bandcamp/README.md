# Bandcamp artist-issued free originals — 2026-10-29

This adapter supports artist release pages at `https://<artist>.bandcamp.com/album/<slug>`
and `/track/<slug>` only when Bandcamp's current release metadata issues a matching
free download grant. It also accepts a user-opened, signed native download receipt
with an already authorized free or paid item. Purchases, subscription access,
email collection, name-your-price checkout and custom artist domains are outside
this adapter. No reference-project implementation code is copied.

## Native contract

The public product's `[data-tralbum]` JSON supplies the current ID, item type,
title, `download_pref` and `freeDownloadPage`. A genuinely free release has
`current.download_pref === 1` and a signed grant tied to that same release ID and
album/track type. Zero `minimum_price` alone is insufficient. Conversely, the
checked free album has minimum price 9 and preference 1. Track preview
`trackinfo.file` is never an original-download grant.

After the user presses Gatebreaker's Download, the adapter fetches the issued
`https://bandcamp.com/download?fsig=…&id=…&ts=…&type=…` HTML as inert text. Its
`[data-blob]` JSON must contain exactly one matching `download_items` item, with
`is_pure_free: true` or an existing `paid_for: true` receipt. Only original-format
`downloads` entries are considered. FLAC is preferred, then WAV and the other
native encodings; album originals are delivered as the native ZIP.

The shipped native client changes an issued
`popplersN.bandcamp.com/download/(album|track)` URL into `/statdownload/…`, preserving
`enc`, `fsig`, `id`, `ts` and adding a random `.rand` nonce plus `.vrs=1`. Its status
reply must refer to that exact request, including the nonce. Only `result: "ok"`
releases `download_url` or the issued original URL. The native reply can be JSON
or the exact legacy `if (window.Downloads) { Downloads.statResult(JSON) };` wrapper;
the adapter extracts JSON without executing it.

Live checks found that even a fresh free grant can return
`ExpiredFreeDownloadError` with a renewed `retry_url`. The shipped client repeats
the status check with that grant. Gatebreaker permits one renewal only, requiring
the same popplers origin, item type, release ID and original encoding. Other
refusal/expiry cases remain failures. Released CDN destinations are limited to
native `pN.bcbits.com`/`tN.bcbits.com` original `/download/(album|track)/…` paths,
or the exact issued popplers original. Preview streams are excluded.

The extension uses a private background GET transport for the cross-origin grant
and status endpoints. It accepts only same-extension top-frame messages from a
supported Bandcamp release/receipt, and only fixed signed grant and status routes.
Requests omit credentials, reject redirects and have deadlines and body limits
(2 MiB HTML, 64 KiB status). The live free protocol succeeded without cookies.
This is not a browser-cookie or arbitrary URL proxy. Native buttons retain their
manual flow; inspection makes no requests.

## Evidence and limits

`artifacts.json` records source identities and REA Evidence. The focused
79,888-byte shipped client parsed to 11,072 AST nodes with zero failures and no
truncation. REA's static graph remains partial: framework/runtime/server behavior
and four other inventoried artifacts are outside the selection. REA did not
execute the client.

The implemented resolver was checked live on the artist-issued Olenergy free
album: grant HTML GET, status expiry, one signed renewal, status success releasing
the original on `p4.bcbits.com`. No media body was fetched. The paid Jayso track
and the misleadingly named `2at2at` free-track candidate had priced metadata and
were refused without a grant/status request. Signed values are excluded from
this report and the saved matrix.

45 authored unit/transport tests cover release/receipt binding, paid refusal,
original encodings, renewal, expiry, wrong nonces, unsafe destinations, previews,
cancellation, sender validation, credential omission and transport limits.
Installed-extension authored fixtures cover album/track/receipt success, one
renewal, paid/preview/unsafe/status refusals and untouched native buttons.
All eight cases passed in isolated Chrome and Firefox profiles; the Chrome popup
also reflected the approved original. `validation.json` records the checks.
Fixture delivery is intercepted at the browser downloads API; synthetic signed
originals are never downloaded.

Live free-track completion, purchased receipts and account/subscription/payment
completion remain **unverified**. This is scoped free-original support, not full
Bandcamp checkout or account support.
