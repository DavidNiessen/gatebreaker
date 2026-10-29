# Architecture

Gatebreaker has a reusable core, a Node.js CLI host and a browser extension host. The core accepts
explicit DOM and HTTP capabilities; importing it does not access a browser global.
The extension composes the core providers with sign-in, CAPTCHA, native-session
storage, delivery and presentation adapters for Chrome and Firefox.

The CLI lives in `src/cli/` and is distributed from `packages/cli`. It supplies inert
JSDOM parsing, a host-owned cookie jar, bounded gate HTML, explicit session imports,
timeouts and streamed file delivery. It never imports extension adapters into Node or reads
normal browser profiles. A command URL explicitly permits supported automatic HTTP steps;
`--inspect` only loads and inspects the gate. After an HTTP `server-required`/`session-expired` result, or unreadable metadata on
a recognized route, the CLI automatically launches a dedicated Chromium profile with a bundled
copy of the extension for existing login/CAPTCHA/social capabilities. Its profile
ownership marker refuses normal browser directories. Missing compatible Chromium
is installed on demand, with cancellation; `--install-browser` remains an optional
prefetch. `--inspect` and successful HTTP resolutions never launch a browser.
Provider refusals for rate limits, input, invalid responses, unsafe destinations and
network errors do not fall back. Both phases share one per-gate deadline, and the
HTTP DOM windows are closed before the browser starts. A stable public extension
key preserves its identity across npm cache paths; it is not an account secret.
A compile-time CLI-only constant suppresses extension reward delivery and permits
the command to begin preparation before required sign-ins. It retains the existing
private `popup.html` sender boundary. A CLI-only `chrome.storage.session` mapping
binds the controller tab to its gate tab even when verification moves the controller
into a separate popup. No website bridge, localhost callback server or widened
sender allowlist is introduced. The Node host polls that private controller for
progress/result, requires the original gate identity, and owns final output and
file delivery.

Browser fallback starts headlessly. A required sign-in gets one bounded silent
attempt; unresolved account interaction or CAPTCHA promotes the command once to
windowed Chromium with the same dedicated profile. Headless is a browser-wide
launch choice, so the prior process must close before the profile is reopened.
Unfinished gate preparation is repeated; credentials are never exported/imported.
The gate window is minimized before navigation, native account actions are opened
through the private controller's trusted controls, and a challenge can move that
controller into a small verification popup. CDP window operations are scoped to
pages in this CLI-owned context. The windowed context remains alive, minimized,
until the command finishes so session-only cookies survive subsequent inputs.
Cancellation closes only this context, including its account windows. Ordinary Chrome/Firefox builds replace the constant with false. Its JSON Lines output is suitable for a subprocess API;
`gatebreaker-cli/core` exports the same engine for an in-process API host.

| Location                                  | Responsibility                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/core/client.ts`, `src/core/index.ts` | Public session API, copied summaries, injected capabilities and cancellation.               |
| `src/core/domain/`                        | Gate, input, result and provider contracts; no extension dependencies.                      |
| `src/core/application/resolve-gate.ts`    | Match a provider and coordinate resolution.                                                 |
| `src/core/providers/index.ts`             | Register the shared provider engines.                                                       |
| `src/core/providers/hypeddit/`            | Hypeddit request construction, email verification, response validation and session state.   |
| `src/core/providers/shared/`              | Bounded response reads and shared request policy.                                           |
| `config/provider-hosts.json`              | Page hosts shared by manifests and diagnostics; only Bandcamp permits artist subdomains.    |
| `src/extension/providers/`                | Native windows, callbacks, polling, action progress and presentation around core providers. |
| `src/extension/platform/`                 | Browser APIs, scoped native-session storage and private message boundaries.                 |
| `src/extension/entrypoints/content.ts`    | Page inspection, trusted actions, presentation, cancellation and stale-result protection.   |
| `src/extension/entrypoints/background.ts` | Native download APIs, owned popup recovery and fixed-host public-file HEAD probes.          |
| `src/extension/ui/`                       | Provider-neutral controls, comment configuration, results and manual challenge views.       |

The exported types in `src/core/domain/provider.ts` are the core API. Providers
implement `matches`, `inspect`, and `resolve`. Inspection is network-free. Optional
`presentation` supplies only an anchor for the extension panel. Website controls
retain their native visibility and click handlers; resolution starts only
from the panel or extension popup. Optional native-action hooks are currently
implemented by Hypeddit, PUSH.fm, GateRush, and Droploud and orchestrated by
`src/extension/application/gate-actions.ts`. Their augmented contract is separate
from the core provider contract.

## Core host boundary

`createGatebreaker` accepts a provider registry, HTTP transport and inert HTML
parser. A host supplies initial HTML or a live Document; the core never loads the
initial URL or delivers a returned reward itself. Every created page session owns
its resolver and in-flight request, so two independent API calls do not share a
pending result. URL objects, public summaries and preferences are copied at the
boundary. Cancellation rejects a result even if a transport finishes late.

Core providers use the supplied parser for refetched HTML and an optional scoped
native-session reader. Browser storage access is implemented only in the extension;
the returned SID is validated again by the provider. Shared private session data can
retain optional window references owned by an extension adapter, but the core never
opens, observes or manipulates those windows. Its public facade exposes none of
that private state or CSRF metadata.

An optional `readNativeReceipt(provider, gateId, driver)` port restores opaque
gate-service receipts after fresh action metadata and a server refusal. PUSH's
extension adapter validates its own gate cookie and disabled native control; the
core never reads the cookie itself and still requires final server approval.
This port does not supply account OAuth credentials and is unused by inspection
or resolutions without explicit automation.

An optional `repostSoundcloud(request, signal, onProgress)` capability performs a
real repost for a declared Droploud track after an explicit automated Download.
The core first checks native verification, invokes the host only for a missing
manual-mode repost, and requires fresh native verification before requesting the
file. It passes only the provider, gate ID and canonical public track URL. Account
credentials belong to the host, and a successful mutation alone is never a
download receipt. Hosts that omit this capability retain the manual handoff.

Hypeddit email and final HTTP request/reply contracts and PUSH public action-model
loading are core protocols. Browser adapters own progress presentation, callback
ownership and native-window navigation. Core email preparation requires an explicit
automated resolution, preserves the mandatory-auth guard, and stops for a declared
CAPTCHA. Existing extension preparation is reused without duplicate requests.

An API/CLI host must provide a cookie/session-aware transport for authenticated
requests; Node's `credentials` option does not create a browser cookie jar. Host
capabilities must be scoped per user. OAuth consent, CAPTCHA and manual social
actions still require an appropriate host adapter. The Node CLI supplies the HTTP/session host above; no HTTP API server or new OAuth
client is included.

`build:core` emits neutral ESM and declarations. Core compilation excludes Chrome
types, the dependency guard rejects extension imports and implicit browser I/O,
and generated declarations are checked as NodeNext consumers. The private root package exports `gatebreaker/core` for local development. The
distributed CLI package exports `gatebreaker-cli/core`; its file whitelist includes
only compiled CLI/core output and public metadata/docs. Clean production-install
checks verify the executable, core export and packed contents on Windows and Linux.

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
ordinary fields are whitelisted for those website-session download requests;
they do not read or persist OAuth tokens. The separate owned SoundCloud repost
adapter uses its page-local session as documented above. See the privacy document for account side
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
  and final receipt lookup use same-origin credentials only after Download. Social
  APIs are limited to the declared owned SoundCloud repost capability; never call
  analytics. Email uses only source-confirmed Hypeddit/GateRush endpoints.
- Keep provider DOM rules in the provider hook, rather than generic UI code.
- Persist only the local enable preference, configured comment and scoped nonsecret Spotify reuse hint;
  session-only ownership coordinates active popups. Never save credentials, gate tokens,
  native passes, creator contact objects, or recovered signed URLs to storage.

## Verified boundaries

The current formats are covered by offline fixtures and installed Chrome/Firefox
integration tests, with separate sanitized live corpora under `docs/research/`.
Those samples do not prove universal or future-format coverage. Rekonise snippets
have no download URL and are unsupported. ToneDen's sampled native download path
requires authentication, so no adapter is registered. Hypeddit remains partial;
the Sylver example has no proven account-free unlock.

`src/extension/application/deliver.ts` separates target validation and one-shot delivery from
provider parsing. File providers mark `kind: file`; embedded and URL rewards remain
page destinations. Hypeddit's file-specific methods imply file delivery only when no explicit kind is supplied.
An explicit page kind always overrides legacy method inference.
Content publishes a delivery receipt without running side effects during render.
Abort sends the operation ID to stop remaining background starts; requests already
handed to the browser cannot be undone by cancelling resolution.

`src/extension/ui/action-error.ts` selects one actionable native/delivery failure. Completion
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

## Provider-specific native boundaries

The additional adapters keep parsing, requests, response approval and session
state in the reusable core. Extension wrappers supply owned account windows and
native SDK capabilities. DownloadGater's private background job tracks its own
tab through opener isolation, reading only a same-gate receipt after return.
PumpYourSound's private job invokes the shipped SoundCloud SDK in the exact
original page's MAIN world; account credentials never cross into core or Node.
StillHype and MyPressKit poll their own native verifier. Bandcamp's private bridge
accepts only signed first-party grant/status GETs with credentials omitted, never
arbitrary page URLs or file downloads. Cancellation and sender/document checks
remain host concerns. Native website controls are never clicked or replaced.
