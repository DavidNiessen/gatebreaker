# Contributing

Use Node.js 22.12+, 24, or 26+ as permitted by `package.json`. Install dependencies with `npm ci`.
Keep the lockfile in every dependency change.

```sh
npm run format
npm run check
npm run package
```

`check` runs formatting checks, TypeScript, tests, both browser builds, and Mozilla validation. Packaging writes browser
archives and checksums to `release/`. Run the extension in both browsers before reporting browser
compatibility; a successful TypeScript build alone does not verify browser behavior.

## Add a provider

1. Implement `GateProvider` using the types in `src/domain/provider.ts`.
2. Keep detection and metadata parsing in `inspect`; do not send requests during inspection.
3. Use the injected resolution context for network access. Do not import browser APIs into provider
   logic or route requests through an external bypass service.
4. Register it in `src/providers/index.ts` and add its exact public page hosts to
   `config/provider-hosts.json`. Builds and live diagnostics share this list. Use normal website
   CORS for public provider APIs; do not add an arbitrary background proxy.
5. Add sanitized fixtures and tests for supported, unsupported, malformed, and network-failure
   states. Update the supported-provider documentation with the actual verified behavior.

Providers must preserve the user-initiated flow. The anonymous request must not submit email or
account actions. Hypeddit's documented native fallback may submit a generated placeholder after the
user requests resolution and anonymous access fails; sign-in requires clicking the provider control
and completing its login/consent. Do not collect credentials, persist tokens, call social APIs,
generate comments, accept lifetime-library marketing preferences, or automatically download files.
Native account permissions/actions must remain visible in the provider's consent flow.

## Test fixtures

Fixtures must be small, synthetic or sanitized, and committed locally. Do not commit full live pages,
cookies, authorization headers, OAuth codes, email addresses, signed private URLs, or raw HAR files.
Unit tests run without contacting providers, social networks, or S3. See README for browser-test
and opt-in live-check boundaries. Cover response-size limits, exact routes, malformed framework
state, unsafe destinations, token freshness, timer cancellation, and absence of final-file or
social-action requests. Preserve fragments needed by legitimate destinations. Store only sanitized
origins and shape summaries from real gates; never commit file keys or signed query values.

For each added provider, record the current shipped source identity, REA evidence IDs, observed
native navigation/request path, live URL matrix, and unresolved formats. Distinguish static evidence,
synthetic browser tests, installed-browser live results, and final-file availability. A successful
outer-gate destination can lead to another gate. Do not claim a timer elapsed in a fast virtual-clock
fixture: keep at least one real-duration browser check and report which tests use virtual time.

For Hypeddit, cover at least:

| Scenario                                               | Expected check                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every step code in a fixture’s dynamic `nwSteps` array | Inspect the supplied array instead of relying on a fixed list. Assert that anonymous-only resolution triggers no social or email action.                     |
| Empty and reordered `nwSteps`; repeated codes          | Handle the metadata deterministically without depending on a particular platform order.                                                                      |
| A new, unknown step code                               | Include the declared code in the skip request; never claim the corresponding social action was performed.                                                    |
| Missing or malformed gate metadata                     | Stop cleanly and leave the page usable.                                                                                                                      |
| Verified public download URL                           | Return a validated URL and wait for the user to open it.                                                                                                     |
| Public-file probe returns no file                      | Try the observed skip request; report failure if it yields no validated URL.                                                                                 |
| Server-enforced or login-required state                | Offer documented native actions; distinguish a clicked control, website progress, and a validated download. Never infer account authorization from UI alone. |
| Network error, timeout, or unexpected response         | Return a useful failure state without an unbounded retry loop.                                                                                               |
| Unexpected host, protocol, redirect, or path traversal | Reject the request or result before privileged access or navigation.                                                                                         |

Build the step-code tests from fixture data so new codes in captured evidence cannot silently escape
coverage. Add assertions for network calls as well as visible UI state. A hidden gate dialog is not
proof of a successful download.

Valorizd tests must cover consumed Next script tags, exact owned resource evidence,
fixed-project/slugs/field projections, and refusal of broad or mismatched documents.
PUSH.fm tests must preserve the native empty object action state and distinguish
metadata, final reward lookup, action-token issuance, and telemetry. Multi-file
responses require all entries to validate; exercise the chooser in both browsers,
keep selection across status updates, and assert no target request or automatic
navigation. Native fixed banners must not obstruct extension controls on mobile.

In a browser, verify the content action, popup preference, disabled state, retry/error handling, and
final link behavior. Check that loading a page alone starts no resolution request or download. Test
Chrome’s service worker and Firefox’s background script independently.

## Changes and reports

Use conventional commit subjects such as `feat(hypeddit): ...`, `fix(platform): ...`,
`test(providers): ...`, and `docs: ...`. Keep changes focused and include the validation performed.
Describe limitations directly; do not label all gates supported from a single fixture or example.

For a provider failure, use the bug-report template. For a security issue, follow `SECURITY.md`.
