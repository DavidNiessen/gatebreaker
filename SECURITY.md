# Security

Gatebreaker reads untrusted website metadata and exposes limited extension capabilities. Security
reports are welcome for unsafe URL handling, privileged message validation, credential exposure,
arbitrary code execution, or behavior that performs social or account actions without the user’s
intent.

Use the repository’s private security-reporting option in the **Security** tab when it is available.
If no private channel is available, open a minimal issue asking the maintainer for one. Do not include
exploit details, personal information, credentials, or a working private download URL in a public
issue.

Include the affected version, browser version, reproduction steps, expected behavior, actual
behavior, and a minimal sanitized fixture where possible. Do not provide another person’s account
or private content to demonstrate a problem.

Security fixes target the latest release and the default branch. There is no guaranteed response or
remediation deadline. Update to the latest version before reporting an issue.

The extension must not evaluate downloaded code, accept arbitrary fetch targets through background
messages, acquire passwords, or export/store account OAuth tokens. Native actions
are limited to recognized controls on validated provider origins and initiated through Gatebreaker.
After Download, the authorized email flow submits `gatebreakeros@proton.me` through
Hypeddit and waits for native acceptance. No email button is exposed. Required sign-ins must
complete before Download is enabled; newly discovered requirements pause and resume that
requested flow. Social sign-in uses the gate website's own login and consent window.

The explicitly requested automatic repost flow is a narrow additional capability.
Only an owned SoundCloud top frame may use its own cookie for the fixed GraphQL
viewer query and `RepostTrack` operation, bound to the declared track after Download.
It must never expose that token to background messages, extension storage, logs,
gate providers or arbitrary destinations. Validate the native track URL/ID/URN,
skip already-reposted state, never call UnrepostTrack or invent like attestation,
and require the gate provider's verification plus final file approval. Login and
challenges remain user interactions. No page-facing bridge may start the operation;
cancellation and ownership loss stop remaining requests where possible.

Droploud's Instagram acknowledgment is limited to the declared
`id:instagram`/`type:instagram_follow` pair after Download and required SoundCloud
checks. Send only the native session UUID and step ID to the fixed gate endpoint;
require exactly `{"ok":true}` and final server approval. Never invent a handle,
send consent, call Instagram APIs or generalize this into arbitrary step completion.

Website progress and markup are untrusted; they never prove a download was released. Popup messages
and status ports must validate the extension ID and exact popup URL. New native actions/providers
require documented behavior and boundary tests. Unexpected submissions or account actions without
user intent are reportable security issues. Server-enforced access remains a product limitation.

Sub2Unlock and Boost parse only the documented embedded destination formats. Rekonise uses a fresh
public gate capability with its ordinary metadata/unlock GETs after a cancellable wait; no account,
social action, email submission, or saved pass is used. Public gate tokens and signed destinations
may exist in active memory to complete that requested operation. They must not be logged, published,
or persisted. This does not authorize reading account tokens or creator contact objects.

Injected controls require trusted user clicks. Every provider request must have bounded responses,
exact origin/route validation, cancellation, and redirect controls. Recovered destinations are
validated before automatic handoff following an explicit Download. File rewards
use the browser downloads API; URL rewards open as pages, preserving fragment keys.
The background accepts delivery only from this extension's top-frame content script
on a supported provider page. Validate every target before starting a batch, bind
its operation to that tab and gate path, and check cancellation/enabled state before
each item. No page-facing message bridge may trigger delivery. Preserve legitimate fragment keys
without disclosing them in fixtures or diagnostics. Uploaded Rekonise files require its exact signed
storage route; no general API-host navigation or fetch exception is permitted.

Valorizd may read only the fixed public Firestore project's current exact-slug
gate document with the documented projection. It must not become a general
database reader or query creator profiles, emails, other projects, or private
collections. PUSH.fm may request current reward metadata and its native empty-action
lookup. After an explicit Download and a refusal, it may use the exact known
non-OAuth click-acknowledgement routes with native CSRF and same-origin cookies.
Only source-confirmed drivers with both native client flags are eligible. Preserve
the server's gate receipts in page memory, never fabricate them or claim a follow
was performed. OAuth is user initiated via native Spotify controls. Accept only
PUSH-origin callbacks for a pending recognized driver, requiring native disabled
completion as well; these are untrusted gate receipts that the final server lookup
must validate. Do not inspect OAuth fields, store receipts, or log signed URLs.
The native popup handle is unavailable to the isolated content script, so origin
plus native completion is a limited boundary, not cryptographic callback proof.
Native refusals and unsupported actions remain failures.

All multi-file entries must be validated before being exposed. All validated files in a reward may
start automatically after Download; the chooser changes only the optional retry
link. It must not persist signed addresses or insert filenames as HTML. Page identity/resource evidence is
untrusted input for provider recognition, never authority for privileged fetches.

Native PUSH restoration requires an exact current-slug cookie receipt, matching
service ID/driver/link, bounded native shape, and a disabled recognized control.
Cookie-only or disabled-only state must not unlock Download. Never treat a cached
boolean, Hypeddit mobile navigation state, or another gate's receipt as account
authorization. Do not rewrite native OAuth parameters or automate new consent.
