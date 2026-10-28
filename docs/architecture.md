# Architecture

Gatebreaker separates provider rules, orchestration, browser capabilities, and UI.
Provider code is shared by Chrome and Firefox; builds generate their different
background configurations.

| Location                              | Responsibility                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/domain/provider.ts`              | Gate, result, progress, and injected provider contracts; no browser APIs.                       |
| `src/application/resolve-gate.ts`     | Match a provider and coordinate resolution.                                                     |
| `src/providers/index.ts`              | Register adapters at one composition point.                                                     |
| `src/providers/hypeddit/`             | Hypeddit detection, anonymous resolution, and narrowly scoped native actions.                   |
| `src/providers/sub2unlock.ts`         | Parse the current Next.js embedded destination.                                                 |
| `src/providers/boost.ts`              | Decode the known script attribute, refetching only the gate HTML when needed.                   |
| `src/providers/rekonise.ts`           | Fetch fresh public metadata, wait, and request a link or signed uploaded-file URL.              |
| `src/providers/shared/read-text.ts`   | Bound streamed response bytes and cancel oversized bodies.                                      |
| `config/provider-hosts.json`          | Explicit page hosts shared by manifests and live diagnostics.                                   |
| `src/platform/`                       | Browser API and message boundaries.                                                             |
| `src/entrypoints/content.ts`          | Page inspection, trusted user actions, presentation, cancellation, and stale-result protection. |
| `src/entrypoints/background.ts`       | Fixed-host public-file HEAD probes for Hypeddit.                                                |
| `src/entrypoints/popup.ts`, `src/ui/` | Provider-neutral results, progress, and controls.                                               |

The exported types in `src/domain/provider.ts` are the authoritative API. Providers
implement `matches`, `inspect`, and `resolve`. Inspection is network-free. Optional
`presentation` owns native anchors and hidden selectors; generic content code
restores the native controls on disable. Optional native-action hooks are currently
implemented by Hypeddit, PUSH.fm, GateRush, and Droploud and orchestrated by `application/gate-actions.ts`.

## Resolution and cancellation

Valorizd adds one fixed-project Firestore `documents:runQuery` POST. The request is
read-only, filters the current slug, projects only public gate/reward fields, and
rejects ambiguous or mismatched documents. It never queries creator profiles or
writes statistics, emails, or notifications. Recognition uses matching canonical
identity plus the exact owned gate bundle; if Next removes that script, a native
gate card and its script resource timing provide passive ownership evidence.

PUSH.fm first uses two fixed-origin public GETs: matching metadata and the native
final lookup with Base64 JSON `{actions:{}}`. With `ProviderContext.automate`,
a refused lookup can complete source-confirmed non-OAuth click acknowledgements
using the native same-origin CSRF/session. `push-session.ts` keeps opaque gate
receipts in document-scoped memory, derives required Spotify controls from native
markup/fresh metadata, and observes only pending exact-origin gate callbacks plus
a matching owned consent window. Native Spotify login remains user initiated. Unsupported
actions and server refusals remain failures. Diagnostics leave automation false.
Signed files are restricted to the observed S3 bucket and path/query contract.

Success may include `destinations` for multiple released files; its first URL is
also `url` for existing consumers. Providers validate every entry and reject a
malformed/unsafe/duplicate member as a whole. The shared UI helper validates the
choice list again and changes one explicit opening link through a native select.
The current selection survives repeated status updates but resets for a new result;
no choice or destination is persisted. Twenty files is an implementation bound.
After an explicit Download, successful file rewards go to the browser download
manager, including all members of a validated multi-file set. URL rewards open in
a new tab. Diagnostics leave automatic delivery disabled; the chooser remains an
optional retry control.

1. Inspect the current supported page; loading alone does not start resolution.
2. Required sign-ins keep Download disabled until every native state is complete.
3. A trusted Download click or validated popup request starts one abortable generation.
   Automatically submit native email once and await acceptance; a rejection stops.
   Inject `fetch`, the signal, `automate`, and optional progress into the adapter.
   A newly discovered required login pauses that generation; native completion
   resumes automatically unless cancelled, disabled, or navigated away.
4. Parse only the observed provider shape and validate the result URL.
5. Build a bounded file/page delivery plan and send it once to the background.
   Validate the full set again, check the active tab/path and enabled state before
   each item, and use downloads.download or tabs.create. Keep a retry link.

`embedded-link` describes Sub2Unlock/Boost recovery. `provider-request` describes
Rekonise's native unlock response. These methods promise a recovered destination,
which may itself be another gate, rather than verified file contents. MEGA URL
fragments are preserved. Hypeddit retains its own stricter URL constraints.

Rekonise gets a fresh public gate token, waits the sum of native timer upper bounds
(15 seconds per ordinary action, 45 per watch-video action), then adds a five-second
margin. An email UI step adds a conservative 15-second allowance, not a proven
native email timer. The schema bound of 30 actions is an implementation limit;
the current creator UI has a 20-action limit. Requests use ordinary website CORS
without a privileged background API proxy or an API-host permission. Tokens and
signed result URLs remain in active memory; passes are ignored.

Progress is accepted only for the current enabled generation, with bounded text
and finite countdown values. Cancel check, navigation, and disabling abort where
possible, clear progress, and discard late results. The Cancel button disables
while cancellation settles; a new attempt gets a new generation and fresh token.

Hypeddit submits its fixed gatebreakeros@proton.me address after Download, including
optional email, and waits for the exact HTTP verification response. GateRush posts
required email/name and ordinary confirmations through its native CSRF endpoints. Required sign-in buttons invoke
native login/consent windows. No optional login interaction is exposed. Known
ordinary fields are whitelisted for the website-session download request; OAuth
tokens are neither read nor persisted. See the privacy document for account side
effects requested by Hypeddit itself.

## Trust boundaries

- Treat HTML, scripts, titles, identifiers, and network JSON as untrusted data.
  Parse known shapes, never evaluate downloaded code, and bound response sizes.
- Validate exact HTTPS origins, routes, credentials, ports, redirects, and output
  shapes. The general destination policy rejects local/private addresses;
  Rekonise uploaded files additionally require the exact signed storage route.
- Page controls require trusted clicks. Popup messages and ports validate the
  extension identity and exact popup URL. An open shadow root is not authorization.
- Hypeddit public-file probes remain fixed to the S3 origin/object path. Automatic
  delivery is a separate private extension message: only trusted top-frame provider
  content scripts may send a bounded validated set after an explicit Download.
- Use credentials omission for public fetches. PUSH.fm's documented acknowledgement
  and final receipt lookup use same-origin credentials only after Download. Never
  call social APIs or analytics; email uses only source-confirmed Hypeddit/GateRush endpoints.
- Keep provider DOM rules in the provider hook, rather than generic UI code.
- Persist only the local enable preference and scoped nonsecret Spotify reuse hint;
  session-only ownership coordinates active popups. Never save credentials, gate tokens,
  native passes, creator contact objects, or recovered signed URLs to storage.

## Verified boundaries

The current formats are covered by offline fixtures and installed Chrome/Firefox
integration tests, with separate sanitized live corpora under `docs/research/`.
Those samples do not prove universal or future-format coverage. Rekonise snippets
have no download URL and are unsupported. ToneDen's sampled native download path
requires authentication, so no adapter is registered. Hypeddit remains partial;
the Sylver example has no proven account-free unlock.

`src/application/deliver.ts` separates target validation and one-shot delivery from
provider parsing. File providers mark `kind: file`; embedded and URL rewards remain
page destinations. Hypeddit's file-specific methods imply file delivery only when no explicit kind is supplied.
An explicit page kind always overrides legacy method inference.
Content publishes a delivery receipt without running side effects during render.
Abort sends the operation ID to stop remaining background starts; requests already
handed to the browser cannot be undone by cancelling resolution.

`src/ui/action-error.ts` selects one actionable native/delivery failure. Completion
logs, wait logs and generated addresses are not rendered. Native sign-in buttons
become disabled Connected controls when complete. Error notices are semantic alerts
with a compact light/dark error surface.

PUSH can restore its own existing same-gate native receipt only with matching
disabled control state. The receipt remains in document memory and the final
server check still decides access; no cross-gate Spotify login flag is stored.

## Direct HTTP adapters

Processing never drives native clicks, input/change events, or slide transitions.
Hypeddit email uses POST /verifyEmailAddress and strict status T acceptance; accepted
email remains in document-scoped memory for the final request. Required Spotify
uses an inertly parsed native consent URL. An exact owned callback response prompts a bounded final
JSON request; closing a popup alone does not. Only a valid released URL makes the download ready. Its result is
reused for thirty seconds in the same gate/session to avoid a duplicate final POST.

PUSH opens its exact native /unlock/<slug>/action/<id> address after fresh metadata
validation. Receipts from new sign-ins require the exact owned window, origin and
driver; the final /complete response still decides access. Old same-gate native
cookie restoration retains its disabled-control corroboration.

GateRush parses the inert native **GATE** declaration and first sends HEAD to its
exact original download route using native cookies. Only a valid attachment/audio
or original binary response releases a file. Denied non-comment gates may send
known email and ordinary-step POSTs, then expose required SoundCloud consent.
Denied required-comment and link-reward variants remain unsupported.

Droploud parses bounded Next Flight JSON and reads the source-owned per-track SID,
falling back to the native general SID. Existing sessions try the final API first;
status POSTs and the source-confirmed optional skip ACK handle supported cases.
It uses the API's normal exact-origin credentialed CORS, without API injection
matches or a privileged networking proxy. Fresh comment/consent requirements are
not fabricated. Real-account positive delivery for both new adapters is unverified.

Hypeddit keeps an early closed-handle refusal pending for a late native callback.
New return/focus signals coalesce behind an in-flight check, with at most six
checks per two-minute attempt, at least one second between starts, and a twelve-second
request timeout. The trusted native storage flag is an origin/path-scoped signal;
storage events do not identify a source Window. Only a validated final destination
authorizes delivery. Provider cancellation aborts pending verification and rejects
stale responses, including errors that arrive after a replacement attempt. See
[the sign-in return investigation](research/hypeddit-signin-return.md).

After explicit sign-in activation, Hypeddit also recovers a missing native flag with
bounded rechecks after 1, 4 and 16 seconds. Four checks including the initial
check exhaust this fallback; the existing six-request budget reserves two
for later native signals. Sign-in controls show a disabled waiting label until
confirmation or an error. See [the silent-return follow-up](research/silent-return-followup.md).

The Hypeddit website-session payload includes its native external_id, hypesource
and adcode fields. The external identifier is accepted only from one bounded
literal jsonGateData declaration with the current gate uid and a 64-digit
hexadecimal externID. Other configuration properties are ignored; source is
never evaluated. These values go only to the normal same-origin download endpoint.

## Manual challenges

Providers can expose a transient GateChallenge and completeChallenge hook through
GateActions. Required interactions include CAPTCHA as well as sign-in, while email
remains automatic. An automatically exposed challenge is tracked before pausing so
its completed receipt survives removal from the provider action list and resumes
the original Download.

Hypeddit uses two narrow packaged subframe entrypoints. Only explicit nonce-marked
Hypeddit frames initialize the widget; ordinary pages and the general top-frame
content script do not use the bridge. The MAIN-world helper calls the native
Google API with its own widget ID; the isolated helper checks the allowed parent
origin and gate. Parent views require trusted messages from their exact iframe,
Hypeddit origin, current nonce and gate. No token or extension API crosses into
the MAIN world. Email acceptance and final server approval remain separate gates.
See [CAPTCHA evidence and limitations](research/hypeddit-captcha.md).

## Hypeddit Spotify reuse

A provider's injected AuthorizationOpener separates native consent URLs from browser
window ownership. The content controller starts a single attempt only after the
user's Download and accepted preparation steps. The first explicit sign-in and
later remembered reuse both use a private background-owned Spotify popup. A small
document_start relay on the exact first-party callback route reads no OAuth query
values. Background checks bind that sender to the owned child tab/window and owner
operation; correlated provider attempts ignore shared storage flags and DOM slides.

Only native return plus final approved destination can produce a reusable progress
receipt. Document-scoped return evidence survives another required service but is
cleared on cancellation or session change; final proof may arrive in verification
or the ordinary resolver continuation. Local storage keeps only version/confirmedAt
for thirty days. The normal browser/provider session still decides whether sign-in
or consent is needed, and grants are not shared between gate providers.

Session storage holds no auth URL/state: only bounded owner IDs, public origin/path
and deadlines/return times. Top-level recovery listeners, private bounded heartbeats
and operation-bound closure hints cover idle-worker restart, disable/navigation and
manual retry. A native callback gets a short close grace period; closure never
authorizes an early final POST. See the dedicated reuse report and authored browser
fixtures for concurrent gates and actual Chromium service-worker restart coverage.
