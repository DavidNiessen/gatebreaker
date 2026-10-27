# Privacy

Gatebreaker has no telemetry, analytics, Gatebreaker accounts, or external resolver service.
It does not acquire passwords or OAuth tokens, call social APIs itself, generate comments, or accept
lifetime-library marketing opt-ins.

Inspection makes no email, acknowledgement, or sign-in request. Automatic processing starts
only after Download, once required sign-ins are complete. On Hypeddit it submits a random
dictionary word at `icloud.com` through the native handler, including optional email, and waits
for acceptance. A rejection stops the flow; an explicit retry selects a different word. A missing
first name is filled with `Listener`; an existing name is preserved. The word is selected from
a finite dictionary using browser randomness and is not a unique or verified address. It may
correspond to an existing mailbox; Gatebreaker does not create or control it or receive messages.
No personal data is used to generate it, and the site may reject it.

Sign in with Spotify/SoundCloud invokes Hypeddit's own control; PUSH.fm uses its own Spotify control. The provider's login and consent
window appears while the original gate forms remain hidden. Review the permissions, follows, and
saves Hypeddit requests: its authorization may perform those account actions. Gatebreaker never
copies provider credentials, website callback values, or tokens into extension storage. Hypeddit,
the provider, and the browser manage sessions and expiration; cross-site login reuse is not guaranteed.

The extension inspects metadata on supported gate pages. Resolution starts when the user requests
it. Sub2Unlock reads its embedded destination without a network request. Boost.ink may refetch only
the current gate HTML without credentials. Rekonise uses the public metadata and unlock GETs on
`api.rekonise.com`, without credentials, after a cancellable wait. These adapters do not submit
email, social actions, or provider analytics. Hypeddit can make same-origin requests and public-file
checks against the narrowly configured S3 host. These requests disclose the browser’s IP address and requested
resource to the destination server. Provider requests may use the browser’s existing site session
under normal browser cookie rules. After a native action, requests include known ordinary form fields
such as the email placeholder and artist/profile IDs. Gatebreaker does not send page data to a
separate bypass proxy. The extension does not request recovered destinations during resolution.

Valorizd uses Google's Firestore service for a read-only query of the current
gate's exact slug in the fixed public project. A field projection excludes creator
profiles and contact objects; no API key, account cookie, auth header, social action,
email registration, unlock statistics, or notification write is supplied. Google's
service receives the browser IP and public gate query. PUSH.fm first uses credential-free
metadata and an empty-action reward GET. After Download, a refused reward may trigger
the exact native acknowledgement POSTs for Twitter, YouTube, SoundCloud, Instagram,
and TikTok, using the page CSRF and ordinary same-origin session. These native click
steps return opaque gate receipts; they do not connect an account or call social APIs.
Required Spotify authorization still opens PUSH.fm's consent window only on your
sign-in click. Only its same-origin gate receipt and native completion state are
observed, not Spotify OAuth credentials. Gate receipts stay in the current page's
memory for the final native reward GET. No profile window, email, telemetry, or
conversion API is invoked by this adapter. Unsupported steps may still refuse access.

Rekonise's public gate token stays in the active request's memory; it is not an account token.
Gatebreaker does not save native unlock passes or copy creator contact objects. Recovered URLs,
signed file parameters, and MEGA keys are kept only in the active page/popup state needed to present
the result. They are not written to extension storage or telemetry.

Multiple released files use a native chooser; filenames and signed addresses exist
only in the current result and popup/page memory. Choosing a file changes the
explicit opening link. It does not request that file or save the choice to storage.

The enable preference is the only value persisted in the browser’s local extension storage. Native
progress and the generated email remain in the current content script's memory and website form.
The preference is not synchronized
through a Gatebreaker service. Removing the extension removes its extension-local settings according
to the browser’s normal behavior. This does not clear provider cookies or revoke authorizations.
Cancel check, navigation, and disabling abort active resolution where possible and discard stale
results. Disabling also prevents new native actions, but cannot
recall an email or authorization already handed to Hypeddit.

Gatebreaker presents an available download link for the user to open. It does not automatically start
downloads. Opening a link or visiting a provider can invoke that destination’s own privacy practices;
the extension does not control the website’s cookies, analytics, links opened by its native handlers,
or account features.

Browser host permissions are limited to supported provider origins and the fixed public-file probe
host. `activeTab` supports the current-tab interaction, and `storage` stores the local enable
preference. Consult the generated manifest for the exact permissions in a particular release.

Issue reports are optional and public unless submitted through a private security-reporting channel.
Remove email addresses, cookies, authorization headers, signed private URLs, and other personal
information before sharing a report or fixture.

Google documents Gmail username limits in [Create a username](https://support.google.com/mail/answer/9211434?hl=en).
