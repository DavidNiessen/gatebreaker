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
Hypeddit-specific and are orchestrated by `application/gate-actions.ts`.

## Resolution and cancellation

Valorizd adds one fixed-project Firestore `documents:runQuery` POST. The request is
read-only, filters the current slug, projects only public gate/reward fields, and
rejects ambiguous or mismatched documents. It never queries creator profiles or
writes statistics, emails, or notifications. Recognition uses matching canonical
identity plus the exact owned gate bundle; if Next removes that script, a native
gate card and its script resource timing provide passive ownership evidence.

PUSH.fm uses two fixed-origin GETs: fresh matching reward metadata and its native
final lookup with Base64 JSON `{actions:{}}`. No action token, OAuth, email,
conversion, or social endpoint is invoked. Required actions may still be enforced.
Signed files are restricted to the observed S3 bucket and path/query contract.

Success may include `destinations` for multiple released files; its first URL is
also `url` for existing consumers. Providers validate every entry and reject a
malformed/unsafe/duplicate member as a whole. The shared UI helper validates the
choice list again and changes one explicit opening link through a native select.
The current selection survives repeated status updates but resets for a new result;
no choice or destination is persisted. Twenty files is an implementation bound.
Neither query completion nor choosing a file automatically navigates or downloads.

1. Inspect the current supported page; loading alone does not start resolution.
2. A trusted page click or validated popup request starts one abortable generation.
3. Inject `fetch`, the abort signal, and an optional progress callback into the adapter.
4. Parse only the observed provider shape and validate the result URL.
5. Offer a separate Open destination/download action. Never automatically open it.

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

Hypeddit alone may submit required placeholder email after a requested anonymous
attempt fails. Its sign-in buttons invoke native login/consent windows. Known
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
- Background messages cannot fetch arbitrary URLs. Hypeddit's file probes are
  restricted to the fixed S3 origin and expected object path.
- Use credentials omission for new-provider fetches. Do not call social,
  email-submission, analytics, or action-completion endpoints for these adapters.
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
