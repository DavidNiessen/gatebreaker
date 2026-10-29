# Automatic SoundCloud reposts — 2026-10-29

Gatebreaker can perform a real required Droploud repost after Download and required
sign-in. The provider's `manual` mode means its backend cannot do the repost;
it does not require clicking SoundCloud's Repost button. A packaged page function
uses SoundCloud's own authenticated GraphQL contract in an owned SoundCloud window.
Droploud then verifies the account action and must approve the final file.

## First-party evidence

A fresh headless REA browser loaded
[the reported public track](https://soundcloud.com/hecki_music/whenever-whenever),
waited for hydration and closed its temporary browser. No user profile or account
was accessed. The native JSON contains one `hydratable:sound` record with
`data.kind:track`, matching permalink URL, numeric ID and `soundcloud:tracks:<id>`
URN. Its `apiClient` record supplies `data.id`, the current public client ID.
The legacy hydrator assigns that value to its API configuration; no fixed client
ID or supposed `client_id` cookie is needed.

The current `/n` app's first-party bundles establish these contracts:

| Shipped asset                                                                                | Relevant contract                                                                                                           | SHA-256                                                            |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [1_9l8btqezwtg.js](https://assets.web.soundcloud.cloud/_next/static/chunks/1_9l8btqezwtg.js) | `RepostTrack` calls `repostTrack(trackRepost:{urn})`; success is `Repost`. Removal is a separate `UnrepostTrack` operation. | `fa3f12b60f3e717706e205f407ba27481b13448f463533b72240b189b419802f` |
| [2sa3415ia1l3d.js](https://assets.web.soundcloud.cloud/_next/static/chunks/2sa3415ia1l3d.js) | JSON GraphQL at `graph.soundcloud.com/graphql?client_id=…`; native authorization uses the `oauth_token` cookie.             | `c4cad420a033b18e176d50808eb269c079afa2d00b7a5983b283b04a44e3d4bd` |
| [31q69mn8yz1fk.js](https://assets.web.soundcloud.cloud/_next/static/chunks/31q69mn8yz1fk.js) | Browser `getAuthTokenCookie` reads `document.cookie`; refresh tokens are separate and not inspected.                        | `ad983ee3b5b56481b32e670f298db4a31d8c045139a62e6164b2ba1af645f535` |
| [3vk2e-v34a_i7.js](https://assets.web.soundcloud.cloud/_next/static/chunks/3vk2e-v34a_i7.js) | `allTracks` accepts exact URNs; track fragments include permalink and viewer-relative `engagement.hasReposted`.             | `b09d5bc647a16169eb9778234cb5706ddbe1f0093218a0eadb4a012ab2c466c3` |

An independent minimal read-only query returned HTTP 200 with one exact Track,
matching URN and permalink. Requesting viewer engagement anonymously returned
`FORBIDDEN` and `engagement:null`. Missing viewer data is never interpreted as false.
No authenticated query or real repost mutation was performed during this research.

REA evidence IDs:

- Public page load/wait: `ev_f117754ee91edc8c992ef1b7f78a46ca8f574f6c129dc240a583dffd836d837f`.
- Next source analysis: `ev_9216a8f56c7202a93d5089371b9301f2bd4d68ea2470c46b886d21e385aca48d`.
  Four selected scripts, 162854 bytes, no parse errors; 71 inventoried scripts
  were outside analysis. Static findings do not prove authenticated execution.
- Legacy source analysis: `ev_f96e34043a0f23a8e7284970145494dfe87eeef02e917a02ad26f3c66f3bd944`.
  One selected 684916-byte script, no parse errors; 14 scripts outside analysis.

The GPL reference project was consulted for behavior; its implementation and
credential-file transport were not copied into Gatebreaker.

## Ownership and execution

The extension background accepts only its top-frame content script on the matching
Droploud gate. Each operation binds a nonce, parent tab/document, canonical target,
owned child window, lease and deadline. Packaged code executes only in that owned
SoundCloud top frame. No page-facing message bridge can invoke the mutation.
Navigation, disabling, cancellation, lost heartbeat or changed native session stops
remaining work. Worker recovery closes stale owned tabs rather than resuming writes.

The SoundCloud page keeps its account token local. The extension receives only a
fixed state enum. A validated viewer `hasReposted:true` skips mutation; false
allows only `RepostTrack` for the exact bound URN. Account changes between the read
and write are rejected. The code never invokes a toggle, unrepost, comment mutation,
automatic consent or like attestation. It stops or waits for login/challenges instead
of treating blocked responses as success. A server-accepted repost cannot be undone
by cancelling later.

Droploud's observed status exposes only a display username, not a proven immutable
SoundCloud account identity. Use the same account in both sign-ins. Native
verification detects an account mismatch after the action; Gatebreaker does not
claim a cross-service identity comparison before posting.

Unit and installed-browser fixtures cover already-reposted state, HTTP repost,
login and automatic resume, account/session changes, malformed or mismatched
metadata, GraphQL errors, challenge/rate-limit responses and cancellation.
Fixtures use authored accounts and intercept all social requests and delivery;
they do not establish a real account's permission or every provider configuration.
