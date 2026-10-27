# GateRush direct HTTP provider handoff

Implementation candidates (copy only these into the repository):

- `src/providers/gaterush.ts` → `src/providers/gaterush.ts`.
- `tests/gaterush.test.ts` → `tests/gaterush.test.ts`.
- `test-gaterush.mjs` → `scripts/test-gaterush.mjs` (authored installed-extension helper; call only after existing fixture delivery interception).
- `corpus.json`, `adapter-validation.json`, `probe-status.json` are sanitized research evidence. They contain URL/shape/status/configuration flags; no cookies, CSRF values, artist contacts, OAuth credentials or final destinations.

Do not copy staged `src/domain`, `src/providers/hypeddit`, `src/providers/shared`, configuration, private scripts or generated adapter bundle: those are local validation dependencies/scratch. Root owns actual integration, manifest/host changes, build, browser execution, Git and release.

## Implemented behavior

`https://gaterush.me/<six-character [-A-Za-z0-9_]>` only; reserved site routes excluded. Native markup plus the exact same-origin `gate-liquid.js` script identify pages. The bounded 64 KiB, whole-script `window.__GATE__` declaration parser accepts JSON values in the server's fixed property order; no evaluation. Exact route/slug/auth entry, known unique step IDs and boolean flags are validated. Stored Gate metadata contains no session data.

All processing uses HTTP, after explicit Download: required email/name is a URL-encoded `POST /save-email/:slug`; ordinary Instagram/Spotify confirmations are URL-encoded `POST /gate-step/:slug` with native CSRF and same-origin cookies. Artist-skippable steps generate no request. Only successful bounded JSON `{success:true}` is accepted, and acknowledgements remain in memory scoped to this document/model.

Page opening performs no HTTP processing and does not infer a required login from configuration. Explicit Download first sends a read-only HEAD with the native cookies. A valid attachment immediately reuses an already completed session without email, acknowledgements or OAuth, including gates configured to require a comment. After an actual 401/403, supported ordinary HTTP steps may run; only a still-denied final HEAD exposes required SoundCloud sign-in and locks Download. Explicit Sign in opens only the source-proven GateRush `/auth/soundcloud?slug=...` entry, retaining its native cookie/PKCE/consent flow. There is no native button click, form manipulation, DOM-progress proof, own OAuth token store, local/session storage access or synthesized comment. Only a `sc-auth` callback from the exact opened popup, exact GateRush origin provisionally completes sign-in for the pending model/auth entry. As proven by the native listener, `type:sc-auth` is sufficient; an optional payload slug is checked when present and mismatches are rejected. Accepted callbacks consume their owned-popup binding. Final delivery still requires authenticated `HEAD /download/:slug` success, attachment disposition and an audio/archive/original binary content type. No GET of final media occurs during resolution. A 401/403 clears provisional connection status.

The same-origin native download route is returned with `kind:'file'` only after the final HEAD passes. This avoids reading any media bytes and leaves final transfer to existing delivery.

Comment-configured file gates use the same read-only first HEAD. An existing server-completed attachment is accepted; a denied comment gate returns a clear unsupported result without email/step writes, comment synthesis or OAuth. Link rewards remain unsupported and retain their native UI; their redirects are not represented as successful files.

## Source and REA evidence

Captured 2026-10-27; public sources:

| Source                                | SHA-256                                                            | Relevant original lines                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| https://gaterush.me/js/gate-liquid.js | `991d31e5e087bfcbabab0480bd9b9da4fbac8de4308c3aac8eebe7cab4d4219e` | 21–27 native CSRF; 47–88 email POST and `{success}`; 98–140 user comment and native SC consent; 148–164 ordinary client confirmation POST; 166–179 Instagram/Spotify click confirmation contract; 350–365 known step mapping; 402–417 artist skip requires no server completion; 453–467 native `sc-auth` callback; 470–495 native file/link download route |
| https://gaterush.me/js/gate-ui.js     | `28dc225d9f3830e6833f3081150de97dd973bf157a513d7d801063c9f3c545d7` | shared UI labels/icons; analyzed for context                                                                                                                                                                                                                                                                                                                |
| https://gaterush.me/js/utils.js       | `18310614e3df9415ad7354d3b32d7d143248460d75cea31c03d9388f4394768f` | 393–442 native OAuth popup/keepOpener; 427–430 native page's optional completion bookkeeping; 513–536 native callback fallback                                                                                                                                                                                                                              |

REA `analyze_javascript_application` parent Evidence: `ev_5bf4e2d9d7bdae8c80abd6e05a1a0d0a3203650004aec433b7a98beb24acdfb3`; summary view `ev_c500b296882957987a5283df83cf3b36b8ca88db69c9307a3095d6d3c4c2125b`; focused source-range view `ev_53f0fafb601775c9ad167c6981035533d877f4d8d8159afd66bee0262ff4668e`. Analyzed all three exact JavaScript paths, 49,663 bytes, 3 parsed files, zero parse failures; artifact root SHA `11aeb05b843d59cdd0b5f5a2784b46a08264cb6cbda92819fd4975070ccc6250`. Application inventory complete; semantic relationships partial/unknown, 1,082 conservative unknowns. Static REA does not establish runtime authentication or successful download.

Native public pages expose exact `__GATE__` declarations; all 24 retrieved pages parsed successfully before any processing. `corpus.json` contains each public page URL, captured UTF-8 HTML artifact hash, primary discovery URL and sanitized flag shape. Six were discovered from artist-owned SoundCloud/Bandcamp pages, the remaining eighteen from GateRush's own homepage/charts. No raw artist-contact-bearing HTML is a deliverable.

## Live observations and limits

24 distinct live public artist pages: all 200, 24/24 parser successes. Three eligible original-file shapes without required comments: `hAUtB3`, `lJycQi`, `lku6F0`; all configure mandatory SoundCloud. The twenty required-comment configurations are usable only when the first server HEAD already proves an existing completed file session; otherwise they return unsupported. The remaining link reward stays unsupported. The initial inspect/actions/presentation pass makes no requests and exposes no login from configuration. The updated explicit anonymous diagnostic pass made 23 exact-route HEADs (one per file gate), all 403 without attachment, with automation disabled and zero email/step writes. The link reward made no request. Initial sign-in actions remained empty for all 24 pages; the three noncomment gates also have ordinary steps left, so this read-only pass deliberately did not claim a login requirement before completing those steps.

Anonymous memory-only session for `-nEKJb`: initial HEAD `/download/-nEKJb` =403 HTML; source-proven Instagram `POST /gate-step/-nEKJb` =200 JSON with only `success:true`; final HEAD remains403 HTML because SC is enforced. Other HEAD-only probes `0h8EIg` (link), `gQTIE8` (SC+Spotify) =403 HTML. No media or real-account OAuth was fetched.

On real required-email+SC gate `lku6F0`, first `GET /auth/soundcloud?slug=lku6F0` directly returned302 to `https://secure.soundcloud.com/authorize` before submitting email. OAuth query parameter names only were inspected (`code_challenge`, `code_challenge_method`, `response_type`, `redirect_uri`, `state`, `client_id`); no values retained. Therefore the email-first page order is not an auth-entry requirement.

**Not established:** actual authenticated callback execution, successful authenticated HEAD attachment/content-type headers, end-to-end authenticated file delivery, native link redirect destination validation. Do not advertise complete GateRush support or verified anonymous unlocking. Authenticated success tests are authored contracts, not real-account evidence.

## Validation and integration notes

45 meaningful Vitest tests passed; strict standalone TypeScript check passed including repository `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unused checks and verbatim module syntax. Prettier applied with repository formatting settings. Authored browser fixture syntax passes; browser fixture has not been executed by this worker (root owns shared runners).

Unit tests cover inert/oversized/mismatched/duplicate state, strict routes, exact ordinary HTTP requests, Download-only behavior, optional skips, CSRF/session boundaries, malformed/oversized/challenge/error responses, attachment/preview discrimination, cancellation, callback origin/source/slug binding, direct email/name submission, no DOM proof/UI driving/storage and unsupported comment/link shapes.

Needs provider registry + content/host match registration for `https://gaterush.me/*`; no cross-origin data-fetch host needed. The auth popup naturally navigates to SoundCloud under explicit consent and does not require the extension to read its contents. Delivery's allowed native file destination needs exact `/download/<slug>` support if not already generic. Current adapter imports existing `randomEmail` from `hypeddit/actions`; root should extract that common pure generator to a shared helper when integrating the two new providers. No dependency additions.

Suggested conventional commit boundaries: sanitized source/contract research; shared email helper extraction; provider+unit tests/registry/hosts; authored browser integration. Root decides release/support wording after integration and verification.

## Parent integration validation

The adapter is registered and has passed the complete installed Chrome and Firefox
fixture suites. Four current hydrated live pages (two per provider) also passed
detection and returned real server-required failures in anonymous diagnostics.
These checks do not establish authenticated delivery. See the sanitized
[combined browser record](../http-browser-validation.json) for revisions and scope.
