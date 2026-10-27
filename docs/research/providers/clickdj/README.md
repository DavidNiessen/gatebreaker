# Click.dj investigation — 2026-10-27

Click.dj has genuine historical SoundCloud download links. Ten distinct creator-linked
gates were checked, covering artist/track routes, a short `/d/17g` route, and a single
segment route. All ten bounded HTML GETs timed out after 10–15 seconds in this
environment. The homepage also timed out. This is an availability observation, not
proof the service can never recover or that every historical file is gone.

A separate REA browser scenario followed the native `www.click.dj` redirect for
`/akihabara/kairi`. The www document returned HTTP 301, then the apex document
returned Cloudflare **522** after about 20 seconds. The error page loaded only
Cloudflare CSS/icons; no music-gate application code was obtained.

REA Evidence: `ev_8b7f081219a38e24df1a181354a971630ee2e358049a53a298025dc5cb865638`.
The controlled Chromium scenario captured URL/network metadata only: no request
bodies, response bodies, header values, storage, or DOM. It retained 24 events with
zero drops, and terminated its owned browser. It proves the declared runtime result,
not the original gate's behavior when its origin is healthy.

No adapter is proposed: there is no current gate script or released destination
to reconstruct reliably. `live-matrix.json` records seven gate URLs plus the
homepage; `followup-matrix.json` adds three Click.dj gate URLs. Those records link
each gate to its public SoundCloud creator page. No media download, account,
social action, email submission, or action-completion endpoint was used.

The same small follow-up checked four historical TuneBoost download URLs and its
homepage, which failed or timed out. That is a separate bounded availability check,
not a reverse-engineered TuneBoost implementation or a claim of general shutdown.
