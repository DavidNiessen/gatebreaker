# PUSH.fm Reward Links — REA and live validation, 2026-10-27

## Implemented behavior

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

- [Erez Echo — Corrida De Toros](https://soundcloud.com/erezecho/corrida_de_toros).
- [Cristian Gil — NO LE DIGO QUE NO](https://soundcloud.com/cristiangil-dj/los-buyer-pikeras-no-le-digo).
- [Drvpz — RAWSTYLE KICKS](https://soundcloud.com/drvpz-songs/15-rawstyle-kicks-sample-pack-by-drvpz-160bpm-volume-1).
- [Uctumi — Clásicos argentinos](https://soundcloud.com/uctumi/sets/clasicos-argentinos-para-commodore-64-vol-2).
- [Neblues Records — Never Give Up](https://soundcloud.com/nebluesrecords/jhozer-never-give-up-extended-mix).
- [coolummusic — White Sun](https://soundcloud.com/coolummusic/coolum-white-sun).

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
