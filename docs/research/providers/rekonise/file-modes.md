# Rekonise file, snippet, email and status contracts — 2026-10-27

## Result

Uploaded-file gates can return a direct HTTPS download URL using the same public
metadata → elapsed native interval → unchanged-token unlock GET as link gates.
Three benign music/preset gates returned HTTP 200 JSON with `file` and `pass`.
No file body was requested or downloaded. A later separate HEAD-only availability
check on one returned URL is recorded below.

A real email-list gate also returned a link using this path without an email
submission. A nonempty `email_lists` field is therefore not sufficient grounds
to reject a gate before trying the ordinary public unlock request.

## Exact public read contract

The native service constructs:

```text
GET https://api.rekonise.com/social-unlocks/<slug>
GET https://api.rekonise.com/social-unlocks/<slug>/unlock?token=<encodeURIComponent(public unlock_token)>
```

An optional `&pass=<encodeURIComponent(saved native pass)>` is added only for a
previously stored pass. All probes here used a fresh public token and no pass,
cookie, account, Authorization header, action-completion request, or analytics.
The public custom-route metadata method separately constructs
`GET /social-unlocks/<username>/<customSlug>`; it does not change the canonical
model slug used for unlock. Custom-route live support was outside this probe.

The unlock response is JSON, not a Blob. Native code reads `response.url` for a
LINK and `response.file` for a FILE, then calls `window.open(value, '_blank')`.
There is no file request, responseType override, or custom download header in
this code path. File support should return the verified `file` string directly.

Observed file URL shape, with storage key and signed values redacted:

```text
https://api.rekonise.com/storage/serve/b64_<encoded-object-key>?exp=<expiry>&sig=<signature>
```

The path uses one encoded storage-object-key segment, not the metadata's numeric
`file_id` directly. Preserve the returned URL; do not construct or decode a new
download URL. `exp` and `sig` names were observed; value syntax and expiry rules
were deliberately not retained or inferred. The signed link may expire.

## Live file checks

Each check used credential omission, no redirects, a 15-second request deadline,
and only the two public provider GETs. All models had no email-list requirement.
Each wait was 35 seconds: two ordinary actions at the native 15-second upper
bound per action plus a 5-second margin. This is a source-backed test interval,
not a claim about the exact backend minimum.

| Public benign gate                                                                    | Actions | Metadata | Type/status | Unlock | JSON keys      |
| ------------------------------------------------------------------------------------- | ------- | -------- | ----------- | ------ | -------------- |
| [Rels B vocal preset](https://rekonise.com/rels-b-vocal-preset-by-underisland_-9cofs) | 5, 5    | 200      | 2 / 1       | 200    | `file`, `pass` |
| [Eladio Carrion vocal preset](https://rekonise.com/eladio-carrion-vocal-preset-3y3ic) | 5, 14   | 200      | 2 / 1       | 200    | `file`, `pass` |
| [GRADUATION music ZIP](https://rekonise.com/graduation_prodbyzazzazip-xtdy0)          | 1, 4    | 200      | 2 / 1       | 200    | `file`, `pass` |

All three responses had `application/json; charset=utf-8`, a nonempty credential-free
HTTPS file URL on `https://api.rekonise.com`, and query keys `exp`, `sig`.
The path shape was separately confirmed on one fresh repeat of the first gate.
Publish-safe records are `file-probe.json` and `file-path-probe.json`.

A final availability check obtained one fresh first-gate token, waited 35,007 ms,
and received metadata/unlock HTTP 200. It issued **HEAD only** to that exact
returned signed file URL with credential omission, no Referer, no redirects,
and a 15-second deadline. HEAD returned **200**, `Content-Type:
application/octet-stream`, Content-Length present, and Accept-Ranges absent.
No file GET or body read occurred; any response body stream was cancelled.
This confirms HEAD availability without a referrer for that one returned URL;
it does not verify file contents or prove all file URLs behave identically.
The signed URL and query values were held only in process memory. Record:
`file-head-probe.json`.

## Email-list requirement: UI and backend are different observations

The widget inserts one email step when `socialUnlock.email_lists?.length` is
nonzero. Its position comes from `config.emailPosition` (clamped to the action
count; defaults to zero). It increments `totalActions` by one. The normal UI
opens `EmailCaptureDailogComponent`, providing only `{socialUnlockSlug}`; the
step becomes complete only after a truthy dialog result. The main unlock button
is disabled while `actionsCompleted < totalActions`. Thus email is a required UI
step when configured, rather than a fourth content type.

This client behavior does not establish the server's enforcement. A bounded live
check on [SAX MOTION Loop Kit](https://rekonise.com/sax-motion-loop-kit-x908v)
returned metadata 200, type 1/status 1, actions `[5]`, `email_lists.length === 1`,
and a public token. After 35,012 ms, its unchanged-token unlock GET returned 200
JSON keys `url`, `pass`, with a destination on `https://drive.google.com`.
No email endpoint, email form, dialog, address, account, action-completion request,
or destination request was used. Record: `email-probe.json`.

This is evidence for attempting normal public unlock on email-list gates. It does
not prove every email-list gate works, and no email-submission contract was
executed or guessed.

The widget proves one extra email UI step, but it assigns no 15-second timer to
that dialog. An adapter's extra 15-second email wait is a conservative allowance,
not a literal native email-duration rule. It requires no additional POST.

## Native content/status enums

| Content type | Meaning | Native result handling     |
| ------------ | ------- | -------------------------- |
| 1            | LINK    | `response.url` is opened   |
| 2            | FILE    | `response.file` is opened  |
| 3            | SNIPPET | `response.snippet?.content |     | ''` is shown in a modal |

Snippet content is text, not a proven destination URL. URL-resolver support should
not reinterpret arbitrary snippet text as a URL or invent a file download.

| Status | Meaning          | Native unavailable page    |
| ------ | ---------------- | -------------------------- |
| 1      | PUBLIC           | No                         |
| 2      | EXPIRED          | Yes                        |
| 3      | REMOVED          | Yes; creator removed it    |
| 4      | COPYRIGHT_NOTICE | Yes; copyright takedown    |
| 5      | WITHOUT_ADS      | No                         |
| 6      | WITH_ADS         | No                         |
| 7      | TAKEN_DOWN       | Yes; content-rules removal |

Visibility is a separate enum: PUBLIC 0, PRIVATE 1, DRAFT 2. Do not confuse it
with content status. No password content type, password input, or password
unlock parameter was observed in the selected public service/detail/widget
sources. Account password-reset routes exist in main, which does not establish
a password-protected gate feature. Password-gate backend behavior remains unknown.

## Creator action limit and upload service

The currently served public `/create` HTML now names `main-NECCLACJ.js`. This
imports public creator `chunk-ieGIiEHu.js`, which imports the shared actions form
`chunk-CKm1LvK1.js`. That form has `maxActions = 20`, disables Add action at the
limit, and `addAction()` refuses a twenty-first action with “A link can have at
most 20 actions.” Both public and dashboard creator source use this form.

This is a native UI limit, not proven server validation or proof no historical
gate exceeds it. The predefined-action restore path calls `addAction(false)`,
which bypasses that interactive guard. A conservative adapter bound greater
than 20 is an implementation choice, not a native creator maximum of 30. Twenty
watch-video actions would span at most 900 native UI seconds, before any margin.

The details form selects a stored file, then patches `file_id: file.id` and title
from its name. Its storage service base is `${api}/storage`:

```text
get(id)       -> GET /storage/<id>
upload(body)  -> POST /storage, body passed unchanged,
                { reportProgress: true, observe: 'events' }
update(file)  -> PUT /storage/<file.id>
delete(file)  -> DELETE /storage/<file.id>
```

Only shipped service source was read. None of these storage APIs was called.
The service alone does not prove the upload body's multipart fields or full
upload response schema. That creator upload contract is unnecessary for safely
returning the public unlock response's signed download URL.

The snippet service uses `/snippets`, ordinary JSON GET/POST methods, and a client
content-size validator with a 1,048,576-byte maximum. No snippet service endpoint
was called. The publicly unlocked snippet shape is established by the detail
component above, not by these authenticated creator methods.

## Source identity and REA provenance

Offsets below are UTF-8 bytes on line 1 of each minified source.

| Source              | SHA-256                                                            | Relevant offsets                                                                                    |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `chunk-BWdt6ug8.js` | `b4a4f01bb618c9c4d5d0b71421a9173f090252dce8899cc22a2bff341bf259d5` | 497 custom metadata route; 575 unlock URL construction                                              |
| `chunk-BTyx-vUk.js` | `90407ef9e24b22877f49fb89b738479df005538a8cf25287c3bf791af12bfb4b` | 1981 LINK/FILE window.open; 11354 dead-status wording; 28384 snippet handling                       |
| `chunk-LRlLUPdV.js` | `c0631b664fe4f372b71259f06143ebce3b933231a5cb116b017441cd1f4e4f5d` | 36245 email position; 36423 email step; 38787 totalActions; 43261 email dialog; 44491 native timers |
| `main-ZOY6MVHD.js`  | `994d410adb5450fdaf0456365baf85c242b1aca8f8422e7e4b0c196edeaa95e1` | 4847 status enum; 5086 type enum; 5181 visibility enum                                              |
| `chunk-iu3pkkUO.js` | `de374264a1bdccb6c8757afc629b000099f7bf40b580274be722329fc477be15` | 0 duplicate type enum                                                                               |
| `chunk-CKm1LvK1.js` | `4e1ddb386457deea007c50b70dd7cfc224c3613c67bd9ddac7872dc0a0eb723e` | 23284 maxActions20; 25659 addAction guard; 34007 disabled at limit                                  |
| `chunk-CQVXAMys.js` | `b35ccad72ce4a363d4d608018dbbfe348b122de25e105c65497fe1a7745b31d7` | 236 storage base URL; 374 upload POST and event observation                                         |
| `chunk-CYR9B6Gg.js` | `9d0dfa2085c177ab218059c82a4b092785b9290f60343b5b04c2919fd06cadc9` | 181 snippet base URL; 446 byte-size validation                                                      |

Reused primary service/detail REA parent:
`ev_d998f84f3925be419daf068948214c6d8e2996cf7d0a5ebad89ceceb2bd47eaf`.
Reused widget/timer REA parent:
`ev_2fc5b1122bc6c06b8f9429af0288595724f1f4fec504f4c0bb3ec30a8a0edd7f`.
These retained investigation records were reused rather than redundantly regenerated.

New enum-focused REA parent:
`ev_2a272292f603a6a15288194d51e8a640d14535ecdfd2f920164bc7b15a2e6b9a`,
summary `ev_abdf661472c1296e5fa11f880f063ee8fe7502f157365c531fd6ebf8beea375f`.
Two selected scripts, 24,730 text bytes, zero parse failures, 39 unselected files.

New current action-form REA parent:
`ev_8b0100228ed3f421f6dfd0c29767909c013548b2836b9fb18069a91099ee0a58`,
summary `ev_fbb14d2d78239a593246252634ec6ac9845b6a22379ed7788fda96254134f53d`.
One selected script, 36,174 text bytes, zero parse failures, seven unselected files
at analysis time. Dynamic/framework semantics remain partial.

New storage/snippet-service REA parent:
`ev_eb709c261ea107f7469d794d06b312a40a9cb4d20b80f33117dc4484af7881d8`,
summary `ev_93ffd96748358111bc0ef071454458bdee4351769e14b6f45c04a79b8f41529d`.
Two selected scripts, 1,607 text bytes, zero parse failures, nine unselected files.
Static syntax does not claim execution, server validation or full app coverage.

## Implemented validation

Permit FILE type 2 and select `response.file`; preserve the returned signed URL.
For the observed API-host download path, validate exact HTTPS API origin,
credential-free authority, `/storage/serve/b64_` followed by one encoded segment,
nonempty `exp` and `sig`, no extra query fields and no fragment. This is a narrow
download exception to any general recursive-provider-URL rejection. Apply the
existing URL length bound. Do not request the URL during resolution.

Tests cover valid type2 output, missing/non-string/unsafe file values,
unexpected API paths, malformed/extra signed query fields, credentials/fragments,
and no file-body request. A configured email list does not cause an early
unsupported return; a successful ordinary public unlock resolves. Snippet-only
results retain explicit unsupported text within the URL-output UI.

Installed Firefox testing exposed a content-world compatibility issue with the
`URLSearchParams.keys()` iterator. Validation now uses `forEach` to count every
query entry while retaining exact-two-key, duplicate, and extra-field rejection.
Chrome/Firefox file fixtures cover the same signed URL without fetching its body.
