# Droploud: direct HTTP investigation and adapter candidate

2026-10-27. This is a partial direct-HTTP adapter. Real authenticated file delivery remains unverified.

Later findings: [Instagram acknowledgment](instagram-ack.md) and
[approved R2 response handling](response-types.md). The latter uses a user-reported
response shape and synthetic regression URLs; no reported signed URL was retained
or fetched for testing.

## Verified live behavior

Seventeen current public gate pages were inspected, including ten homepage tracks and seven gates linked directly by SoundCloud artists. All seventeen models contain mandatory SoundCloud actions and a user-written SoundCloud comment; all advertise `sc_optional:false`. Their combinations also cover email, Instagram, YouTube, Spotify follow/save and optional Droploud follow.

The actual bundled adapter was run on all seventeen inert JSDOM pages. It correctly parsed every model and sent only `POST https://api.droploud.com/api/soundcloud/gate-status`, with `{track_id,session_id}`. Every response was HTTP 200 with `connected:false`, and the adapter stopped with `server-required`. The probe rejects any other endpoint, so no final destination or media was requested. See `adapter-live-matrix.json` for sanitized evidence.

The separately source-confirmed optional Droploud-follow skip contract was tested on three varied gates with fresh UUIDs:

```text
POST https://api.droploud.com/api/gate/<track UUID>/step
Content-Type: application/json
{"session_id":"<fresh UUID>","step":"droploud_follow"}
```

All three returned HTTP 200 and exactly `{"ok":true}`. This acknowledged the explicitly skippable step; it did not establish completion of required SoundCloud or email steps. No social API, comment, email, marketing consent, account authorization or media request was submitted. See `live-matrix.json`.

The final endpoint was then checked with three **fresh native anonymous sessions**, preserving any page/API cookies in an in-memory CookieJar. The observed public pages set no cookies. The fresh native source setup is a new UUID; its initial effect skips `gate-status` when no previous `dw_sid` exists. For two cases the proven optional skip ACK ran first and the final request reused exactly the same UUID. The final server responses were:

| Configuration                                              | Optional skip | Final status | Exact error                            |
| ---------------------------------------------------------- | ------------- | ------------ | -------------------------------------- |
| Instagram + required SC                                    | none present  | 403          | `Gate not completed`                   |
| Required SC + optional Droploud follow                     | 200 `ok:true` | 403          | `SoundCloud follow step not completed` |
| Email + Instagram + required SC + optional Droploud follow | 200 `ok:true` | 403          | `Email step not completed`             |

No destination was returned. This directly establishes final-server enforcement for these fresh sessions after valid native setup and a successful optional ACK; it is stronger evidence than client status alone. See `final-live-matrix.json`. The probe never fetched a resulting destination. It did not repeat arbitrary empty payloads, fuzz unsupported parameters or claim that an incomplete session establishes every backend rule.

## Native contract and source evidence

Fresh public chunks were fetched again and retain the earlier SHA-256 identities. REA analyzed these exact two freshly fetched files without executing either one:

- Parent: `ev_d31c89548472644e8f1e15040b21eebf3537d410e9b326ea909773ee0040d97d`.
- Summary: `ev_defc0672ac8999cf471d4592e729e40199d65d58403584df217f822a4b30a4b6`.
- Two parsed scripts, 91,864 bytes, zero parse failures, zero unselected files. Static framework/dynamic semantics remain partial/unknown; this is not backend source or proof of runtime execution.

`source-contract.json` gives exact half-open UTF-8 source byte ranges and digests. The gate component is `2hzo_gvdx8sta.js`, SHA-256 `cdec885b07154e4f1b343fb1584f5c2cd203295415b2342867451b12595b2fd8`; the API client is `3xe2y0ql_4op8.js`, SHA-256 `c400a39c1b99e2bef045a8f9a956e45cf232feb5800689a8e214b34d9c7c22c4`.

The native component creates a UUID stored as `dw_sid` in sessionStorage. The Axios client uses `https://api.droploud.com/api`, credentials included, and a 15-second timeout. The adapter reads an existing native UUID or keeps a fresh UUID in active memory; it writes no browser storage or OAuth/token store.

An additional **public success-page source investigation** establishes completed-session reuse, rather than assuming each attempt needs a new UUID. The source-owned `2ps2ha3qouhw5.js` chunk (46,455 bytes, SHA-256 `6106b846fbba028059517d7737f99913032e64babff1def667d4e9b40b2e95c6`) reads **`localStorage["dw_sid:<track UUID>"] || sessionStorage["dw_sid"]`** and sends that value directly to the same final download endpoint. The gate handler writes the per-track key after a successful original response. The adapter now follows this exact read-only precedence, prefers the existing track receipt, and keeps newly generated anonymous UUIDs in memory only. It does not interpret `dw_unlocked:<id>` timestamps as server authorization.

Success-chunk REA parent: `ev_6637f1e9cbfcca0ec7f6df06ebb70235fd6dabf07afaad0d398e9f52c08f17d6`; summary: `ev_a229700970bde2689f2651f93885ba51e96d06beaf3210e1cb20e18d4acd4e20`. One selected script parsed, zero failures, two inventoried files outside that selection; static coverage remains partial. See `success-source-inventory.json`, `rea-success-summary.json` and the added exact ranges in `source-contract.json`.

Native SoundCloud authorization opens `/api/soundcloud/connect?track_id=<id>&session_id=<sid>&disclose_droploud=<native flag>`. Native status uses `/api/soundcloud/gate-status`. The client checks connected status and delegates actual social actions to its own authorization flow. Comment gates first require a real user's text via `step:"sc_comment"`; the candidate never fabricates or submits it. Therefore it deliberately offers no direct authorization action on a comment-required gate. A user-completed native session may still be checked through HTTP and passed to the final server endpoint.

The final handler posts `{session_id}` to `/api/gate/<id>/download`. It receives `download_url` and treats `type:"external"` as a page; other native/omitted types create a download link. The candidate never clicks that link or requests media. It returns `kind:"file"` for the native response and leaves external rewards as pages. The extension's existing explicit delivery layer owns delivery.

The result now always has `method:"provider-request"` and an explicit `kind:"file"` or `kind:"page"`. This avoids the v0.6 legacy `website-session` method inference turning an external page into an HTML file download.

The API client's credentials are **explicit**, not an Axios default: `create({baseURL:tk,withCredentials:!0,timeout:15e3})` at the recorded client range. The adapter therefore preserves `credentials:"include"`. A bounded live CORS check returned HTTP 204 for the final endpoint's JSON preflight with `Access-Control-Allow-Origin:https://droploud.com`, `Access-Control-Allow-Credentials:true`, and allowed header `content-type`. The native status POST returned HTTP 200 with the same exact origin and credentials allowance. See `cors-status.json`. Normal page-origin CORS supports these cross-origin native requests; no additional API injection match or API host permission is justified by this behavior. Cookies are supplied only by the browser's native credentials handling, with no cookie reading/storage by the adapter.

The shipped Spotify OAuth branch calls Spotify optional and provides a Skip ACK, but it is conditional on a build environment flag. The candidate does not guess that flag or automate Spotify/social ACKs from model labels alone.

The gate component contains no read of `sc_optional` and its unconnected SoundCloud branch has no anonymous Skip control. Its later repost “Continue anyway” path calls authenticated verification and checks attempt/identity requirements; it is not an anonymous SC skip contract. No such parameters were fabricated or probed.

## Candidate behavior and checks

`src/providers/droploud.ts` has bounded JSON-only Next Flight parsing, exact HTTPS host/UUID/route checks, bounded JSON HTTP reads, normal credentialed native requests, cancellation, safe destination checks, HTTP status mapping, and weak-map active session state. It does no network on inspect or page opening. It does not click, submit forms, fill fields, evaluate scripts, trust DOM-completed proof, fetch preview audio or use preview URLs.

No sign-in is initially required merely from configuration or page labels. After an explicit Download with a source-owned existing SID, the candidate first invokes the native final re-download endpoint. A successful existing completed session can therefore release a configured comment/email gate without generating text, requesting another login, or relying on DOM-completed proof. If the final endpoint refuses with 403, the candidate checks exact native SoundCloud HTTP status. Only `connected:false` can introduce the non-comment sign-in action. A refused final request is not repeated without a supported state change, such as the proven optional skip ACK.

For an uncompleted fresh session, the candidate checks native HTTP status before requesting required SoundCloud actions. After an explicit sign-in action on a non-comment gate, it directly opens the source-known native connect URL and polls the exact status endpoint for at most ninety seconds. The user reviews and completes the provider's real authorization. The candidate sends only the proven optional Droploud-follow skip ACK when automation is enabled. Unfinished comment/email-consent gates remain non-mutating. Only the server's final response can produce a destination.

Validation: 24 meaningful unit tests pass; strict TypeScript checking of the provider and tests passes with the repository's strictness options. Tests cover real session request bodies, read-only per-track SID precedence, sessionStorage fallback, no replacement UUID for existing own sessions, no storage writes, completed comment-gate re-download, no login before server status, no fake social/email/comment requests, no processing or storage reads during inspect/list, explicit authorization URL, refusal to launch unfinished comment-required authorization, ignored DOM-completed proof, no media fetch, external/file distinction, unsafe origins, malformed models, malformed ACKs, oversized JSON, cancellation and HTTP errors. All existing completed-session success cases use injected HTTP responses, and are separate from live evidence.

`test-droploud.mjs` is an authored installed-extension helper matching the existing browser harness. It exports `testDroploud({context,browserName})`; import it into the runner and invoke it after fixture delivery API interception is installed. It covers saved per-track SID success on comment/email models, a saved general SID and external page, actual cross-origin native status polling and an explicit authored consent callback window, 403-discovered authorization, unsupported unfinished comment/email gates, a proven optional skip ACK and an unsafe destination. Native buttons count clicks, stored SID maps are checked unchanged, account authorization headers are rejected, and any actual final media/page GET is aborted and fails the test. It has passed `node --check`; it has **not** been run in a browser here, per the no-shared-browser instruction. Root owns its integration and installed Chrome/Firefox execution.

## Remaining gaps and integration boundary

No real account authorization, completed native session or successful original-file response was exercised. All seventeen actual gates require a user-written comment, so all stop at the genuine native session boundary. Mandatory Instagram, email/consent, manual repost verification, and comment submissions have no supported automatic path in this candidate. There is no account-free full download claim.

The exact native final handoff is **`data.download_url`**, not `data.url`: both the gate and success handlers assign it directly to a download link. Neither handler declares a file storage hostname/path allowlist. The newly inspected success chunk contains no S3, Supabase, R2 or Google Storage configuration establishing a narrower file route. The candidate therefore validates the exact HTTPS API origin/route, JSON shape and native handoff field, then applies safe HTTPS destination validation while rejecting known page/auth/control loops. It now preserves provider-owned file URLs from that exact API response rather than rejecting all of them. No arbitrary file path is guessed or described as verified. The test's provider-owned file path is explicitly a fixture, not live evidence. Actual delivery host/type distribution remains unknown; native/omitted response types versus actual backend file-type spelling are source-backed candidates only, not live observed success shapes.

Implementation handoff (completed by the parent integration): copy `src/providers/droploud.ts`, `tests/droploud.test.ts` and the authored `test-droploud.mjs` browser helper (to `scripts/`), register the provider and add page matches for `https://droploud.com/track/*` and legacy `/gate/*`. Keep `api.droploud.com` outside content-script injection hosts; the observed normal CORS contract permits the API requests without adding API host permission. The copied `src/domain/*` and `src/providers/shared/read-text.ts`, local Vitest config, bundled `adapter.mjs` and absolute-path investigation scripts are isolated test harness material; do not overwrite repository equivalents. Root owns integration, browser verification, Git commits, publishing and support claims.

Public source links and sanitized matrices are suitable for a research commit. Full public chunks are local working evidence; raw HTML/model/contact data, session UUIDs, cookies, tokens and signed destinations were not written to published matrices.

## Parent integration validation

The adapter is registered and has passed the complete installed Chrome and Firefox
fixture suites. Four current hydrated live pages (two per provider) also passed
detection and returned real server-required failures in anonymous diagnostics.
These checks do not establish authenticated delivery. See the sanitized
[combined browser record](../http-browser-validation.json) for revisions and scope.
