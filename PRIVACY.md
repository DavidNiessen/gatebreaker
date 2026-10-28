# Privacy

Gatebreaker has no telemetry, analytics, Gatebreaker accounts, or external resolver service.
It does not acquire passwords or OAuth tokens, call social APIs itself, generate comments, or accept
lifetime-library marketing opt-ins.

Inspection makes no email, acknowledgement, or sign-in request. Automatic processing starts
only after Download and waits for required sign-ins before the final download. On Hypeddit it submits `gatebreakeros@proton.me` through the native HTTP verification endpoint, including optional email, and waits
for acceptance. A rejection stops the flow; an explicit retry reuses the same fixed address. A missing
verification name is sent as `Listener`; an existing name is preserved. Native input fields are unchanged. This fixed address is not verified or owned by Gatebreaker. It may
correspond to an existing mailbox; Gatebreaker does not create or control it or receive messages.
The site may reject it.

Supported sign-ins open source-confirmed native consent addresses directly, without clicking site controls. The provider's login and consent
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
separate bypass proxy. After an explicit Download, successful file rewards are handed to the browser
download manager automatically; URL rewards open in a new tab.

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

Every released file in a multi-file reward starts automatically after Download.
Filenames and signed addresses remain in active result memory and the browser
download manager; the extension does not save them to its own storage. The chooser
and links remain available for retry.

Local extension storage holds the enable preference and a Hypeddit-only Spotify
reuse hint containing a format version and confirmation timestamp. It becomes
eligible only after a native Spotify return and final server-approved file result,
expires after thirty days and refreshes after confirmed reuse. It is a convenience
preference, not an authentication credential. On later Download actions the native
provider window can reuse its normal browser session; login or new consent may
still be required. Gatebreaker never accepts that consent automatically.

Session-only extension storage holds bounded in-flight popup ownership: tab/window
and operation IDs, the public gate origin/path, deadlines and return/closure times.
These records let cancellation recover after a background-worker restart. They
contain no authorization URL, OAuth state, token or cookie, and are removed when
the operation ends. Native progress and the configured email remain in the active
content script's memory. These preferences are not synchronized
through a Gatebreaker service. Removing the extension removes its extension-local settings according
to the browser’s normal behavior. This does not clear provider cookies or revoke authorizations.
Cancel check, navigation, and disabling abort active resolution where possible and discard stale
results. Disabling also prevents new native actions, but cannot
recall an email or authorization already handed to Hypeddit, or a download already
handed to the browser. Cancelling prevents remaining automatic file starts.

Gatebreaker automatically starts validated files or opens a URL destination after
your Download request succeeds. Browser policies and download protections still
apply, and the browser may retain its usual download history. Opening a link or visiting a provider can invoke that destination’s own privacy practices;
the extension does not control the website’s cookies, analytics, links opened by its native handlers,
or account features.

Browser host permissions are limited to supported provider origins and the fixed public-file probe
host. `activeTab` supports the current-tab interaction, and `storage` holds the local preferences and nonsecret temporary popup ownership described above. The `downloads` permission starts requested file rewards without a second click;
the extension does not inspect your previous downloads. Consult the generated manifest for the exact permissions in a particular release.

Issue reports are optional and public unless submitted through a private security-reporting channel.
Remove email addresses, cookies, authorization headers, signed private URLs, and other personal
information before sharing a report or fixture.

PUSH.fm can restore a completed action from its own existing cookie for the current
gate only when its native Spotify control also shows completion. Gatebreaker parses
only that exact gate's known receipt shape, keeps the unchanged opaque receipt in
active page memory, and still requires the final server lookup. It does not create
the cookie, store a Spotify-login flag, collect OAuth credentials, or transfer
completion to another gate. Routine completion logs and the generated email are
not displayed in the panel or popup; only failures appear in the inline notice.

GateRush uses same-origin HEAD and source-confirmed CSRF POSTs after Download. Its required email uses the same fixed address; a requested name uses its local part, `gatebreakeros`. Droploud reads its own existing per-track or general session UUID without writing storage, then invokes its exact native API with normal credentialed CORS. Fresh anonymous UUIDs stay in memory. Required user-written comments and unsupported consent steps are not generated. New authorization receipts require the owned consent window or a source-confirmed native HTTP status; final server approval remains necessary.

Hypeddit sign-in checks retain only a pending window handle, callback path and
nonsecret completion flag in the current document for up to two minutes. A closed
handle or focus return requests bounded HTTP verification and does not prove a
login. Cancel or disabling aborts those checks; OAuth credentials are never read.

After you explicitly open Hypeddit sign-in, Gatebreaker may repeat
the ordinary download check with bounded backoff to recover a missed callback.
This stays within six checks per two-minute attempt and stops on cancellation;
it does not submit new authorizations or transmit data to additional services.

Hypeddit final website-session requests also forward the native page-scoped
external identifier and hypesource/adcode attribution fields to Hypeddit, matching
its own download form. Only the current gate identifier is parsed from literal
configuration; pixel tokens and unrelated properties are ignored. The extension
does not save these values or send separate analytics requests. Lifetime-follow
flags remain zero; the extension does not enroll you in future library additions.

For a required Hypeddit CAPTCHA, an explicit Download can open the original gate
inside a restricted iframe in the page box or toolbar popup. That normal Hypeddit
page and Google reCAPTCHA receive ordinary browser requests and apply their own
privacy practices. The packaged frame helper calls the existing Google widget API;
only completion/expiry/error and bounded layout state leave the provider frame.
CAPTCHA response tokens are not sent to extension storage, messages, logs or a
solver service. The original tab alone sends the native email request after manual
completion. Attempt cookies are read for the declared threshold and never edited
to avoid a challenge. Cancellation/disabling discard pending challenge state.
