# MyPressKit native gate adapter — 2026-10-29

The implemented adapter supports current `/gate/<handle>` pages on the explicit
`www.mypresskit.info` and `mypresskit.info` hosts. It parses matching Next Flight
gate props as inert JSON, requires the native gate-page script, and excludes
creator/contact objects, cover URLs and the preview from public gate metadata.
No reference-project implementation code is copied.

## Observed protocol

The current shipped gate chunk uses these same-origin routes:

- `GET /api/download-gates/<id>/verify-step` returns remaining/completed step
  indexes, an unlock decision and an optional download token.
- Ordinary Facebook, Instagram, Twitter, TikTok and YouTube click steps use
  `POST .../track-step` with only `stepIndex`. Gatebreaker sends the HTTP
  acknowledgment after Download, without clicking/opening the original controls.
  Email capture uses `POST .../email` with `stepIndex` and the configured fixed
  `gatebreakeros@proton.me` address.
- Account steps use the native `/api/download-gates/oauth/soundcloud/start` or
  `/api/download-gates/oauth/spotify/start` route, with `gate`, `step`, `popup=1`,
  and the user's configured text for a required SoundCloud comment. Native combined
  SoundCloud mode uses `combo=1` instead of an individual step index. Users must
  review requested account actions and complete login/consent themselves.
- Only a fresh server verification marks the account action complete. Popup
  closure or a page message does not prove authorization. The extension polls the
  same-origin verifier, closes only its owned window after confirmation, and
  cancels its polling on cancellation.
- Both `unlockState.unlocked: true` and a bounded nonempty server token are
  required before returning the fixed original endpoint
  `/api/download-gates/<id>/download?token=...`. Neither an isolated token nor a
  locally completed step authorizes delivery. `/preview` is never returned as the
  original. The adapter does not fetch a file body while resolving.

The gate component's `/visit` analytics call is outside the adapter and is not
replicated. Unsupported step types are not sent to the ordinary-step endpoint.
Repeated unconfirmed acknowledgments are bounded to one attempt per page session;
rate limits and stale sessions remain failures.

## Evidence and validation

`artifacts.json` records source URLs, byte identities and REA Evidence. The focused
15,277-byte gate chunk parsed without failures or truncation; its static graph is
partial because dynamic/framework/server behavior and 18 other inventoried files
are outside the selection. REA did not execute the analyzed script. Its protocol
observations were independently corroborated by read-only native verification.

The creator-linked DJ Felge/Kluge gate returned public HTML and a successful
verification response declaring all five SoundCloud steps still required, with no
download token. The adapter correctly returned `server-required` after one GET.
No email, OAuth start, comment, follow, repost, preview or media request was made.
The public sitemap and two creator artist pages yielded no additional gate links;
this is one live gate, not a broad end-to-end account coverage claim.

31 authored tests cover route/Flight validation, mismatched or duplicate models,
ordinary/email request contracts, fresh unlock grants, token validation, native
SC/Spotify/combo preparation, user-supplied comments, approval polling, cancellation,
rate limits and malformed responses.

Real SoundCloud/Spotify account completion and delivery of this live gate's file
remain **unverified**. The original token endpoint's behavior after real account
approval is source-derived and fixture-tested; live account/cookie requirements
for that endpoint were not inferred away. Native authorization can perform actual
follows, likes, saves, reposts or the configured public comment.
