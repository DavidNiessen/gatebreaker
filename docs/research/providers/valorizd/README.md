# Valorizd — public music rewards, 2026-10-27

Ten music gates from the provider's current public catalog returned their original
reward through the same anonymous lookup used by the native client. Seven are
uploaded files and three are external links. Two declare `emailCapture: true`;
their reward is still present without an address submission. The live matrix
records only gate URLs, types, step counts, field presence, and destination origins.
No original file or preview was requested.

## Native source contract

The gate-page component calls `getGateBySlug(route.gateId)`. Its service queries
Firestore collection `gates` with `slug == route.gateId`, then uses the returned
document as the client gate model. The publicly shipped Firebase configuration
fixes the project to `valorizd-d6172`.

The download component checks local action/email completion, then uses
`gate.reward.url` for URL gates or `gate.reward.fileUrl` for uploaded files. Its
file branch wraps that already available URL in `/api/download?url=...&filename=...`.
The component separately calls unlock statistics, creator notifications, and an
email-capture collection. None of those writes is necessary for reading the
public reward, and the adapter never calls them.

Gatebreaker issues a **read-only** Firestore `documents:runQuery` POST to the fixed
public project, with an exact-slug equality filter, a two-document ambiguity bound,
and a projection limited to `slug`, `title`, `gateType`, `reward.url`,
`reward.fileUrl`, `reward.fileName`, `steps`, and `emailCapture`. This is a document
lookup, not a gate-creation, social-action, or unlock write. No API key, auth header,
account cookie, profile query, email address, or analytics object is supplied.
It reads at most 256 KiB with cancellation, a 15-second deadline, no cache, and
redirect rejection. Ordinary website CORS is sufficient; no privileged Google API
host permission or general background fetcher is added.

Exactly one document must belong to the fixed project's `gates` collection and
match the requested slug and typed reward shape. Unsafe/recursive/local targets,
ambiguous or mismatched documents, malformed typed values, errors, and oversized
responses fail closed. Returned signed queries and legitimate fragments remain
unchanged in active memory and are offered for an explicit opening action.

## Live sample

`live-matrix.json` records ten exact-slug queries, all HTTP 200, one matching
document each, and a usable HTTPS reward. They span one to seven social steps,
link/file types, and enabled/disabled email capture. Origins are Dropbox, Google
Drive, Gumroad, and the native Firebase Storage origin. These are recovered
destinations, not verification of their file contents, availability, or safety.
An external destination can impose its own requirements.

The source is a music-specific service: the [public catalog](https://www.valorizd.app/)
lists these real remix/sample-pack gates, and its [creator guide](https://www.valorizd.app/for)
describes SoundCloud integrations. Counts do not establish market share or a
guarantee about every current or future gate. Only the observed canonical
`www.valorizd.app/gates/<slug>` format is registered; the apex currently redirects
to it. No creator collection, private content, or authenticated endpoint is probed.

## Installed browser and hydration validation

The adapter has 97 offline tests. Fourteen authored cases pass in both installed
Chrome and Firefox, including an owned script that removes itself before the
extension inspects the page. The native bundle's resource timing persists; with
matching canonical identity and the observed gate card, this is read-only evidence
of the same native script after Next.js consumes its tag. Foreign/fetch-only
resources and absent timing APIs are not accepted as that fallback. No Flight or
page script is evaluated. The panel marks only the native steps and download
containers; titles, artwork, preview, language, and cookie controls remain intact.

Real installed Chrome checks resolve all ten corpus gates. Real Firefox resolves
the Cerrone URL gate and Lisa file/email gate with zero remaining route script
tags, one extension query each, and no final-target requests. Reports distinguish
the original diagnostic harness's blocked native image/read transports from
extension behavior; the final native captures allow declared cover images only.
See the parent `soundcloud-installed-browser-live.json` for safe records. These
repeated checks do not add new corpus URLs.

## REA identities

| Selected source                                         | Bytes  | SHA-256                                                            | Evidence                                                                     |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Native `app/gates/[gateId]/page-c7657937882aa226.js`    | 44,242 | `641a6957d4380f18fbc36ee722f4e5f4180be10b2b5a9199fc45fb180d331192` | Parent `ev_8e64ee602fc95f152eb394868966b1e080694ae5310ac4aa4092a0da4880587b` |
| Service `8-76f259f2cda2cee1.js`                         | 19,502 | `08a920c897feb1da170db2f9c31edc228a70eabeffe80fb8f46ed8c405e2b8ac` | Parent `ev_483c80a3a0ea1bca5a5beb969ee867933af901664743e024df4a94651184455a` |
| Download/email UI `654-cc982a7a0ad940c9.js`             | 62,490 | `8b52e5b56ce413ef655af6493dc1f0faad04a18307c52920385d0270f06ff349` | Same service/download parent                                                 |
| Public project configuration `4236-19020b2c59553b68.js` | 8,200  | `f89b53b28a8b8864621fd4d801b0b5131a2b7dc65b7bc4382c73d830fcda1095` | Parent `ev_0134dddd1df120b2a36143158c59fe8ef5d4dc6dc539f9658b8a84638c1312ef` |

All selected scripts parsed with zero failures. The service/download selection
examined two scripts and 81,992 bytes; thirty inventoried files were outside that
selection. Dynamic/framework relationships remain partial. Static source proves
the native query/navigation path; successful anonymous HTTP lookups are separate
runtime evidence. Raw pages, Firebase configuration keys, reward capabilities,
creator objects, and private responses are not published.
