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
implemented by Hypeddit and PUSH.fm and orchestrated by `application/gate-actions.ts`.

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
native completion. Native Spotify login remains user initiated. Unsupported
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

Hypeddit alone submits its available placeholder email after Download, including
optional email, and waits for native acceptance. Required sign-in buttons invoke
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
  call social APIs or analytics; native email is restricted to Hypeddit's handler.
- Keep provider DOM rules in the provider hook, rather than generic UI code.
- Persist only the local enable preference. Never save credentials, gate tokens,
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
page destinations. Hypeddit's file-specific methods also imply file delivery.
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
