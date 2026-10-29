# StillHype native HTTP integration, 2026-10-29

The adapter recognizes published `/g/<slug>` campaigns from inert Next Flight
JSON. It never evaluates page scripts or returns the campaign preview or an
unapproved embedded download URL. Only `/api/gate/unlock` returning a safe
`download_url` authorizes delivery; `is_external_download` preserves URL rewards.

After Download it initializes the exact campaign's native fan session, submits
required email using `gatebreakeros@proton.me` and `Listener`, and acknowledges
supported ordinary Instagram, TikTok, Twitter, YouTube and website steps. Native
multiple-account unit IDs are preserved. Unknown required steps stop processing.
Inspection alone makes none of these requests. Existing native controls are
unchanged. A native fan ID may be read from the exact campaign's localStorage key;
Gatebreaker does not persist or expose it as metadata.

SoundCloud follow, like, repost, comment and bundle steps use `/sc-action`.
Required comments use only the user's configured text. A `needs_auth` response
shows StillHype's own SoundCloud consent. Only `/verify-action` with
`verified:true` completes the step; popup closure and page messages cannot approve
it. Polling is bounded and cancellable. A provider response requiring a manual
SoundCloud action remains a clear refusal rather than a fabricated completion.
Real account operations and that manual verification branch remain unverified.

## Evidence and coverage

[Source identities and REA evidence](artifacts.json) identify the two current
shipped modules. They parsed without failures or semantic truncation. Dynamic
framework/server relationships remain partial; three inventoried files were not
selected. Source analysis was inert, with no execution of downloaded scripts.
The GPL reference was consulted only for behavior at commit
`983fc2ce025b436a5692a4ccc8700c3e90251df9`; no implementation was copied.

[Eleven public pages](live-matrix.json) were recognized, covering separate
SoundCloud actions, bundles, email and ordinary social steps. All required an
account or comment, so no live email, social action, OAuth or media request was
submitted. This is detection coverage, not eleven successful downloads.
Authored tests cover fresh server grants/refusals, unsafe destinations, missing
comments, unknown steps, cancellation and the sign-in continuation. Installed
browser fixture results are recorded in the provider expansion report.

## Real email-session correction, 2026-10-29

The live Mylan Westers gate accepted `/submit-email` with HTTP 200 but returned a
different fan UUID from the anonymous initialization. The original adapter
rejected that legitimate identity transition. The native email component passes
the response's `fan_id` to its completion callback without requiring equality.

Gatebreaker now processes required email before ordinary or account actions,
validates the returned UUID, and accepts the server-issued identity. On a change,
it clears anonymous completion state and confirms the new ID through native init
before loading its server-confirmed completions. It never carries old completed
steps into a different fan session. Invalid or unconfirmed replacement IDs still
stop processing, and the final unlock response remains required.

Five regression tests cover a replacement identity, identity-before-action
ordering, refreshing completion state, malformed IDs and a mismatched refresh.
The installed Chrome and Firefox fixture suites also include the transition.
A fresh real browser run passed init -> email -> confirming init -> sc-action,
then showed required SoundCloud sign-in with Download disabled. No OAuth or file
request followed. See [live-email-session.json](live-email-session.json). Real
account completion remains blocked by the user's reported SoundCloud CAPTCHA.
