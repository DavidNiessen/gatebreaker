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
4. Register the provider at the application’s composition point and add only the host permissions it
   requires.
5. Add sanitized fixtures and tests for supported, unsupported, malformed, and network-failure
   states. Update the supported-provider documentation with the actual verified behavior.

Providers must preserve the user-initiated flow. Do not submit an email address, connect an account,
follow an artist, save a track, post a comment, accept a marketing preference, or automatically
download a file as part of resolution.

## Test fixtures

Fixtures must be small, synthetic or sanitized, and committed locally. Do not commit full live pages,
cookies, authorization headers, OAuth codes, email addresses, signed private URLs, or raw HAR files.
Unit tests run without contacting Hypeddit, social networks, or S3. See README for browser-test and opt-in live-check boundaries.

For Hypeddit, cover at least:

| Scenario                                               | Expected check                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every step code in a fixture’s dynamic `nwSteps` array | Inspect the supplied array instead of relying on a fixed list of social platforms. Assert that resolution never triggers the corresponding social or email action. |
| Empty and reordered `nwSteps`; repeated codes          | Handle the metadata deterministically without depending on a particular platform order.                                                                            |
| A new, unknown step code                               | Include the declared code in the skip request; never claim the corresponding social action was performed.                                                          |
| Missing or malformed gate metadata                     | Stop cleanly and leave the page usable.                                                                                                                            |
| Verified public download URL                           | Return a validated URL and wait for the user to open it.                                                                                                           |
| Public-file probe returns no file                      | Try the observed skip request; report failure if it yields no validated URL.                                                                                       |
| Server-enforced or login-required state                | Explain the limitation and perform no OAuth, email, or social action.                                                                                              |
| Network error, timeout, or unexpected response         | Return a useful failure state without an unbounded retry loop.                                                                                                     |
| Unexpected host, protocol, redirect, or path traversal | Reject the request or result before privileged access or navigation.                                                                                               |

Build the step-code tests from fixture data so new codes in captured evidence cannot silently escape
coverage. Add assertions for network calls as well as visible UI state. A hidden gate dialog is not
proof of a successful download.

In a browser, verify the content action, popup preference, disabled state, retry/error handling, and
final link behavior. Check that loading a page alone starts no resolution request or download. Test
Chrome’s service worker and Firefox’s background script independently.

## Changes and reports

Use conventional commit subjects such as `feat(hypeddit): ...`, `fix(platform): ...`,
`test(providers): ...`, and `docs: ...`. Keep changes focused and include the validation performed.
Describe limitations directly; do not label all gates supported from a single fixture or example.

For a provider failure, use the bug-report template. For a security issue, follow `SECURITY.md`.
