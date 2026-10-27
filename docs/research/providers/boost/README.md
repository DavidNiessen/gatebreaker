# Boost.ink adapter validation — 2026-10-27

## Implementation

Adapter: `src/providers/boost.ts`.
Offline regression coverage: `tests/boost.test.ts` (49 tests).
Strict TypeScript, Prettier, and installed Chrome/Firefox fixture checks pass.

The adapter recognizes the exact public HTTPS hosts `boost.ink`, `de.boost.ink`,
and `nl.boost.ink`, with a single 1–64 character gate ID made of ASCII letters,
digits, hyphen, or underscore. It requires both the native complete button and
an actual owned `/assets/js/unlock.js` script; an injected foreign base cannot
make a foreign script appear owned.

The parent REA analysis established that shipped `unlock.js` copies its
`bufpsvdhmjybvgfncqfa` attribute, removes it immediately, and ultimately uses
`atob` to navigate to the embedded destination. This is the provider's encoded
public link, not an authorization token or original media inference. Parent
REA evidence: `ev_6427de47308ab07fa48f7780551613444393770d2306bd64938656bdd03f635d`,
summary `ev_e2b7d6003e612bebfa432ff14f347446a05032123322953a73ff10fa4d845dfd`.

Because document_idle may run after the native script consumes the attribute,
the adapter can refetch only the current gate HTML when the user requests
resolution. The fetch omits credentials, rejects redirects, disables caching,
honors cancellation/timeouts, and reads at most 2 MiB through shared
`readLimitedText`. The fresh HTML is parsed inertly with DOMParser; its scripts
are never evaluated. The final target is never fetched or followed.

The decoder bounds input/output length, rejects malformed base64 and unsafe or
self-looping URLs, and uses the shared public HTTPS destination policy. It
preserves destination fragments, including MEGA keys. It neither accesses
localStorage nor clicks provider action controls. Inspection is network-free.

The presentation hook anchors Gatebreaker after the native h1 and keeps the
individual action blocks and native completion button hidden while enabled.
Parent generic lifecycle code restores native visibility when disabled.

## Live extraction matrix

`live-matrix.json` contains eight tested URLs covering six distinct IDs plus
German and Dutch pages. Every URL returned HTTP200 and resolved the same
destination both with the attribute still present and after simulating its
native removal. The latter used exactly one gate-only refetch.

| Gate                       | Declared step count | Destination origin             | Result                           |
| -------------------------- | ------------------- | ------------------------------ | -------------------------------- |
| `https://boost.ink/oneu`   | 3                   | `https://bigota.d.miui.com`    | Both extraction paths matched    |
| `https://boost.ink/9oy5`   | 1                   | `https://biofeita.com`         | Both extraction paths matched    |
| `https://boost.ink/27e`    | 1                   | `https://mega.nz`              | Both matched; fragment preserved |
| `https://boost.ink/me1-q`  | 4                   | `https://link-hub.net`         | Both extraction paths matched    |
| `https://boost.ink/2rd`    | 2                   | `https://www.datafilehost.com` | Both extraction paths matched    |
| `https://boost.ink/-s2`    | 3                   | `https://direct-link.net`      | Both extraction paths matched    |
| `https://de.boost.ink/27e` | 1                   | `https://mega.nz`              | Both matched; fragment preserved |
| `https://nl.boost.ink/27e` | 1                   | `https://mega.nz`              | Both matched; fragment preserved |

These are verified Boost destination resolutions, not verification that final
files are still available. Some creator destinations are another gate. No final
destination, file, follow, subscription, rating, email or account request was
made. Final paths, fragments, and keys are omitted from the publish-safe matrix.
No unobserved mboost or other aliases are claimed.

All eight URLs also resolved in the real installed Chrome extension, with native
scripts allowed on the provider origin and unrelated requests blocked. The stored
record is `../installed-browser-live.json`. Exact page hosts are registered in
`config/provider-hosts.json`; no arbitrary privileged target fetch is added.
