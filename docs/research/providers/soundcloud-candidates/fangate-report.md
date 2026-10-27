# Fangate.eu — native session investigation, 2026-10-27

## Outcome

Ten current music gates from the provider's [Top 30](https://www.fangate.eu/top-30)
each created an anonymous native download session (HTTP 201), but every
JSON-only download-link lookup returned **HTTP 403** because the session was not
completed. Each sampled session required SoundCloud OAuth; four also required
Spotify OAuth. Optional Instagram visit steps and SoundCloud comment steps varied.
No account-free adapter was established. A separate featured Lavern gate gave the
same 201/403 result and required both SoundCloud and Spotify.

Session creation is the native response to Get the free download; it does not
claim an action completed. The probes called only that endpoint and the JSON
download-link lookup. They did not call `log_action`, SoundCloud comment, email
capture, OAuth redirect/confirmation, visit/fingerprint analytics, or a file URL.
The ephemeral session UID and visitor UUID were kept only for the active probe,
not published in the matrix. No login, social action, email, or file download
occurred. The sampled response exposed no original-file URL before completion.

## Native request path

The shipped public client fixes its API base to `https://api.fangate.eu/api`.
Its exact native methods are:

```text
GET  /download_gates/public/?slug=<gate slug>
POST /download_sessions/  {download_gate_slug, visitor_id, user_agent}
GET  /download_sessions/<uid>/
GET  /download_sessions/<uid>/download_link/
```

The public track component invokes session creation, then navigates to
`/download/<uid>`. The download component renders the returned steps and waits
for server `completed === true` before requesting `download_link/`; it uses the
returned `url` for navigation. This investigation made an early link lookup
without pretending completion; the server consistently refused. Page snippets,
SSR metadata and audio previews are not evidence of access to the original file.

The same client separately defines `log_action`, `soundcloud_comment`,
`oauth_redirect_uri`, `oauth_confirm`, and email-capture endpoints. They were
identified from public source only and not called. Non-skippable OAuth cannot
be inferred complete from a page click or a locally edited progress counter.

## REA evidence and source identity

The large 417,900-byte main bundle hit REA's worker heap limit during an initial
analysis. That analysis is partial and does not establish complete client
coverage: parent `ev_0c2e7ef25813eec61ecc641f561deef34140595d8a64e82dd32d58e11b6fb502`,
summary `ev_983067203e556b7dc1e0d13d4129fddd255cb2d8f22955d96edbbf8254162524`.

For the native API question, Acorn selected eight exact top-level function
declarations and three API-base constants from those exact bytes. Functions
were copied unchanged; isolated variable declarators received `const` wrappers
to make them syntactically standalone. `fangate-source-provenance.json` records
the source SHA-256 and both original UTF-16 and UTF-8 byte ranges and selected
byte digests. No selected declaration, bundle bootstrap, or network code was
executed. The excerpt was analyzed together with the actual track/download
components, without the oversized framework/vendor graph.

Focused REA parent: `ev_fe5b26e80477d96043bf26e15eb4ca87b793346accdc86c1a95c35eb3f6d4e50`.
Summary: `ev_8a4a812a30641a0c89e8d4d6f0d5bdc1e4f356b8dca40a47d8b23c5969267169`.
Three selected files, 13,643 bytes, zero parse failures and no truncation.
Unresolved framework imports and dynamic/server behavior remain unknown;
the native endpoint strings and response consumers are directly observed.

| Source                      | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `index-BN7C5Ovu.js`         | `3745f1c5ec0bc8b76bb1ff7c72a2561956f81b62bfb872bb4fceb78b46841e3e` |
| `tracks._slug-aeVhkyZ4.js`  | `0d6caa96482b70d1142403edb8366bb996647b9b6265d2eb8668b63cf4569623` |
| `download._uid-CZCvl6cV.js` | `02b1e2a4c85d8a98718d95c9339d05709790576b2643ee6fe6e434f6cd0155e6` |

The published live matrix retains gate URLs, requirement types, action names,
missing-provider names, status codes and URL-presence booleans. It excludes session
UIDs, visitor UUIDs, account identities, private SoundCloud track paths, tokens,
cookies, and final-file paths or signatures.
