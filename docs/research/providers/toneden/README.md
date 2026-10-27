# ToneDen provider investigation — 2026-10-27

## Result and implementation decision

Fourteen creator-published ToneDen gates were checked anonymously. All fourteen
loaded public post metadata, exposed no direct destination, reported
`is_gate_open: false`, and returned HTTP 401 `notAuthenticated` from the shipped
download endpoint. Twelve were file-download unlocks; two were redirect-link
unlocks. Configurations included SoundCloud, Spotify, Facebook/SoundCloud, and
custom-URL/Twitter combinations across twelve creator profiles.

No working account-free path was verified, so no adapter or tests pretending to
support these gates were added. These observations establish the sampled current
behavior, not impossibility for every ToneDen gate. Existing authenticated browser
sessions and actual social authorization were intentionally outside this subtask.

The sanitized live matrix is `live-matrix.json`; it contains source page URLs,
public gate IDs, configuration labels, HTTP status and outcome only. No signed
destinations, cookies, session/CSRF values, account tokens, contact addresses,
private post data, or media bodies belong in published artifacts.

## Native contract established from shipped code

The public page loads `social.js?v=796778c537`, then lazy chunks at
`st.toneden.io/1.280/javascripts/…?v=fd4bea82314e5dc97dc5`.

The client uses these first-party routes:

- `GET /api/v1/posts?author_username=…&link_path=…` identifies the public post.
- `GET /api/v1/attachments/{id}/gateMetadata` supplies gate progress; the initial
  anonymous response omits an original download destination.
- `GET /api/v1/attachments/{id}/download` is the shipped download method.
- `POST /api/v1/attachments/{id}/unlock` performs the configured native action.

The native request helper uses same-origin credentials and the page's CSRF header.
It explicitly redirects to `/login` for HTTP 401 with the message “Please login to
your account to continue.” A bounded check on the Off-Grid Records sample used
the native no-auth Facebook branch with marketing opt-in false. Both the initial
request without cookies and a request carrying a freshly issued anonymous
session/CSRF context returned 401; the latter returned that exact authentication
error. No account was connected and no follow/save, email, or file operation was
performed.

The UI distinguishes `gateMetadata.is_gate_open` from merely loading the post.
The public `audio_url` field points at a SoundCloud stream and must not be treated
as the original download. Neither a visible Free Download control nor the
`skip_signup` configuration flag establishes anonymous access to the file.

## REA evidence

| Scope                                                               | Evidence                                                                                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh public page, no gate actions                                  | `ev_e89ec916d3e6dcc3da0b913b53f91bfc16c1cbc9ffd1f7b25b3f1683acb46b1d`                                                                                       |
| Metadata-only native network inventory, complete requested coverage | `ev_848de472f942e31abd0ba78681b33350d57e83b92963f4cc7b810e9b7b5017c3`                                                                                       |
| Exact extracted API/post factory initializers                       | parent `ev_e95cb3626e8e8b92ffe9d64b33287347fe6fbb9fc448729b1cc427e754e9590b`, summary `ev_87b0293f25fe20a6ffc90f78d1097ddb18b5ae7798ee3743932de6a32c29a8fb` |
| Gate UI chunks 3736, 8779, 9876: three parsed, zero failures        | parent `ev_f7bac6f29841769dc364ae7f7d1cfdfcf5e668e339c43aa689ed272dc9979a61`, summary `ev_fbdca748c3e08cc40aee11562be558591588e8735e7514df9f35bd9931c86489` |
| Exact extracted request-helper/gateMetadata initializers            | parent `ev_7ab86b4aca1536856d3518a94aa5da3ed7718256858f293b7d6333d63fb20234`, summary `ev_35b269744d1845d86ce59007e8c62ccc1d72cd661ad2c820b7d2dd0b8386a07e` |

The initial whole-bundle REA attempt exhausted its 1 GiB worker heap before parsing
the 2.5 MB bundle (`ev_61edcba9b88ff2e3c25157a004caf494f176c7fe63cf0278b77989f694b7f77c`).
That result is not treated as coverage. Exact TypeScript-AST source initializer
extraction was then used to bound the unanswered API/request questions. No source
was evaluated; each extracted file adds only an inert `const factory = …;` wrapper.

Factory provenance is recorded in `extract/provenance.json`, including whole-source
SHA-256, exact UTF-8 byte offsets, initializer digests and the added wrapper. In the
original `social.js`, relevant exclusive byte ranges are:

| Factory | Original byte range | Responsibility                                       |
| ------- | ------------------- | ---------------------------------------------------- |
| 236229  | 790412–790722       | Gate metadata request                                |
| 240087  | 790730–791557       | Attachment unlock/download routes                    |
| 609873  | 812164–812715       | Public post request                                  |
| 907864  | 867740–869953       | Headers, request handling and authentication failure |

The targeted analyses successfully parsed their selected sources. Semantic graphs
remain partial because webpack dependencies and dynamic calls are unresolved;
the three UI chunks also hit selected semantic-retention limits. No complete-app
or server-code reconstruction is claimed. Only declared metadata was captured in
REA runtime work; request/response bodies and header values were disabled.

## Discovery sources

The matrix URLs were discovered from creators' own SoundCloud/Bandcamp pages,
artist websites, and creator profiles; source examples include
[Off-Grid Records](https://audius.co/OffGridRecords/10th-porter-sozin-free-download),
[Selectro Records](https://selectrorecords.bandcamp.com/album/free-download),
[TANTRON](https://soundcloud.com/tantronmusic/on-the-floor-tantron-remix),
[GoodMatee](https://soundcloud.com/goodmatee/the-neighbourhood-softcore-goodmatee-jersey-club-remix-free-dl-link-in-describtion),
[Dom Terrace](https://domterrace.bandcamp.com/track/foolish-dom-terrace-remix), and
[Danny Darko](https://dannydarko.net/remix-stems-acapellas-danny-darko-original-songs/).
The live checks used the actual ToneDen pages/API rather than trusting search
snippets or third-party bypass services.
