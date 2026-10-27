# PUSH.fm Reward Links � REA and live validation, 2026-10-27

## v0.4.0 public-only baseline

The current public reward flow has an account-free final lookup on some gates.
The adapter reads fresh metadata and requests the native reward endpoint with
an **empty object** of completed actions. It never supplies social action tokens,
calls action-issuance endpoints, opens account/profile windows, subscribes an
email, invokes telemetry/conversion APIs, or requests the recovered file.

```text
GET https://push.fm/api/guest/unlock/<slug>
GET https://push.fm/unlock/<slug>/complete?token=<URL-encoded Base64 of {"actions":{}}>
```

The native component initializes `completedActions` to `{}` and constructs that
Base64 JSON query. The Base64 string is local UI state, not an OAuth credential
or a forged signed account token. The adapter preserves the native empty shape;
it does not represent any social action as performed. Server-enforced required
actions may still refuse the lookup. No bypass of those refusals is claimed.

Supported routes are the observed `https://push.fm/cu/<slug>` and
`https://push.fm/unlock/<slug>`. Ordinary Smart Links (`/fl`), Pay Links (`/pl`),
unverified aliases/hosts, text rewards, and unsupported response formats are
outside this adapter. A route alone does not trigger recognition: known native
metadata and the owned product script are also required.

Both API requests use credential omission, no redirects, no cache, a 15-second
deadline, and a 256 KiB streamed response bound. Metadata must match the current
slug and the result format/count. All resolution remains user initiated and
cancellable. Only the browser's existing enable preference is persisted.

## Native result shapes

- A URL reward returns `{body, content_id}`. The native URL component opens
  `content.body`; it is not a Spotify/profile fallback. The adapter validates an
  external public HTTPS destination and preserves meaningful fragments.
- A file reward returns an array of `{url, size, name, type, content_id}`.
  Current observed files use the exact origin
  `https://routenote-push.s3.eu-west-2.amazonaws.com`, a numeric directory and
  one encoded filename, and AWS v4 signed query fields. Native URLs are preserved
  without reconstructing signatures or decoding their request address.
- Multiple files remain separate choices in native order. The success result's
  `destinations` contains each file's bounded text label and URL; the first URL
  also occupies the existing `url` field. Nothing opens automatically. Every
  item is validated; an unsafe/malformed/duplicate item rejects the whole list.
  Twenty files is an implementation bound, not a demonstrated provider limit.

Percent-encoded spaces, punctuation, and UTF-8 filenames are observed in live
responses and supported. Validation decodes only to check the filename for
separators, control characters, and malformed escapes; it returns the original
safe URL. Signed values and object keys are omitted from published records.

The native Vue app replaces the initial `#app` node during hydration. Recognition
handles the original marker and the hydrated native title. The panel is inserted
after the native title block; the current interaction/progress containers and
`div.cta-banner-lift` promotional overlay are hidden. The overlay otherwise covers
the file chooser on narrow viewports. Artwork and title remain visible. Disabling
restores native controls and the promotional overlay.

## Live corpus

`live-matrix.json` records ten native final-reward attempts, all with fresh public
metadata and no completed actions:

| Gate          | Result | Notes                                                |
| ------------- | ------ | ---------------------------------------------------- |
| `corridafree` | 500    | Current server error; no success inferred            |
| `w0hb5hkn`    | 403    | Required Instagram/SoundCloud/TikTok actions refused |
| `caxv2pvp`    | 200    | Single-file music sample pack                        |
| `icsntqfq`    | 200    | Single-file music album                              |
| `ngu`         | 200    | URL reward on Google Drive                           |
| `white-sun`   | 403    | Required YouTube action refused                      |
| `free-music`  | 200    | Public example URL reward on Pixabay                 |
| `sdproject`   | 403    | Required Spotify actions refused                     |
| `6qgmrvut`    | 403    | Two-file gate with required YouTube action refused   |
| `b259p2ar`    | 200    | Two music files; no actions configured               |

This is **5/10 reward responses**, including a public example and an already
ungated multiple-file reward; it is not 100% support. Three other historical
SoundCloud-linked slugs (`vocal-chill-mix-5`, `in-this-world`,
`searching-for-the-sun`) returned metadata 404 and were not sent a final lookup.
Thus thirteen distinct reward URLs were investigated in total. HTTP 200 means
validated reward metadata, not verified file availability or file integrity.

The actual adapter was then run against fresh HTML/metadata for the five successful
cases: **5/5 resolved**, including the two-file choice. `adapter-live.json` records
these JSDOM/HTTP checks; they are distinct from installed-browser integration.
No full file, byte range, HEAD, or external destination request was made.

Primary SoundCloud discovery includes:

- [Erez Echo � Corrida De Toros](https://soundcloud.com/erezecho/corrida_de_toros).
- [Cristian Gil � NO LE DIGO QUE NO](https://soundcloud.com/cristiangil-dj/los-buyer-pikeras-no-le-digo).
- [Drvpz � RAWSTYLE KICKS](https://soundcloud.com/drvpz-songs/15-rawstyle-kicks-sample-pack-by-drvpz-160bpm-volume-1).
- [Uctumi � Cl�sicos argentinos](https://soundcloud.com/uctumi/sets/clasicos-argentinos-para-commodore-64-vol-2).
- [Neblues Records � Never Give Up](https://soundcloud.com/nebluesrecords/jhozer-never-give-up-extended-mix).
- [coolummusic � White Sun](https://soundcloud.com/coolummusic/coolum-white-sun).

The provider's [reward-download troubleshooting](https://support.push.fm/kb/why-isnt-my-digital-file-or-reward-downloading/)
distinguishes downloadable files, secret URLs, and messages, and documents that
mandatory actions can prevent access. A public response on one sampled gate
does not establish the enforcement behavior of another.

## REA evidence and source identity

The currently shipped public product bundle is 897,806 bytes. Five exact data,
reveal, file, URL, and reward-component declarators were extracted with Acorn
without execution. Their source URL, SHA-256, UTF-8 byte ranges, fragment hashes,
and `const ` / `;` wrappers are in `source-provenance.json`.

REA parent:
`ev_0be0fb4d9bab342059040d01a5f4c684584c88e37bffc6fde9d7982b4ab7c7db`.
Summary:
`ev_ef8676a0cf2084193747b506b068080dbc9991c9b40744020ebed20e847c84eb`.
Five selected extracts, 9,780 bytes, zero parse failures. Nine other inventoried
scratch files were outside this exact selection; no complete application,
helper dependency, server implementation, or dynamic semantic coverage is claimed.

The source separates file telemetry (`PUT /api/unlock/<slug>/telemetry`) and
conversion reporting from reward retrieval. Those APIs are never called by the
adapter. The native file component also auto-downloads a single file on reveal; Gatebreaker
deliberately returns the URL(s) for a separate user choice instead.

An early exploratory request incorrectly used `actions: []` and received 500.
Correcting the source-observed shape to `{}` established the working path. One
native SoundCloud click-token issuance probe returned 419 without credentials;
it was unnecessary and was not repeated or implemented. No profile was opened,
account connected, or actual social action performed. Adapter calls remain the
two documented GETs only.

## Verification boundary

The isolated adapter has 87 offline tests covering native empty-state requests,
both route/document forms, hydration, single/multiple files, encoded filenames,
unknown/malformed/oversized data, signed URL boundaries, server refusals,
cancellation, and absence of action/file requests. Strict TypeScript and the
project's Prettier configuration pass. Installed-browser presentation and the
shared multiple-file chooser are validated separately by the main integration.

Publish only this report, sanitized matrices, and provenance. Raw HTML/JSON and
signed result URLs remain scratch material and must not be committed.

## Download-triggered automation follow-up

The source is the retained public native `products.js` from:

`https://d29xpkeqnsbaz3.cloudfront.net/be42908a-dbee-4f12-b991-0d45b91ae9a1/js/products.js`

Original source SHA-256:
`0427647237121605eb00e10421d9e4ec1ff17837834fbe1f6660d69650d29d01`.
`extract.cjs` extracts inert AST variable-declarator ranges without executing the
bundle. `acknowledgement-provenance.json` retains byte ranges and exact unwrapped fragment hashes.
The analysis supplies `const ` and `;` wrappers only. The selected native mixin,
click components, Spotify render functions, action list and progress contracts
were reanalyzed with REA:

- Parent: `ev_24d6b70fd30b5d9faa47597ac1229f348c8d920d7cbd4cebcf29538fde9ba2de`
- Summary: `ev_6d79ec789e6d8972a922065328ecbbf0024ce57c689858b4e2ca4243129266c0`
- 15 exact selected extracts, 10,831 input text bytes, zero parse failures.
- 30 other inventoried files remain unselected. Static relationship coverage is
  partial, with 1,038 semantic unknowns; no server or account execution is inferred.

The native `Eo` mixin constructs `/unlock/<slug>/action/<id>`. Its default
server-driven execution opens a popup and consumes only same-origin messages
whose `driver` matches the action. The message contains an opaque **gate receipt**
`{driver, token}`, not an OAuth access token.

Twitter, YouTube, SoundCloud, Instagram and TikTok components override execution:
`authenticate()` returns `null`; `execute()` performs a POST to the native action
endpoint, emits the returned driver/receipt, then opens a public profile popup.
No provider social API is called by these components. The extension issues only
the acknowledgement POST, uses the unchanged returned gate receipt, and omits
the public profile popup.

Spotify's save/follow/follow-playlist/play components retain the default native
OAuth popup path. Their exact `.btn-spotify` labels and disabled completion state
come from the selected public render functions. Presave, Apple Music, Facebook,
Deezer, mailing-list and unknown execution contracts are not automated.

## Fresh anonymous validation

`probe.cjs` obtains a fresh isolated native page session/CSRF, fetches public
metadata, POSTs only the exact supported public non-OAuth acknowledgement
endpoints, and submits unchanged gate receipts. No account, social API,
follow/comment/save, profile popup, email or marketing request is used. Only
status/shape summaries are retained in `acknowledgement-probe.json`; cookies, CSRF values,
gate receipts and destination URLs never leave memory. A repeat validated the
exact `X-CSRF-TOKEN` header without relying on an additional X-XSRF header.

| Gate        | Native action receipts                           | Final response      |
| ----------- | ------------------------------------------------ | ------------------- |
| `w0hb5hkn`  | Instagram, SoundCloud, TikTok, all 200           | 200 URL reward      |
| `white-sun` | YouTube, 200                                     | 200 one-file reward |
| `6qgmrvut`  | YouTube, 200                                     | 200 two-file reward |
| `sdproject` | None requested: two native Spotify OAuth actions | 403 without sign-in |

These are genuine newly unlocked cases, not just already ungated rewards. No
account sign-in was performed, so successful real Spotify authentication and
post-login reward delivery remain unverified.

Implementation and fixtures use `ProviderContext.automate`, enabled only after Download.
No page-load requests or automatic OAuth windows are added. Real authenticated
Spotify remains unverified; the three account-free successes do not imply all-gate support.

## Installed-browser follow-up

The current built Chrome extension was tested on the same four live gates after
Download. All three account-free rewards resolved, including the two-file gate;
`sdproject` displayed two required Spotify sign-ins and disabled Download.
See `acknowledgement-installed-live.json`. These are adapter/browser observations,
separate from the direct HTTP probes above. No real account was authorized or
destination body read. Two native storage image attempts were blocked before
network transfer; no final reward file request was made.

Native rendering also needs the exact public Rocket Loader path
`/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js`: it activates the
page's inert product and inline bootstrap scripts. The isolated validation and
anonymous-only developer checker allow this loader while blocking tracking and
destination requests. This is a validation-environment dependency, not an extra
extension permission.

The integrated adapter adds 29 offline automation tests plus five installed-browser
scenarios in both Chrome and Firefox: acknowledgement/session boundaries, two
required sign-ins, metadata-discovered login pause/resume, receipt plus native DOM
confirmation, cancellation, and unsupported action metadata. Real authenticated
Spotify and unsupported action contracts remain unverified.
